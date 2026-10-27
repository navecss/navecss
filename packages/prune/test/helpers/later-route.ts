import { expect } from 'vitest'

import type { DevServer } from './next-dev.ts'

/**
 * The dev server, now and then, never builds a route created while it runs: `/later` answers 404
 * and the page's stylesheet never gets the route's atom. A row that waits for the atom runs again,
 * once, from a fresh app, after that and after nothing else.
 */

/**
 * The words the diagnostic uses when the route answers 404.
 */
const NOT_BUILT = /\/later answers 404 and its HTML/u

/**
 * The retry of such a row: a failed attempt runs again only when its message holds the 404.
 */
export const RETRY_ON_ROUTE_NOT_BUILT = { count: 1, condition: NOT_BUILT }

const earlier = new Set<string>()

/**
 * Whether the dev server serves `/later` and its HTML carries the atom, as a sentence.
 */
async function laterRouteSentence(server: Pick<DevServer, 'get'>): Promise<string> {
  try {
    const { status, text } = await server.get('/later')
    const carries = text.includes('nave-grid') ? 'carries' : 'does not carry'
    return `/later answers ${status} and its HTML ${carries} nave-grid.`
  } catch (error) {
    return `/later could not be requested: ${String(error)}`
  }
}

/**
 * Waits for the page's stylesheet to hold the atom of the route created later. When it does not
 * within the deadline, the failure also says whether the route itself was built, and a failure
 * that says it was not is remembered for its row: the attempt that follows it prints a note, since
 * vitest drops what a failed attempt printed.
 */
export async function untilLaterRouteGrid(
  server: Pick<DevServer, 'get' | 'untilCss'>,
  rewrite: () => void,
): Promise<void> {
  const row = expect.getState().currentTestName ?? ''
  if (earlier.delete(row)) {
    // eslint-disable-next-line no-console -- the output of a run that retried is where the 404 is named
    console.warn(
      'An earlier attempt of this row ended with Next.js not building /later (it answered 404)',
    )
  }
  try {
    await server.untilCss('/', '.nave-grid', { rewrite })
  } catch (error) {
    const sentence = await laterRouteSentence(server)
    if (sentence.includes('/later answers 404')) earlier.add(row)
    throw new Error(`${(error as Error).message}\n${sentence}`, { cause: error })
  }
}
