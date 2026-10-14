/**
 * What a test does to the popup a scene renders: finds its parts, opens it and closes it.
 */
import { userEvent } from 'vitest/browser'

import { byTestId } from './page.ts'
import { appears } from './w8-watch.ts'

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
How a popup is opened: a key on the focused control, or, for the Context Menu, a right click.
 */
export type Opening = 'ArrowDown' | 'Enter' | 'RightClick' | 'Tab'

/**
 * Opens a scene's popup the way its case says and waits for the element to exist. The Context Menu
 * has no keyboard path: Base UI's trigger listens for `contextmenu`, which no key produces in
 * headless Chromium, so a right click opens it.
 */
export const open = async (opening: Opening): Promise<HTMLElement> => {
  const control = required('trigger')
  if (opening === 'Tab') {
    document.body.focus()
    await userEvent.tab()
  } else if (opening === 'RightClick') {
    await userEvent.click(control, { button: 'right' })
  } else {
    control.focus()
    await userEvent.keyboard(`{${opening}}`)
  }
  return appears()
}

/**
 * Closes the open popup by its Close part, or by a click away from it. A modal popup puts an inert
 * layer over the page, which is what a click away hits, so the click is forced to the point and
 * lands on that layer as a pointer's would.
 */
export const closeBy = async (how: 'close' | 'outside'): Promise<void> => {
  await (how === 'close'
    ? userEvent.click(required('close'))
    : userEvent.click(required('outside'), { force: true }))
}

/**
 * Moves the pointer to the bottom-right corner of the viewport, where a scene renders nothing. A
 * pointer stays where the last test left it, and a trigger that is rendered under it is hovered
 * the moment it mounts, so a tooltip can already be open before the test has done anything.
 */
export const parkPointer = async (): Promise<void> => {
  const corner = document.createElement('div')
  corner.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 8px; height: 8px'
  document.body.append(corner)
  await userEvent.hover(corner)
  corner.remove()
}
