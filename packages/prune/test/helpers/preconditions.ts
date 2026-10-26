/**
 * What a test file does when a program its rows need is not there.
 */

/**
 * Whether `env` says the tests run in continuous integration: `CI` is set to something other than
 * an empty text, `0` or `false`.
 */
function isCi(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI
  return value !== undefined && !['', '0', 'false'].includes(value)
}

/**
 * The reason to skip a file's rows, or `undefined` when they can run. Where CI is set a missing
 * program fails the file instead, so a runner that lost it cannot report green for rows that
 * never ran.
 */
export function skipReason(
  reason: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (reason !== undefined && isCi(env)) {
    throw new Error(`These rows cannot run here, and CI is set: ${reason}.`)
  }
  return reason
}
