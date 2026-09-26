/**
 * The shared scratch-directory helper's own contract. `cleanupScratchDirs` is exercised directly
 * inside `it` bodies (in addition to the `afterAll` below, which only sweeps whatever the first
 * `describe` leaves behind) so its result — which paths it actually removed — is observable
 * inside a test, not just trusted to run silently.
 */
import { existsSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'

import { cleanupScratchDirs, scratchDir } from './scratch-dir.ts'

afterAll(cleanupScratchDirs)

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
})
