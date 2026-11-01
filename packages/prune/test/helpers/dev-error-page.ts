import type { Page } from 'playwright'

import { expect } from 'vitest'

/**
 * Next.js 16.2.0 on webpack, now and then, answers the browser's first request for `/` with a 500
 * after printing `SyntaxError: Unexpected end of JSON input` from its own render, a request after
 * its server answered the test's own request for the same route with 200. The page it sends has
 * no stylesheet, so a row that waits for a rule in the open document can only wait out its
 * deadline. The row ends there at once instead, with the server's output; it runs again, once and
 * from a fresh app, when the server printed that read, and after nothing else.
 */

const JSON_READ = 'SyntaxError: Unexpected end of JSON input'

/**
 * The sentence that opens the failure when the server printed that read. The retry keys on it, so
 * the server's own output, which follows it, can never trigger a retry.
 */
const READ_SENTENCE = 'answered 500 and Next.js printed "Unexpected end of JSON input"'

/**
 * The retry of such a row: a failed attempt runs again only when its message holds the sentence.
 */
export const RETRY_ON_JSON_READ = { count: 1, condition: /answered 500 and Next\.js printed "/u }

const earlier = new Set<string>()

/**
 * Opens `url` in `page`, once the dev server has answered it. A server error ends the attempt: the
 * failure says which address answered and what the server printed. When the server printed the
 * truncated JSON read, the attempt that follows prints a note, since vitest drops what a failed
 * attempt printed.
 */
export async function openPage(
  page: Pick<Page, 'goto'>,
  url: string,
  output: () => string,
): Promise<void> {
  const row = expect.getState().currentTestName ?? ''
  if (earlier.delete(row)) {
    // eslint-disable-next-line no-console -- the output of a run that retried is where the 500 is named
    console.warn('An earlier attempt of this row ended with Next.js answering 500 (a JSON read)')
  }
  const response = await page.goto(url, { waitUntil: 'load' })
  const status = response?.status() ?? 0
  if (status < 500) return
  const printed = output()
  const isRead = printed.includes(JSON_READ)
  if (isRead) earlier.add(row)
  throw new Error(
    `${url} ${isRead ? READ_SENTENCE : `answered ${status}`}, so the browser got an error page with no stylesheet:\n${printed.slice(-2000)}`,
  )
}
