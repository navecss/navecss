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
export const RETRY_ON_NEXT_CRASH = { count: 2, condition: /^never matches$/u }

/**
 * Names the crash in the output when a build printed it, so a green run after a retry shows what
 * it came through.
 */
export function noteNextCrash(output: string): void {
  void output
}
