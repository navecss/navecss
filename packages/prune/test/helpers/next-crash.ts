import { expect } from 'vitest'

/**
 * Next.js 16.2.0 on webpack now and then dies with an uncaught error right after it starts the
 * production build. A real-build row may run again after that crash, and only after it.
 */

/**
 * The text Next.js prints for the crash.
 */
export const NEXT_CRASH =
  /uncaughtException TypeError: Cannot read properties of undefined \(reading 'length'\)/u

/**
 * The retry of such a row: a failed attempt runs again only when its message holds the crash.
 */
export const RETRY_ON_NEXT_CRASH = { count: 2, condition: NEXT_CRASH }

const earlier = new Map<string, string>()

/**
 * Names the crash in the output of the attempt that follows it. A build is passed in as it ends:
 * one that printed the crash is remembered for its row, and the next attempt of that row, the
 * retry, prints it when it passes its first build in, so a green run shows what it came through.
 * Vitest drops what an attempt that failed printed, which is why it is the next one that does.
 */
export function noteNextCrash(output: string): void {
  const row = expect.getState().currentTestName ?? ''
  const before = earlier.get(row)
  if (before !== undefined) {
    earlier.delete(row)
    // eslint-disable-next-line no-console -- the output of a run that retried is where the crash is named
    console.warn(`An earlier attempt of this row ended in Next.js's crash: ${before}`)
  }
  const crash = NEXT_CRASH.exec(output)
  if (crash !== null) earlier.set(row, crash[0])
}
