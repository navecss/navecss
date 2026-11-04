import { expect } from 'vitest'

import type { DevServer } from './next-dev.ts'

import { RETRY_ON_MANIFEST_READ } from './dev-error-page.ts'
import { before } from './next-dev.ts'

/**
 * What the dev server itself serves for a route, as a sentence: whether the page carries the class
 * an edit gave it, and whether the stylesheet that page links holds the class's rule. A wait for
 * the open document that ran out says it next to the document's own state, so the two tell a
 * server that never recompiled from one whose update the browser never got. The status and the
 * stylesheet come from two requests, the second asking for the route again. A server that is alive
 * and answers nothing is given `requestMs` and then reported as such.
 */
export async function serverSentence(
  server: Pick<DevServer, 'css' | 'get'>,
  route: string,
  className: string,
  { requestMs = 10_000 }: { readonly requestMs?: number } = {},
): Promise<string> {
  const silentPage = new Error(`${route} did not answer within ${requestMs} ms.`)
  const silentCss = new Error(`the CSS it links did not answer within ${requestMs} ms.`)
  const name = className.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
  let page = ''
  try {
    const { status, text } = await before(
      server.get(route),
      Date.now() + requestMs,
      () => silentPage,
    )
    const carries = new RegExp(String.raw`(?<![\w-])${name}(?![\w-])`).test(text)
      ? 'carries'
      : 'does not carry'
    page = `${route} answers ${status}; its HTML ${carries} ${className};`
    const css = await before(server.css(route), Date.now() + requestMs, () => silentCss)
    const holds = new RegExp(String.raw`\.${name}(?![\w-])`).test(css) ? 'holds' : 'does not hold'
    return `${page} the CSS it links ${holds} .${className}.`
  } catch (error) {
    if (error === silentPage) return silentPage.message
    if (error === silentCss) return `${page} ${silentCss.message}`
    return `${route} could not be requested: ${String(error)}`
  }
}

/**
 * What an edit that never reached the open document leaves to read: the document's own state (or
 * why it could not be read), what the server itself serves for `route`, and the tail of the
 * server's output. The state is read apart: a document that is navigating must not take the
 * server's side, or the line the retry reads, with it.
 */
export async function explainEdit(
  state: () => Promise<string>,
  server: Pick<DevServer, 'css' | 'get' | 'output'>,
  route: string,
  className: string,
): Promise<string> {
  let document: string
  try {
    document = await state()
  } catch (error) {
    document = `the document could not be read: ${String(error)}`
  }
  const served = await serverSentence(server, route, className)
  return `${document}\n${served}\n${server.output().slice(-2000)}`
}

/**
 * Next.js's dev server sometimes never builds a route created while it runs, on webpack as on
 * Turbopack (measured on Turbopack 16.2.0 and on webpack, newest): `/new` answers 404 for as long
 * as the wait lasts, however often the file is written again, and the wait for its rule can only
 * run out. The sentence above says so on a line of its own, which the server's output, printed
 * after it, can never start.
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
