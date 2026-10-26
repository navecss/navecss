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
 * The computed value of `property` on the element matching `selector`.
 */
export function computed(page: Page, selector: string, property: string): Promise<string> {
  // A string, because this package's type check has no DOM library to name `document` in.
  return page.evaluate<string>(
    `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).getPropertyValue(${JSON.stringify(property)})`,
  )
}

/**
 * Whether the Chromium Playwright launches is installed, so a row can skip where it is not. Where
 * CI is set, its absence fails the file that asks.
 */
export const HAS_CHROMIUM =
  skipReason(existsSync(chromium.executablePath()) ? undefined : 'Chromium is not installed') ===
  undefined
