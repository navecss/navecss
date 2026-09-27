/**
 * Test helper shared by the repo-root gates' own test files: runs a gate's exported
 * `main(rootDir)` against a fixture root and returns what it decided, without leaking its
 * output or its exit code into the test runner's own process.
 *
 * A gate reports through `process.exitCode`, `console.log` and `console.error`, all of which
 * are process-wide. This swaps the two console methods for collectors and resets
 * `process.exitCode` to 0 for the duration of the call, then restores all three, even when
 * `main` throws, so one test's verdict can never become the next test's starting state.
 */

/**
 * Awaits `main(rootDir)` and returns `{ code, out, err }`: the exit code it set (0 when it set
 * none), and everything it logged to `console.log` and `console.error`, one call per line.
 */
export async function runGateMain(main, rootDir) {
  const priorExit = process.exitCode
  const priorLog = console.log
  const priorError = console.error
  const out = []
  const err = []
  process.exitCode = 0
  console.log = (...args) => out.push(args.join(' '))
  console.error = (...args) => err.push(args.join(' '))
  let code
  try {
    await main(rootDir)
  } finally {
    console.log = priorLog
    console.error = priorError
    code = process.exitCode ?? 0
    process.exitCode = priorExit
  }
  return { code, out: out.join('\n'), err: err.join('\n') }
}
