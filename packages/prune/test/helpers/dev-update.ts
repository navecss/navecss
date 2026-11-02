import { expect } from 'vitest'

import type { DevServer } from './next-dev.ts'

import { RETRY_ON_MANIFEST_READ } from './dev-error-page.ts'
import { before } from './next-dev.ts'

/**
 * What the dev server itself serves for a route, as a sentence: whether the page carries the class
 * an edit gave it, and whether the stylesheet that page links holds the class's rule. A wait for
 * the open document that ran out says it next to the document's own state, so the two tell a
 * server that never recompiled from one whose update the browser never got. A server that is alive
 * and answers nothing is given `requestMs` and then reported as such.
 */
export async function serverSentence(
  server: Pick<DevServer, 'css' | 'get'>,
  route: string,
  className: string,
  { requestMs = 10_000 }: { readonly requestMs?: number } = {},
): Promise<string> {
  const silent = new Error(`${route} did not answer within ${requestMs} ms.`)
  const name = className.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
  try {
    const { status, text } = await before(server.get(route), Date.now() + requestMs, () => silent)
    const css = await before(server.css(route), Date.now() + requestMs, () => silent)
    const carries = new RegExp(String.raw`(?<![\w-])${name}(?![\w-])`).test(text)
      ? 'carries'
      : 'does not carry'
    const holds = new RegExp(String.raw`\.${name}(?![\w-])`).test(css) ? 'holds' : 'does not hold'
    return `${route} answers ${status}; its HTML ${carries} ${className}; the CSS it links ${holds} .${className}.`
  } catch (error) {
    return error === silent ? silent.message : `${route} could not be requested: ${String(error)}`
  }
}

/**
 * Next.js 16.2.0 on Turbopack sometimes never builds a route created while the dev server runs:
 * `/new` answers 404 for as long as the wait lasts, however often the file is written again, and
 * the wait for its rule can only run out. The sentence above says so on a line of its own, which
 * the server's output, printed after it, can never start.
 */
const ROUTE_NOT_BUILT = /^\/new answers 404;/mu

/**
 * The retry of the dev row: a failed attempt runs again, once and from a fresh app, only when its
 * message holds the sentence that names an empty manifest after a 500, or the one that says `/new`
 * answered 404. A route that was built and never got its rule, or any other red, fails after one
 * attempt. It is one pattern because a function condition does not survive vitest 5.0.5, which
 * strips it from the running task on collecting and then retries on every failure.
 */
export const RETRY_ON_DEV_ROW = {
  count: 1,
  condition: new RegExp(
    `${RETRY_ON_MANIFEST_READ.condition.source}|${ROUTE_NOT_BUILT.source}`,
    'mu',
  ),
}

const earlier = new Set<string>()

/**
 * Remembers, for the row that is running, a failure that says `/new` answered 404, so the attempt
 * that follows can print a note: vitest drops what a failed attempt printed.
 */
export function rememberRouteNotBuilt(failure: unknown): void {
  if (failure instanceof Error && ROUTE_NOT_BUILT.test(failure.message)) {
    earlier.add(expect.getState().currentTestName ?? '')
  }
}

/**
 * Prints the note when an earlier attempt of the row that is running ended with that 404.
 */
export function noteEarlierRouteNotBuilt(): void {
  if (earlier.delete(expect.getState().currentTestName ?? '')) {
    // eslint-disable-next-line no-console -- the output of a run that retried is where the 404 is named
    console.warn(
      'An earlier attempt of this row ended with Next.js not building /new (it answered 404)',
    )
  }
}
