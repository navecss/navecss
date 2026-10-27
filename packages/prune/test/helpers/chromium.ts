/**
 * A headless Chromium for the rows that read what a browser computes. They live under
 * `test/chromium`, run by `test:browser`, where the browsers are installed.
 */
import type { Browser, Page } from 'playwright'

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

import { skipReason } from './preconditions.ts'

/**
 * Launches Chromium, runs `body` with a new page and closes the browser, whatever `body` does.
 */
export async function withPage<Result>(
  body: (page: Page, browser: Browser) => Promise<Result>,
): Promise<Result> {
  const browser = await chromium.launch()
  try {
    return await body(await browser.newPage(), browser)
  } finally {
    await browser.close()
  }
}

/**
 * What a page function reads of the browser's globals. This package's type check has no DOM
 * library, so the functions below name only what they use.
 */
interface PageGlobals {
  readonly document: { readonly querySelector: (selector: string) => unknown }
  readonly getComputedStyle: (element: unknown) => {
    readonly getPropertyValue: (property: string) => string
  }
}

/**
 * The computed value of `property` on the element matching `selector`. The selector and the
 * property go in as the function's argument, so no code is built from them.
 */
export function computed(page: Page, selector: string, property: string): Promise<string> {
  return page.evaluate(
    ([chosen, name]) => {
      const { document, getComputedStyle } = globalThis as unknown as PageGlobals
      return getComputedStyle(document.querySelector(chosen)).getPropertyValue(name)
    },
    [selector, property] as const,
  )
}

/**
 * Whether the Chromium Playwright launches is installed, so a row can skip where it is not. Where
 * CI is set, its absence fails the file that asks.
 */
export const HAS_CHROMIUM =
  skipReason(existsSync(chromium.executablePath()) ? undefined : 'Chromium is not installed') ===
  undefined
