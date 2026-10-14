/**
 * A pointer held down on an element, which the user-event commands do not offer: a press is sent
 * and left, and the pointer can then be moved away with the button still down. The browser keeps
 * `:active` on the element that was pressed while the button is held, wherever the pointer goes,
 * and `:hover` follows the pointer. That is the only way to read `:active` without `:hover`
 * for a part that does not hold `:active` for a key.
 *
 * The page the test runs in is an iframe of the page the browser's input goes to, so a point in the
 * test's page is placed by the frame's offset and scale.
 */
import { cdp } from 'vitest/browser'

const inTopPage = (x: number, y: number): { readonly x: number; readonly y: number } => {
  const frame = window.frameElement
  if (frame === null) {
    return { x, y }
  }
  const box = frame.getBoundingClientRect()
  const scale = box.width / window.innerWidth
  return { x: box.left + frame.clientLeft + x * scale, y: box.top + frame.clientTop + y * scale }
}

const centreOf = (element: Element): { readonly x: number; readonly y: number } => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

const send = async (
  type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
  point: { readonly x: number; readonly y: number },
  isDown: boolean,
): Promise<void> => {
  await cdp().send('Input.dispatchMouseEvent', {
    button: type === 'mouseMoved' && !isDown ? 'none' : 'left',
    buttons: isDown ? 1 : 0,
    clickCount: type === 'mouseMoved' ? 0 : 1,
    type,
    ...inTopPage(point.x, point.y),
  })
}

/**
Presses the primary button at the centre of the element and leaves it down.
 */
export const pressOn = async (element: Element): Promise<void> => {
  const point = centreOf(element)
  await send('mouseMoved', point, false)
  await send('mousePressed', point, true)
}

/**
Moves the pointer, with the button still down, to the centre of the element.
 */
export const dragTo = async (element: Element): Promise<void> => {
  await send('mouseMoved', centreOf(element), true)
}

/**
Releases the button at the centre of the element.
 */
export const releaseOn = async (element: Element): Promise<void> => {
  await send('mouseReleased', centreOf(element), false)
}
