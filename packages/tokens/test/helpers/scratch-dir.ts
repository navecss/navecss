/**
 * One scratch-directory helper for every `@navecss/tokens` test, shared instead of the near-
 * duplicate mkdtemp-plus-cleanup IMPLEMENTATION each test file's own `scratchDir`/`scratchPackage`/
 * `scratchInstall` function used to carry: those functions remain as thin wrappers over this
 * module, and what was eliminated is the duplicated implementation, not the call sites.
 *
 * A file that imports `scratchDir` must call `registerScratchCleanup()` at its own top level
 * first. `scratchDir` refuses to create a directory, throwing and naming `registerScratchCleanup`
 * in its message, until this module instance has one registration; cleanup is opt-in, not
 * automatic, and forgetting to opt in is now a loud failure instead of a silent leak.
 *
 * `cleanupScratchDirs` tries to remove every directory `scratchDir` has handed out since the
 * last cleanup, even when some removals throw: a failure on one tracked directory does not stop
 * the rest from being attempted. Once every attempt is done, if any removal threw or any tracked
 * path is somehow still present, it throws ONE error naming each such path, with the underlying
 * error code where the removal threw one.
 *
 * This module registers no hook itself: `registerScratchCleanup` calls vitest's `afterAll` from
 * INSIDE a function, at the importing file's own call site, the same place several files already
 * register their own module-level `beforeEach`/`afterEach` (`bin.test.ts`). A hook registered at
 * this module's own top level instead would be a top-level side effect in a module that also
 * exports `scratchDir`, which is the shape this repository's lint forbids; a plain test file
 * with no exports of its own is exempt.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'

const created: string[] = []
const cleanupState = { hasRegistered: false }

/**
 * Registers `afterAll(cleanupScratchDirs)` for this module instance, at most once: a second
 * call in the same file is a no-op. Must run before any call to `scratchDir` in that file;
 * `scratchDir` throws, naming this function, if it has not.
 */
export function registerScratchCleanup(): void {
  if (cleanupState.hasRegistered) {
    return
  }
  cleanupState.hasRegistered = true
  afterAll(cleanupScratchDirs)
}

/**
 * Creates a fresh OS-temp directory prefixed with `prefix`, tracked for `cleanupScratchDirs`.
 * Throws before creating anything if this module instance's `registerScratchCleanup()` has not
 * been called yet, naming it in the message.
 */
export function scratchDir(prefix: string): string {
  if (!cleanupState.hasRegistered) {
    throw new Error(
      `scratchDir requires registerScratchCleanup() to have been called first in this file, so ${prefix} was not created`,
    )
  }
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

/**
 * The `code` of a Node.js filesystem error, if it has one.
 */
function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

/**
 * Tries to remove every directory `scratchDir` has handed out since the last cleanup, even
 * when some removals throw: every tracked directory gets an attempt regardless of what happened
 * to the others. Once every attempt is done, if any removal threw or any tracked path still
 * exists, throws ONE error naming each such path, with the underlying error code where the
 * removal threw one.
 */
export function cleanupScratchDirs(): void {
  const dirs = [...created]
  created.length = 0
  const survivors: string[] = []
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      const code = errorCode(error)
      survivors.push(code === undefined ? dir : `${dir} (${code})`)
      continue
    }
    if (existsSync(dir)) {
      survivors.push(dir)
    }
  }
  if (survivors.length > 0) {
    const noun = survivors.length === 1 ? 'directory' : 'directories'
    throw new Error(`scratchDir left ${survivors.length} ${noun} behind: ${survivors.join(', ')}`)
  }
}
