import type { Page } from 'playwright'

import { expect } from 'vitest'

/**
 * Next.js 16.2.0 on webpack sometimes answers the browser's first request for `/` with a 500 after
 * finding one of its own manifests empty, and printing either
 * `SyntaxError: Unexpected end of JSON input` or `Error: Manifest file is empty`. The test's own
 * request for the same route, made just before, got 200. The 500 page has no stylesheet, so a row
 * that waits for a rule in the open document can only wait out its deadline. The row ends there
 * at once with the server's output, and runs again, once and from a fresh app, only when the
 * server printed one of those two while it answered the request.
 */

const MANIFEST_READS = [
  { printed: 'SyntaxError: Unexpected end of JSON input', named: 'Unexpected end of JSON input' },
  { printed: 'Error: Manifest file is empty', named: 'Manifest file is empty' },
] as const

/**
 * The retry of such a row: a failed attempt runs again only when its message holds the sentence
 * that names one of those reads after a 500. The server's own output, which follows the sentence,
 * can never trigger a retry.
 */
export const RETRY_ON_MANIFEST_READ = {
  count: 1,
  condition: /answered 500 and Next\.js printed "/u,
}

const earlier = new Set<string>()

/**
 * Opens `url` in `page`, once the dev server has answered it. A server error ends the attempt: the
 * failure says which address answered and what the server printed. When the server printed one of
 * the manifest reads, the attempt that follows prints a note, since vitest drops what a failed
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
    console.warn(
      'An earlier attempt of this row ended with Next.js answering 500 (a manifest read)',
    )
  }
  const logged = output().length
  const response = await page.goto(url, { waitUntil: 'load' })
  const status = response?.status() ?? 0
  if (status < 500) return
  const printed = output()
  const read = MANIFEST_READS.find(({ printed: text }) => printed.slice(logged).includes(text))
  if (read) earlier.add(row)
  throw new Error(
    `${url} ${read ? `answered ${status} and Next.js printed "${read.named}"` : `answered ${status}`}, so the browser got an error page with no stylesheet:\n${printed.slice(-2000)}`,
  )
}
