/// <reference lib="dom" />
/* eslint-disable unicorn/isolated-functions -- the callbacks of page.evaluate run in the browser, where the DOM globals exist */
/**
 * Reading a page of an Astro build in a real Chromium: what an element's computed style says of
 * the properties an atom sets, and waiting for an island to hydrate.
 */
import type { Page } from 'playwright'

import { atoms } from '../../src/atoms.ts'

/**
 * The CSS properties the atom `name` sets, as the browser names them.
 */
export function propertiesOf(name: string): string[] {
  const atom = (atoms as Record<string, { declarations?: Record<string, unknown> }>)[name]
  return Object.keys(atom?.declarations ?? {})
}

/**
 * Each element of `checks` (a selector and the atom that styles it): the computed value of every
 * property the atom sets, by selector.
 */
export async function computedOf(
  page: Page,
  checks: readonly (readonly [selector: string, atom: string])[],
): Promise<Record<string, Record<string, string>>> {
  const wanted = checks.map(([selector, atom]) => ({ selector, properties: propertiesOf(atom) }))
  return await page.evaluate((list) => {
    const found: Record<string, Record<string, string>> = {}
    for (const { selector, properties } of list) {
      const element = document.querySelector(selector)
      found[selector] = Object.fromEntries(
        properties.map((property) => [
          property,
          element ? getComputedStyle(element).getPropertyValue(property) : '(no element)',
        ]),
      )
    }
    return found
  }, wanted)
}

/**
 * Whether the element `selector` is in the page.
 */
export async function isPresent(page: Page, selector: string): Promise<boolean> {
  return await page.evaluate((target) => document.querySelector(target) !== null, selector)
}

/**
 * Whether the element `selector` carries `attribute`.
 */
export async function hasAttribute(
  page: Page,
  selector: string,
  attribute: string,
): Promise<boolean> {
  return await page.evaluate(
    ([target, name]) => document.querySelector(target!)?.hasAttribute(name!) === true,
    [selector, attribute],
  )
}

/**
 * The computed value of `property` on `selector`.
 */
export async function styleOf(page: Page, selector: string, property: string): Promise<string> {
  return await page.evaluate(
    ([target, name]) => {
      const element = document.querySelector(target!)
      return element ? getComputedStyle(element).getPropertyValue(name!) : '(no element)'
    },
    [selector, property],
  )
}

/**
 * Sets a marker on `window`, which survives a soft navigation and not a page load.
 */
export async function markPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- a property of `window` is the marker: it survives a soft navigation and not a page load
    ;(globalThis as unknown as { __soft?: string }).__soft = 'kept'
  })
}

/**
 * Whether the marker `markPage` set is still there.
 */
export async function isMarked(page: Page): Promise<boolean> {
  return await page.evaluate(() => (globalThis as unknown as { __soft?: string }).__soft === 'kept')
}

/**
 * Reads from a page the dev server may reload as the read is made, which fails with a destroyed
 * context: the read is made again, on the page that follows.
 */
export async function readSettled<T>(page: Page, read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await read()
    } catch (error) {
      const isNavigating = String(error).includes('Execution context was destroyed')
      if (!isNavigating || attempt === 5) throw error
      await page.waitForLoadState('load')
    }
  }
}
