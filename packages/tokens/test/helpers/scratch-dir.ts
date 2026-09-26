/**
 * One scratch-directory helper for every `@navecss/tokens` test, shared instead of the near-
 * duplicate `scratchDir`/`scratchPackage`/`scratchInstall` functions each test file used to carry
 * its own copy of. Every directory `scratchDir` hands out is removed once `cleanupScratchDirs`
 * runs, failed tests included (`force: true` so a partial build does not throw on cleanup), and
 * `cleanupScratchDirs` asserts each path is actually gone: a left-behind directory fails the
 * suite rather than passing silently, which is the check a leak would otherwise have no way to
 * surface.
 *
 * This module registers no hook itself: each importing test file calls
 * `afterAll(cleanupScratchDirs)` at its own top level, the same place several already register
 * their own module-level `beforeEach`/`afterEach` (`bin.test.ts`). A hook registered HERE instead
 * would be a top-level side effect in a module that also exports `scratchDir`, which is the
 * shape this repository's lint forbids; a plain test file with no exports of its own is exempt.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const created: string[] = []

/**
 * Creates a fresh OS-temp directory prefixed with `prefix`, registered for automatic cleanup.
 */
export function scratchDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

/**
 * Removes every directory `scratchDir` has handed out since the last cleanup; throws, naming
 * the survivors, if any remain.
 */
export function cleanupScratchDirs(): void {
  const dirs = [...created]
  created.length = 0
  const leftover = dirs.filter((dir) => {
    rmSync(dir, { recursive: true, force: true })
    return existsSync(dir)
  })
  if (leftover.length > 0) {
    const noun = leftover.length === 1 ? 'directory' : 'directories'
    throw new Error(`scratchDir left ${leftover.length} ${noun} behind: ${leftover.join(', ')}`)
  }
}
