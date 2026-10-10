/**
 * The page a browser test builds: the built tokens and the built stylesheet as consumer sheets in
 * the document, one scene mounted through the built wrappers, and the waits a real layout needs.
 */
import type { ElementType, ReactElement, ReactNode } from 'react'

import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { commands } from 'vitest/browser'

/**
The built tokens' text and the built stylesheet's, as the packages ship them.
 */
export { default as stylesheet } from '../../../dist/styles.css?raw'
export { default as tokens } from '@navecss/tokens/css?raw'

export interface Page {
  readonly container: HTMLElement
  readonly dispose: () => void
}

/**
 * `createElement` for a scene of parts whose prop types are Base UI's: a scene passes `data-*`
 * attributes and ARIA state, which a typed call would reject, and what these tests check is what
 * the engine does with them.
 */
export const el = (
  type: unknown,
  props: Readonly<Record<string, unknown>> = {},
  ...children: ReactNode[]
): ReactElement => createElement(type as ElementType, props, ...children)

const addStyle = (css: string): HTMLStyleElement => {
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = css
  document.head.append(style)
  return style
}

/**
Puts the sheets in the document, in the order given, and removes every one of them again.
 */
export const useSheets = (...sheets: readonly string[]): (() => void) => {
  const styles = sheets.map((css) => addStyle(css))
  return () => {
    for (const style of styles) {
      style.remove()
    }
  }
}

/**
Renders a scene into a fresh container. `dispose` unmounts it and removes the container, and
whatever Base UI portalled out of it.
 */
export const mount = (scene: ReactNode): Page => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  flushSync(() => {
    root.render(scene)
  })
  return {
    container,
    dispose: () => {
      root.unmount()
      container.remove()
    },
  }
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

/**
Waits for an element to exist, then for its box to stop moving: a popup positions itself and
animates in before it is where a person would see it.
 */
export const settled = async (find: () => Element | undefined, frames = 5): Promise<Element> => {
  const deadline = performance.now() + 5000
  let element = find()
  while (element === undefined) {
    if (performance.now() > deadline) {
      throw new Error('the element never appeared')
    }
    await nextFrame()
    element = find()
  }
  let previous = ''
  let stableFor = 0
  while (stableFor < frames) {
    if (performance.now() > deadline) {
      throw new Error('the element never stopped moving')
    }
    await nextFrame()
    const { height, left, top, width } = element.getBoundingClientRect()
    const box = `${String(left)},${String(top)},${String(width)},${String(height)}`
    stableFor = box === previous ? stableFor + 1 : 0
    previous = box
  }
  return element
}

/**
The element with a test id, if the document has one.
 */
export const byTestId = (id: string): HTMLElement | undefined =>
  document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(id)}"]`) ?? undefined

/**
Emulates the page's `prefers-reduced-motion` and checks the page took it.
 */
export const emulateReducedMotion = async (value: 'no-preference' | 'reduce'): Promise<void> => {
  await commands.emulateReducedMotion(value)
  const isReduced = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (isReduced !== (value === 'reduce')) {
    throw new Error(`emulating ${value} did not reach the page`)
  }
}
