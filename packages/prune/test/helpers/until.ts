import { pause } from './next-process.ts'

/**
 * Whether `isDone` holds; a check that throws (a document that is reloading) does not hold.
 */
async function isDoneOrFalse(isDone: () => Promise<boolean>): Promise<boolean> {
  try {
    return await isDone()
  } catch {
    return false
  }
}

/**
 * What `explain` says, or why it could not.
 */
async function whatWasThere(explain: (() => Promise<string>) | undefined): Promise<string> {
  if (explain === undefined) return ''
  try {
    return await explain()
  } catch (error) {
    return `the state could not be read: ${String(error)}`
  }
}

interface UntilOptions {
  /**
   * Writes the edit again, every tenth check.
   */
  readonly nudge?: () => void
  /**
   * Says what was there when the wait ran out.
   */
  readonly explain?: () => Promise<string>
  /**
   * How long to wait, 240 seconds when omitted.
   */
  readonly deadlineMs?: number
}

/**
 * Waits until `isDone` holds. Every tenth check, `nudge` runs: a dev server on a busy machine
 * sometimes drops the file-change event of a single write, so the edit is written again. When the
 * wait runs out, `explain` says what was there instead.
 */
export async function until(
  isDone: () => Promise<boolean>,
  what: string,
  { nudge, explain, deadlineMs = 240_000 }: UntilOptions = {},
): Promise<void> {
  const end = Date.now() + deadlineMs
  for (let check = 1; Date.now() < end; check += 1) {
    if (await isDoneOrFalse(isDone)) return
    if (check % 10 === 0) nudge?.()
    await pause(1000)
  }
  const found = await whatWasThere(explain)
  throw new Error(`timed out waiting for ${what}${found === '' ? '' : `:\n${found}`}`)
}
