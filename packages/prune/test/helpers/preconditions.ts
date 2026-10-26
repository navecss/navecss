/**
 * What a test file does when a program its rows need is not there.
 */

/**
 * The reason to skip a file's rows, or `undefined` when they can run.
 */
export function skipReason(
  reason: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  void env
  return reason
}
