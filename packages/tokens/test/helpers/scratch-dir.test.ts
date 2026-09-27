/**
 * The shared scratch-directory helper's own contract. `cleanupScratchDirs` is exercised directly
 * inside `it` bodies; the second `describe`'s first `it` already sweeps the first `describe`'s
 * directories as a side effect of testing its own, so `registerScratchCleanup()`'s `afterAll`
 * below is a safety net with nothing left to do against this file's own tests by the time it
 * runs, kept because it is the same registration every consuming file carries.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import type * as ScratchDirModule from './scratch-dir.ts'

import { cleanupScratchDirs, registerScratchCleanup, scratchDir } from './scratch-dir.ts'

registerScratchCleanup()

describe('scratchDir', () => {
  it('hands out a fresh, existing directory each call', () => {
    const first = scratchDir('navecss-scratch-dir-helper-')
    const second = scratchDir('navecss-scratch-dir-helper-')
    expect(first).not.toBe(second)
    expect(existsSync(first)).toBe(true)
    expect(existsSync(second)).toBe(true)
  })
})

describe('cleanupScratchDirs', () => {
  it('removes every directory scratchDir has handed out since the last cleanup', () => {
    const first = scratchDir('navecss-scratch-dir-helper-cleanup-')
    const second = scratchDir('navecss-scratch-dir-helper-cleanup-')

    cleanupScratchDirs()

    expect(existsSync(first)).toBe(false)
    expect(existsSync(second)).toBe(false)
  })

  it('is a no-op the second time, with nothing left to remove', () => {
    scratchDir('navecss-scratch-dir-helper-cleanup-')
    cleanupScratchDirs()
    expect(() => cleanupScratchDirs()).not.toThrow()
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'still removes the ordinary directories tracked before and after one that cannot be removed, and names the survivor',
    () => {
      const before = scratchDir('navecss-scratch-dir-helper-before-')
      const unremovable = scratchDir('navecss-scratch-dir-helper-unremovable-')
      const blocked = path.join(unremovable, 'blocked')
      mkdirSync(blocked)
      writeFileSync(path.join(blocked, 'file.txt'), '')
      chmodSync(blocked, 0o555)

      const after = scratchDir('navecss-scratch-dir-helper-after-')

      try {
        let thrown: unknown
        try {
          cleanupScratchDirs()
        } catch (error) {
          thrown = error
        }
        expect(thrown).toBeInstanceOf(Error)
        expect((thrown as Error).message).toContain(unremovable)
        expect(existsSync(before)).toBe(false)
        expect(existsSync(after)).toBe(false)
      } finally {
        chmodSync(blocked, 0o755)
        rmSync(before, { recursive: true, force: true })
        rmSync(unremovable, { recursive: true, force: true })
        rmSync(after, { recursive: true, force: true })
      }
    },
  )
})

describe('registerScratchCleanup', () => {
  it('makes scratchDir refuse to hand out a directory until it has been called', async () => {
    vi.resetModules()
    const fresh: typeof ScratchDirModule = await import('./scratch-dir.ts')
    expectTypeOf(fresh.registerScratchCleanup).toBeFunction()

    const prefix = 'navecss-scratch-dir-helper-unregistered-'
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith(prefix))
    try {
      expect(() => fresh.scratchDir(prefix)).toThrowError(/registerScratchCleanup/)
      const after = readdirSync(tmpdir()).filter((name) => name.startsWith(prefix))
      expect(after).toEqual(before)
    } finally {
      const leftover = readdirSync(tmpdir()).filter(
        (name) => name.startsWith(prefix) && !before.includes(name),
      )
      for (const name of leftover) {
        rmSync(path.join(tmpdir(), name), { recursive: true, force: true })
      }
    }
  })
})
