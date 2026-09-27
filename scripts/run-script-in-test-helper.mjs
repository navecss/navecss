// Shared by `check-no-orphaned-chunks.test.mjs` and `check-no-pending-changesets.test.mjs`, which
// carried identical copies of this function before they were extracted here. Named without a
// `.test.mjs` suffix so `scripts:test` (`node --test scripts/*.test.mjs`) does not collect it as
// a test file.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Runs a script as its own process against a scratch workspace root, by copying it into
 * `<rootDir>/scripts/` (the calling scripts resolve their own ROOT from their own location, one
 * directory up). Returns `{ status, out }` with stdout and stderr concatenated.
 */
export function runScriptIn(scriptPath, rootDir) {
  const scriptsDir = path.join(rootDir, 'scripts')
  mkdirSync(scriptsDir, { recursive: true })
  const copied = path.join(scriptsDir, path.basename(scriptPath))
  copyFileSync(scriptPath, copied)
  try {
    const stdout = execFileSync(process.execPath, [copied], { encoding: 'utf8' })
    return { status: 0, out: stdout }
  } catch (error) {
    return { status: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}
