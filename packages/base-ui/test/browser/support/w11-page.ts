/**
 * What the Scroll Area, value bar, Avatar and Separator browser tests share: finding the parts a
 * scene names, parking the pointer, and waiting by frames for a layout to be what the test reads.
 */
import { userEvent } from 'vitest/browser'

import { isReachedWithin, MAX_FRAMES } from './frames.ts'
import { byTestId } from './page.ts'

/**
Edges are laid out on a 64th of a pixel; a reading that is meant to be exact is held to this much.
 */
export const TOLERANCE = 0.01

/**
The element a scene names, or the failure that says which one is missing.
 */
export const required = (id: string): HTMLElement => {
  const element = byTestId(id)
  if (element === undefined) {
    throw new Error(`no element with test id ${id}`)
  }
  return element
}

/**
Waits frame by frame until `isDone` holds, and fails saying what never happened if it does not.
 */
export const waitUntil = async (isDone: () => boolean, what: string): Promise<void> => {
  if (!(await isReachedWithin(isDone, MAX_FRAMES))) {
    throw new Error(`never happened: ${what}`)
  }
}

/**
 * Moves the pointer to the bottom-right corner of the viewport, where a scene renders nothing. A
 * pointer stays where the last test left it, and a scene mounted under it is hovered the moment it
 * mounts.
 */
export const parkPointer = async (): Promise<void> => {
  const corner = document.createElement('div')
  corner.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 8px; height: 8px'
  document.body.append(corner)
  await userEvent.hover(corner)
  corner.remove()
}

/**
How far into one another two boxes that only touch may read, which is more than a layout rounds
and far less than the 4px a ring band is wide.
 */
export const TOUCH = 0.05

/**
Whether two boxes overlap by more than boxes that touch do, on both axes.
 */
export const isOverlapping = (first: DOMRect, second: DOMRect): boolean =>
  Math.min(first.right, second.right) - Math.max(first.left, second.left) > TOUCH &&
  Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > TOUCH
