/**
 * Measuring what a styled part paints, in the states a scene can put it in: at rest, with each
 * attribute state its atoms select set on the element, under keyboard `:focus-visible`, and with
 * reduced motion emulated. The same measurement runs on Base UI's bare part, the package's part and
 * the copy's part, one scene at a time, so the layout is the same for all three.
 */
import { createElement } from 'react'
import { userEvent } from 'vitest/browser'

import type { Props, Source } from '../scenes.ts'
import type { AttributeState, PaintPart, PaintSubpath } from './browser-paths.ts'

import { framesLater, MAX_FRAMES, nextFrame } from '../../browser/support/frames.ts'
import { emulateReducedMotion, mount, type Page, settled } from '../../browser/support/page.ts'
import { scenes } from '../scenes.ts'
import { navigationMenuOpenProps, openProps } from '../states.ts'
import { type Measured, snapshotOf } from './browser-paint.ts'

const isRepeating = (animation: Animation): boolean =>
  animation.effect?.getComputedTiming().iterations === Infinity

const isAnimating = (): boolean =>
  document.getAnimations().some((animation) => !isRepeating(animation))

const isStarting = (): boolean =>
  isAnimating() || document.querySelector('[data-starting-style]') !== null

/**
Waits, a count of frames at most, until nothing is moving by the given measure and it has stayed so
for three frames. A repeating animation is not moving: it never ends.
 */
const untilStill = async (isMoving: () => boolean): Promise<void> => {
  let quietFor = 0
  for (let frame = 0; quietFor < 3; frame += 1) {
    if (frame >= MAX_FRAMES) throw new Error('the page never came to rest')
    await nextFrame()
    quietFor = isMoving() ? 0 : quietFor + 1
  }
}

const untilAnimationsEnd = (): Promise<void> => untilStill(isAnimating)

const partElement = (key: string): HTMLElement | undefined =>
  document.querySelector<HTMLElement>(`[data-part="${CSS.escape(key)}"]`) ?? undefined

/**
 * The ways a scene is rendered so that every part of its component renders something to measure: a
 * closed panel renders none, an Avatar shows its image or its fallback and never both, and a Scroll
 * Area has a corner only where both scrollbars are. A part is measured in the first variant that
 * renders it.
 */
const PICTURE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8'/%3E%3C/svg%3E"

const NO_PICTURE = 'data:image/png;base64,AAAA'

const SCENE_VARIANTS: Readonly<Record<string, readonly Record<string, Props>[]>> = {
  accordion: [{ 'Accordion.Root': { defaultValue: ['a'] } }],
  avatar: [{ 'Avatar.Image': { src: PICTURE } }, { 'Avatar.Image': { src: NO_PICTURE } }],
  collapsible: [{ 'Collapsible.Root': { defaultOpen: true } }],
  'navigation-menu': [navigationMenuOpenProps()],
  'scroll-area': [
    {
      'ScrollArea.Content': {
        children: createElement('div', { style: { height: 600, width: 800 } }, 'Content'),
      },
      'ScrollArea.Root': { style: { height: 220, width: 360 } },
    },
  ],
}

const variantsOf = (subpath: string): Record<string, Props>[] =>
  (SCENE_VARIANTS[subpath] ?? [{}]).map((variant) => ({ ...openProps(), ...variant }))

const stateLabel = (attributes: readonly AttributeState[]): string =>
  attributes
    .map(({ name, value }) => (value === '' ? `[${name}]` : `[${name}="${value}"]`))
    .join('')

const restore = (element: HTMLElement, name: string, value: string | null): void => {
  element.toggleAttribute(name, value !== null)
  if (value !== null) element.setAttribute(name, value)
}

const withAttributes = async (
  element: HTMLElement,
  attributes: readonly AttributeState[],
  read: () => void,
): Promise<void> => {
  const before = attributes.map(({ name }) => [name, element.getAttribute(name)] as const)
  for (const { name, value } of attributes) element.setAttribute(name, value)
  try {
    await untilAnimationsEnd()
    read()
  } finally {
    for (const [name, value] of before) restore(element, name, value)
    await untilAnimationsEnd()
  }
}

const record = (measured: Measured, part: PaintPart, state: string, element: HTMLElement): void => {
  measured.snapshots.set(`${part.key} ${state}`, snapshotOf(element))
  for (const pseudo of part.pseudoElements) {
    measured.snapshots.set(`${part.key} ${pseudo} ${state}`, snapshotOf(element, pseudo))
  }
}

const MOST_RENDER_FRAMES = 60

/**
Waits, a count of frames at most, for every part to be in the document: a part that renders later
(an image once it has loaded) is waited for, and one this variant never renders is left to another.
 */
const untilRendered = async (parts: readonly PaintPart[]): Promise<void> => {
  for (let frame = 0; frame < MOST_RENDER_FRAMES; frame += 1) {
    if (parts.every((part) => partElement(part.key) !== undefined)) return
    await nextFrame()
  }
}

interface Scene {
  readonly parts: readonly PaintPart[]
  readonly source: Source
  readonly subpath: string
}

const mountVariant = async (
  { parts, source, subpath }: Scene,
  variant: Record<string, Props>,
): Promise<Page> => {
  const scene = scenes[subpath]
  if (scene === undefined) throw new Error(`no scene for ${subpath}`)
  const page = mount(scene.render(source, { props: variant }))
  try {
    await settled(() => document.querySelector('[data-part]') ?? undefined)
    await untilRendered(parts)
    await untilStill(isStarting)
  } catch (error) {
    page.dispose()
    throw error
  }
  return page
}

/**
Runs `measurePresent` on the parts each variant of the scene renders, once per part, and returns
the parts no variant rendered.
 */
const inEachVariant = async (
  scene: Scene,
  parts: readonly PaintPart[],
  measurePresent: (present: readonly PaintPart[]) => Promise<void>,
): Promise<PaintPart[]> => {
  let remaining = [...parts]
  for (const variant of variantsOf(scene.subpath)) {
    if (remaining.length === 0) break
    const page = await mountVariant({ ...scene, parts: remaining }, variant)
    try {
      const present = remaining.filter((part) => partElement(part.key) !== undefined)
      await measurePresent(present)
      remaining = remaining.filter((part) => !present.includes(part))
    } finally {
      page.dispose()
    }
  }
  return remaining
}

const measureStates = async (part: PaintPart, measured: Measured): Promise<void> => {
  const element = partElement(part.key)!
  record(measured, part, 'rest', element)
  for (const attributes of part.states) {
    await withAttributes(element, attributes, () => {
      record(measured, part, stateLabel(attributes), element)
    })
  }
}

const measureRest = async (scene: Scene, measured: Measured): Promise<void> => {
  const missing = await inEachVariant(scene, scene.parts, async (present) => {
    for (const part of present) await measureStates(part, measured)
  })
  for (const part of missing) {
    measured.notMeasured.push(`${part.key}: the scene renders no such part`)
  }
}

const measureReduced = async (scene: Scene, measured: Measured): Promise<void> => {
  const guarded = scene.parts.filter((part) => part.isGuarded)
  await emulateReducedMotion('reduce')
  try {
    await inEachVariant(scene, guarded, (present) => {
      for (const part of present) record(measured, part, 'reduced-motion', partElement(part.key)!)
      return Promise.resolve()
    })
  } finally {
    await emulateReducedMotion('no-preference')
  }
}

const MOST_TABS = 40

/**
Whether the element can have DOM focus at all: an option of a list takes the list's highlight, never
the focus, and has nothing for `:focus-visible` to match.
 */
const canTakeFocus = (element: HTMLElement): boolean =>
  element.tabIndex >= 0 || element.hasAttribute('tabindex')

/**
Tabs until the element has focus, and says whether it did.
 */
const hasTabbedTo = async (element: HTMLElement): Promise<boolean> => {
  for (let presses = 0; presses < MOST_TABS; presses += 1) {
    await userEvent.tab()
    if (document.activeElement === element) return true
    if (!element.isConnected) return false
  }
  return false
}

/**
 * Whether the element has keyboard focus (`:focus-visible`) after the page was tabbed. When the tab
 * order does not reach it (a popup's items take focus from the arrow keys, and a Tab may close the
 * popup), the Tab has still put the page in keyboard modality, and the element is focused by script.
 */
const isFocusVisibleFromKeyboard = async (element: HTMLElement): Promise<boolean> => {
  const isReached = await hasTabbedTo(element)
  if (!isReached && element.isConnected) {
    element.focus()
    await framesLater(1)
  }
  return document.activeElement === element && element.matches(':focus-visible')
}

const measureFocus = async (scene: Scene, part: PaintPart, measured: Measured): Promise<void> => {
  await inEachVariant(scene, [part], async () => {
    const element = partElement(part.key)!
    if (!canTakeFocus(element)) {
      measured.unfocusable.push(part.key)
    } else if (await isFocusVisibleFromKeyboard(element)) {
      await untilAnimationsEnd()
      record(measured, part, 'focus-visible', element)
      element.blur()
    } else {
      measured.notMeasured.push(`${part.key}: keyboard focus did not reach it`)
    }
  })
}

/**
Measures every styled part of a subpath, in the scene of that subpath rendered from the source.
 */
export const measure = async (subpath: PaintSubpath, source: Source): Promise<Measured> => {
  const scene: Scene = { parts: subpath.parts, source, subpath: subpath.subpath }
  const measured: Measured = { notMeasured: [], snapshots: new Map(), unfocusable: [] }
  const focusable = subpath.parts.filter((part) => part.isFocusable)
  await measureRest(scene, measured)
  await measureReduced(scene, measured)
  for (const part of focusable) await measureFocus(scene, part, measured)
  return measured
}
