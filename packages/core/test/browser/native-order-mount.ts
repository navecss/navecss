/**
 * Renders a stylesheet in the test page and reads one computed value, the way the real-engine
 * native-order tests do: at a stated viewport width, the element reached by the keyboard where
 * the row says so, every wait on a condition and never on a delay.
 */
import postcss from 'postcss'
import { expect, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import type { AtomDefinition } from '../../src/atoms.ts'

import { navePlugin } from '../../src/postcss.ts'

export interface Placement {
  /**
  Whether the element is reached by the keyboard (Tab) before it is read.
   */
  readonly focused: boolean
  readonly html: string
  /**
  The pseudo-element read instead of the element itself.
   */
  readonly pseudo?: '::before' | undefined
  /**
  The CSS selector of the element, in `html`.
   */
  readonly selector: string
  /**
  The viewport width in CSS px.
   */
  readonly width: number
}

const HEIGHT = 800

/**
 * Sets the test page's viewport width and waits until the page reports it.
 */
async function setWidth(width: number): Promise<void> {
  await page.viewport(width, HEIGHT)
  await vi.waitFor(() => {
    expect(window.innerWidth).toBe(width)
  })
}

/**
 * Replaces the page's stylesheet and body with `css` and `placement.html`, and returns the
 * element, keyboard-focused when the placement says so.
 */
export async function mountPlacement(css: string, placement: Placement): Promise<Element> {
  await setWidth(placement.width)
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  document.body.innerHTML = placement.html
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = css
  document.head.append(style)
  const element = document.querySelector(placement.selector)
  if (element === null) throw new Error(`no ${placement.selector} in: ${placement.html}`)
  if (placement.focused) await tabTo(element)
  return element
}

/**
 * Reaches `element` with the Tab key. The first Tab in a page Firefox has just given focus lands
 * on the document itself, so the key is pressed again, a few times at most, until the element has
 * it: the element is the only thing in the page that takes focus.
 */
async function tabTo(element: Element): Promise<void> {
  for (let presses = 0; presses < 3 && document.activeElement !== element; presses++) {
    await userEvent.tab()
  }
  await vi.waitFor(() => {
    expect(document.activeElement).toBe(element)
  })
}

/**
 * The computed `property` (kebab case) of the element `placement` describes, or of its
 * pseudo-element, under `css`.
 */
export async function computed(
  css: string,
  placement: Placement,
  property: string,
): Promise<string> {
  const element = await mountPlacement(css, placement)
  return getComputedStyle(element, placement.pseudo).getPropertyValue(property)
}

/**
 * The PostCSS host's output for `css`, run in the page. The plugin reads `process.env` to know
 * whether it runs under Turbopack before it reports a warning, and a page has no `process`.
 */
export async function viaPostcssInPage(
  css: string,
  extend?: Record<string, AtomDefinition>,
): Promise<string> {
  if (typeof process === 'undefined') vi.stubGlobal('process', { env: {} })
  const plugin = navePlugin(extend === undefined ? {} : { extend })
  const result = await postcss([plugin]).process(css, { from: undefined })
  return result.css
}
