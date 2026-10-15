/**
 * Render helpers the feedback and navigation render files share: the props that put each scene in
 * its fullest state, the Nave classes of an element, a document read at rest, and the pass-through
 * part each subpath is checked with.
 */
import { vi } from 'vitest'

import type { ElementRecord } from './dom.ts'
import type { Props } from './scenes.ts'

import { describeDocument } from './dom.ts'
import { act } from './react.ts'
import { navigationMenuOpenProps } from './states.ts'

/**
The props that put each of the seven's scene in the state that renders every part its Table P rows
name: the Navigation Menu open, the Toast scene with four toasts under a limit of five (none
limited), and the rest as they are.
 */
export const fullProps = (): Record<string, Props> => ({
  ...navigationMenuOpenProps(),
  'Toast.Adder': { count: 4 },
  'Toast.Provider': { limit: 5 },
})

/**
The unstyled parts that render an element and that the wrappers pass through, by subpath: what
`ref` and `className` are checked on beside the styled parts. `Toast.Provider` and `Toast.Portal`
render no element of their own and are not rows.
 */
export const PASS_THROUGHS: Readonly<Record<string, readonly string[]>> = {
  'navigation-menu': [
    'NavigationMenu.Root',
    'NavigationMenu.Item',
    'NavigationMenu.Positioner',
    'NavigationMenu.Viewport',
  ],
  'scroll-area': ['ScrollArea.Content'],
  toast: ['Toast.Positioner', 'Toast.Content'],
}

/**
Progress's value for an indeterminate bar.
 */
// eslint-disable-next-line unicorn/no-null -- null is Progress's indeterminate value
export const INDETERMINATE = null

export const naveClassesOf = (element: Element): string[] =>
  element.className.split(/\s+/).filter((name) => name.startsWith('nave-'))

export const settle = (milliseconds: number): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  })

const TRANSITION_ATTRIBUTES = ['data-starting-style', 'data-ending-style']

const IN_TRANSITION = TRANSITION_ATTRIBUTES.map((name) => `[${name}]`).join(',')

const serialized = (records: readonly ElementRecord[]): string =>
  JSON.stringify(records.map(({ attributes, tag }) => [tag, [...attributes]]))

/**
The document once it is at rest: no element is mid-transition, and two reads a moment apart
agree. Base UI marks an opening part with `data-starting-style` for a frame or two, and which
side of that a read lands on depends on how busy the machine is.
 */
export const describeAtRest = async (): Promise<ElementRecord[]> => {
  let previous = ''
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const records = describeDocument()
    const current = serialized(records)
    if (current === previous && document.querySelector(IN_TRANSITION) === null) {
      return records
    }
    previous = current
    await settle(25)
  }
  throw new Error('the document never came to rest')
}

/**
 * Gives every element the sizes of a viewport whose content is taller and wider than it, the way a
 * browser's layout would (jsdom has none), and returns the function that takes them out.
 */
export const overflowingLayout = (): (() => void) => {
  const sizes: Record<string, number> = {
    clientHeight: 100,
    clientWidth: 100,
    scrollHeight: 500,
    scrollWidth: 500,
  }
  const originals = Object.keys(sizes).map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const,
  )
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value })
  }
  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, name)
      } else {
        Object.defineProperty(HTMLElement.prototype, name, descriptor)
      }
    }
  }
}

/**
 * Makes every image load (jsdom loads none): `new Image()` fires `onload` once its `src` is set.
 * Returns the function that puts the real `Image` back.
 */
export const loadingImages = (): (() => void) => {
  class LoadedImage {
    complete = false
    naturalWidth = 0
    onload: (() => void) | undefined = undefined
    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', LoadedImage)
  return () => {
    vi.unstubAllGlobals()
  }
}

const doNothing = (): void => undefined

const unchanged = (): (() => void) => doNothing

/**
 * The setups a scene is rendered under, to put every part it holds on the page: the Scroll Area's
 * corner shows only when the content overflows both axes, and the Avatar's image only once it has
 * loaded. Each returns its own undo.
 */
export const SETUPS: Readonly<Record<string, readonly (() => () => void)[]>> = {
  avatar: [unchanged, loadingImages],
  'scroll-area': [unchanged, overflowingLayout],
}

const setupsOf = (subpath: string): readonly (() => () => void)[] => SETUPS[subpath] ?? [unchanged]

/**
Runs the work once under each setup of a subpath, taking each out after it.
 */
export const underSetups = async (subpath: string, work: () => Promise<void>): Promise<void> => {
  for (const setup of setupsOf(subpath)) {
    const undo = setup()
    try {
      await work()
    } finally {
      undo()
    }
  }
}
