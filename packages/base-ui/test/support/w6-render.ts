/**
 * Small builders for the overlay-completion render tests: a part of a subpath made as an element
 * with its `data-part` marker, the trees of the components the shared scenes do not cover, a
 * settle that waits out Base UI's timers, and a recorder for the attributes a part carries on its
 * way through an open and a close. They sit on `react.ts`, `dom.ts` and `sources.ts` as they are.
 */
/* eslint-disable max-params -- `el` is the builder every tree is made of: source, subpath, part, props, then children */
import { createElement, type ElementType, type ReactElement, type ReactNode } from 'react'

import type { Props, Source } from './scenes.ts'
import type { Pair } from './vocabulary-pairs.ts'

import { partsNamed } from './dom.ts'
import { act } from './react.ts'
import { topName } from './subpaths.ts'

/**
Waits for Base UI's timers (focus, open delays, exit) to run, inside `act`.
 */
export const settle = (milliseconds = 60): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  })

/**
A part of a subpath's export. Throws, naming the part, where the export lacks it, so a missing
wrapper reds the test that needs it instead of rendering nothing.
 */
export const partOf = (source: Source, subpath: string, name: string): ElementType => {
  const ui = source(subpath)
  const found = name === '.' ? ui : ui[name]
  if (found === undefined) {
    throw new Error(`${subpath} has no ${name === '.' ? 'component' : name}`)
  }
  return found as ElementType
}

/**
Whether the installed Base UI's own export has the part (a part younger than the run's Base UI is
absent from it, and so from the wrapper).
 */
export const hasPart = (bare: Source, subpath: string, name: string): boolean =>
  bare(subpath)[name] !== undefined

/**
The marker a part is given: `Combobox.Input`, or `Menubar` for the single component.
 */
export const markerOf = (subpath: string, name: string): string =>
  name === '.' ? topName(subpath) : `${topName(subpath)}.${name}`

/**
A part as an element, with its `data-part` marker (a marker in `props` wins).
 */
export const el = (
  source: Source,
  subpath: string,
  name: string,
  props: Props = {},
  ...children: ReactNode[]
): ReactElement =>
  createElement(
    partOf(source, subpath, name) as never,
    { 'data-part': markerOf(subpath, name), ...props } as never,
    ...children,
  )

export const found = (marker: string): HTMLElement | undefined => partsNamed(marker)[0]

/**
The element of a marker; throws, naming the marker, when it is not rendered.
 */
export const need = (marker: string): HTMLElement => {
  const element = found(marker)
  if (element === undefined) {
    throw new Error(`${marker} is not rendered`)
  }
  return element
}

export const classesOf = (element: Element | undefined): string[] => [...(element?.classList ?? [])]

/**
The `nave-base-ui-*` classes an element carries, sorted.
 */
export const naveClassesOf = (element: Element | undefined): string[] =>
  classesOf(element)
    .filter((name) => name.startsWith('nave-base-ui-'))
    .toSorted((a, b) => a.localeCompare(b))

export interface Seen {
  /**
  Every attribute set or changed, in order, as `[marker, name, value]`.
   */
  readonly log: (readonly [string, string, string])[]
  /**
  The (class, attribute name) pairs of the watched elements, as they were rendered when the
  attribute was seen.
   */
  readonly pairs: Pair[]
  readonly stop: () => void
  /**
  Every attribute each marker's element carried while observed, as `name=value`.
   */
  readonly values: Map<string, Set<string>>
}

const attributesOf = (element: Element): [string, string][] =>
  element.getAttributeNames().map((name) => [name, element.getAttribute(name) ?? ''])

interface Recorder {
  readonly log: (readonly [string, string, string])[]
  readonly markers: readonly string[]
  readonly pairs: Pair[]
  readonly values: Map<string, Set<string>>
}

const noteAttribute = (
  recorder: Recorder,
  element: HTMLElement,
  name: string,
  value: string,
): void => {
  const marker = element.dataset.part
  if (marker === undefined || !recorder.markers.includes(marker)) {
    return
  }
  recorder.values.set(
    marker,
    (recorder.values.get(marker) ?? new Set<string>()).add(`${name}=${value}`),
  )
  recorder.pairs.push(...classesOf(element).map((cls) => [cls, name] as const))
  recorder.log.push([marker, name, value])
}

const noteAttributes = (recorder: Recorder, element: HTMLElement): void => {
  for (const [name, value] of attributesOf(element)) {
    noteAttribute(recorder, element, name, value)
  }
}

const noteSubtree = (recorder: Recorder, root: HTMLElement): void => {
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('[data-part]')]) {
    noteAttributes(recorder, element)
  }
}

/**
An attribute change is read from the value it replaced and the value it left, so a value that was
set and replaced within one task is still read.
 */
const noteMutation = (recorder: Recorder, record: MutationRecord): void => {
  const { target } = record
  if (record.type === 'attributes' && target instanceof HTMLElement) {
    const name = record.attributeName ?? ''
    if (record.oldValue !== null) {
      noteAttribute(recorder, target, name, record.oldValue)
    }
    const current = target.getAttribute(name)
    if (current !== null) {
      noteAttribute(recorder, target, name, current)
    }
  }
  for (const node of record.addedNodes) {
    if (node instanceof HTMLElement) {
      noteSubtree(recorder, node)
    }
  }
}

/**
Watches the elements whose `data-part` is one of the markers, from now on: every attribute they
carry when inserted and every attribute change. A transient attribute (`data-starting-style`,
`data-instant`) is only ever there for a frame, so a MutationObserver is the only way to read it.
 */
export const watch = (markers: readonly string[]): Seen => {
  const recorder: Recorder = { log: [], markers, pairs: [], values: new Map() }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      noteMutation(recorder, record)
    }
  })
  observer.observe(document.body, {
    attributeOldValue: true,
    attributes: true,
    childList: true,
    subtree: true,
  })
  // Elements already in the document are read once, so an attribute set before the watch counts.
  for (const marker of markers) {
    for (const element of partsNamed(marker)) {
      noteAttributes(recorder, element)
    }
  }
  return {
    log: recorder.log,
    pairs: recorder.pairs,
    stop: () => {
      observer.disconnect()
    },
    values: recorder.values,
  }
}

/**
Whether the watch saw the marker's element carry `name` (with `value`, when one is given).
 */
export const hasSeenAttribute = (
  seen: Seen,
  marker: string,
  name: string,
  value?: string,
): boolean => {
  const entries = seen.values.get(marker)
  if (entries === undefined) {
    return false
  }
  return value === undefined
    ? [...entries].some((entry) => entry.startsWith(`${name}=`))
    : entries.has(`${name}=${value}`)
}

/**
The values a marker's attribute took, in the order the watch saw them, repeats left out.
 */
export const valuesInOrder = (seen: Seen, marker: string, name: string): string[] =>
  seen.log
    .filter(([logged, attribute]) => logged === marker && attribute === name)
    .map((entry) => entry[2])
    .filter((value, index, all) => value !== all[index - 1])

/**
Puts a stylesheet in the document for the length of a test and returns the call that takes it out.
 */
export const addStyle = (text: string): (() => void) => {
  const style = document.createElement('style')
  style.textContent = text
  document.head.append(style)
  return () => {
    style.remove()
  }
}

/**
A literal `transition-duration` on every popup marker: jsdom runs Base UI's exit only when the
element has one, and sets `data-ending-style` for it.
 */
export const transitionOn = (markers: readonly string[]): string =>
  markers
    .map(
      (marker) =>
        `[data-part="${marker}"] { transition-property: opacity; transition-duration: 30ms }`,
    )
    .join('\n')

/**
jsdom has no `getAnimations`, and without it Base UI unmounts an exiting popup in the same commit
that closes it, so `data-ending-style` is never in the document. An element with no animations
makes Base UI wait a frame for them, which is where the exit attribute can be read. Returns the
call that takes the stand-in out again.
 */
export const withEmptyAnimations = (): (() => void) => {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: (): [] => [],
  })
  return () => {
    Reflect.deleteProperty(Element.prototype, 'getAnimations')
  }
}
