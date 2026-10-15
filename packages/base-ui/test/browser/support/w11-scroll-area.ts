/**
 * The Scroll Area scene the browser tests read: a 360 by 220 px Root whose content overflows both
 * axes, a vertical and a horizontal `Scrollbar` (kept mounted, so each is there to be measured
 * before it has measured anything) each holding a `Thumb`, and a `Corner`. Every part carries a test
 * id, and the scene is built through the wrapper, so the classes are the ones the package ships.
 */
import type { ReactNode } from 'react'

import { userEvent } from 'vitest/browser'

import { ScrollArea } from '../../../dist/scroll-area/index.js'
import { framesLater } from './frames.ts'
import { byTestId, el as h, settled } from './page.ts'
import { required, waitUntil } from './w11-page.ts'

export const ROOT_WIDTH = 360
export const ROOT_HEIGHT = 220

export interface ScrollAreaParts {
  /**
  Absent while nothing overflows: Base UI renders no Corner then.
   */
  readonly corner: HTMLElement | undefined
  readonly root: HTMLElement
  readonly scrollbarX: HTMLElement
  readonly scrollbarY: HTMLElement
  readonly thumbX: HTMLElement
  readonly thumbY: HTMLElement
  readonly viewport: HTMLElement
}

/**
Content that overflows the Viewport on both axes, whatever the gutter takes.
 */
export const overflowingContent = (): ReactNode =>
  h('div', { style: { height: 600, width: 800 } }, 'Content')

/**
Content that fits inside the Viewport with its padding to spare.
 */
export const fittingContent = (): ReactNode =>
  h('div', { style: { height: 50, width: 100 } }, 'Content')

/**
The Scroll Area with the given content in its `Content` part.
 */
export const scrollArea = (content: ReactNode): ReactNode =>
  h(
    ScrollArea.Root,
    { 'data-testid': 'root', style: { height: ROOT_HEIGHT, width: ROOT_WIDTH } },
    h(ScrollArea.Viewport, { 'data-testid': 'viewport' }, h(ScrollArea.Content, {}, content)),
    h(
      ScrollArea.Scrollbar,
      { 'data-testid': 'scrollbar-y', keepMounted: true, orientation: 'vertical' },
      h(ScrollArea.Thumb, { 'data-testid': 'thumb-y' }),
    ),
    h(
      ScrollArea.Scrollbar,
      { 'data-testid': 'scrollbar-x', keepMounted: true, orientation: 'horizontal' },
      h(ScrollArea.Thumb, { 'data-testid': 'thumb-x' }),
    ),
    h(ScrollArea.Corner, { 'data-testid': 'corner' }),
  )

/**
The parts the scene rendered.
 */
export const partsOf = (): ScrollAreaParts => ({
  corner: byTestId('corner'),
  root: required('root'),
  scrollbarX: required('scrollbar-x'),
  scrollbarY: required('scrollbar-y'),
  thumbX: required('thumb-x'),
  thumbY: required('thumb-y'),
  viewport: required('viewport'),
})

/**
 * Waits until Base UI has measured the Viewport (a Thumb is hidden until it has) and the Root's box
 * has stopped moving, and returns the parts. With `overflow` it also waits for the Viewport to
 * report the overflow on both axes, which is what the gutter is keyed on.
 */
export const measured = async (overflow: 'both' | 'none'): Promise<ScrollAreaParts> => {
  await settled(() => document.querySelector('[data-testid="root"]') ?? undefined)
  const parts = partsOf()
  await waitUntil(
    () =>
      getComputedStyle(parts.thumbX).visibility !== 'hidden' &&
      getComputedStyle(parts.thumbY).visibility !== 'hidden',
    'Base UI measured the Viewport',
  )
  if (overflow === 'both') {
    await waitUntil(
      () =>
        Object.hasOwn(parts.viewport.dataset, 'hasOverflowX') &&
        Object.hasOwn(parts.viewport.dataset, 'hasOverflowY'),
      'the Viewport reported the overflow on both axes',
    )
  }
  await framesLater(5)
  return parts
}

/**
Scrolls the Viewport and waits for Base UI to move the Thumbs to where it now is.
 */
export const scrollTo = async (viewport: HTMLElement, left: number, top: number): Promise<void> => {
  viewport.scrollTo({ behavior: 'instant', left, top })
  await framesLater(5)
}

/**
The Viewport's furthest scroll offsets.
 */
export const maximumScroll = (viewport: HTMLElement): { left: number; top: number } => ({
  left: viewport.scrollWidth - viewport.clientWidth,
  top: viewport.scrollHeight - viewport.clientHeight,
})

/**
A strip's thin dimension: its width if it is vertical, its height if it is horizontal.
 */
export const thinDimension = (scrollbar: HTMLElement): number => {
  const { height, width } = scrollbar.getBoundingClientRect()
  return scrollbar.dataset.orientation === 'vertical' ? width : height
}

/**
 * A point across the strip's thin dimension, `across` px from its start edge, on the line through
 * the Thumb's centre along the strip. That line crosses both the strip and the Thumb, so a walk
 * along it sees each of them.
 */
export const pointAcross = (
  scrollbar: HTMLElement,
  thumb: HTMLElement,
  across: number,
): { x: number; y: number } => {
  const strip = scrollbar.getBoundingClientRect()
  const mark = thumb.getBoundingClientRect()
  return scrollbar.dataset.orientation === 'vertical'
    ? { x: strip.left + across, y: mark.top + mark.height / 2 }
    : { x: mark.left + mark.width / 2, y: strip.top + across }
}

/**
 * Presses the pointer at a point of the strip, moves it `distance` px along the strip and releases
 * it, as a person drags. The point is given relative to the strip's box, `across` from its start
 * edge and `along` from its start; the strip is both the source and the target, since that is
 * the element the pointer is over at both ends and a press on the Thumb inside it hit-tests to a
 * descendant.
 */
export const pressAndMove = async (
  scrollbar: HTMLElement,
  from: { across: number; along: number },
  distance: number,
): Promise<void> => {
  const isVertical = scrollbar.dataset.orientation === 'vertical'
  const start = isVertical ? { x: from.across, y: from.along } : { x: from.along, y: from.across }
  const end = isVertical
    ? { x: start.x, y: start.y + distance }
    : { x: start.x + distance, y: start.y }
  await userEvent.dragAndDrop(scrollbar, scrollbar, { sourcePosition: start, targetPosition: end })
  await framesLater(5)
}

/**
 * Where on the strip the Thumb's centre is, relative to the strip's box: `across` from the start
 * edge and `along` from its start.
 */
export const thumbCentre = (
  scrollbar: HTMLElement,
  thumb: HTMLElement,
): { across: number; along: number } => {
  const strip = scrollbar.getBoundingClientRect()
  const mark = thumb.getBoundingClientRect()
  const isVertical = scrollbar.dataset.orientation === 'vertical'
  return isVertical
    ? {
        across: mark.left + mark.width / 2 - strip.left,
        along: mark.top + mark.height / 2 - strip.top,
      }
    : {
        across: mark.top + mark.height / 2 - strip.top,
        along: mark.left + mark.width / 2 - strip.left,
      }
}

/**
The Corner, which a Scroll Area that overflows on both axes renders.
 */
export const cornerOf = (parts: ScrollAreaParts): HTMLElement => {
  if (parts.corner === undefined) {
    throw new Error('the Scroll Area rendered no Corner')
  }
  return parts.corner
}
