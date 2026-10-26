/**
 * A file whose rows need a program (Next.js, Chromium, a built package) skips them where it is
 * missing, so a developer without it still runs the rest; where CI is set it fails instead, so a
 * runner that lost the program does not report green for rows that never ran.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { skipReason } from './helpers/preconditions.ts'

describe('a missing precondition', () => {
  it('skips the file where CI is not set', () => {
    expect(skipReason('next is not installed for this package', {})).toBe(
      'next is not installed for this package',
    )
  })

  it.each(['', '0', 'false'])('skips the file where CI is %j', (value) => {
    expect(skipReason('Chromium is not installed', { CI: value })).toBe('Chromium is not installed')
  })

  it.each(['true', '1'])('fails the file, naming the reason, where CI is %j', (value) => {
    expect(() => skipReason('Chromium is not installed', { CI: value })).toThrow(
      'Chromium is not installed',
    )
  })

  it('has nothing to skip or to fail when the program is there, whatever CI says', () => {
    expect(skipReason(undefined, { CI: 'true' })).toBeUndefined()
    expect(skipReason(undefined, {})).toBeUndefined()
  })
})

/**
 * Reads `HAS_CHROMIUM` in a process whose Playwright looks for browsers in an empty directory,
 * with `CI` set to `ci` or removed.
 */
function readInEmptyBrowserDirectory(ci: string | undefined): ReturnType<typeof spawnSync> {
  const browsers = mkdtempSync(path.join(tmpdir(), 'prune-no-browsers-'))
  try {
    const chromium = pathToFileURL(path.join(import.meta.dirname, 'helpers/chromium.ts')).href
    const env: NodeJS.ProcessEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers }
    if (ci === undefined) delete env.CI
    else env.CI = ci
    return spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { HAS_CHROMIUM } from ${JSON.stringify(chromium)}\nconsole.log(HAS_CHROMIUM)`,
      ],
      { encoding: 'utf8', env },
    )
  } finally {
    rmSync(browsers, { recursive: true, force: true })
  }
}

describe('the Chromium rows', () => {
  it('are skipped where CI is not set and Chromium is not installed', () => {
    const run = readInEmptyBrowserDirectory(undefined)

    expect(run.status, String(run.stderr)).toBe(0)
    expect(String(run.stdout).trim()).toBe('false')
  })

  it('fail the file where CI is set and Chromium is not installed', () => {
    const run = readInEmptyBrowserDirectory('true')

    expect(run.status).not.toBe(0)
    expect(String(run.stderr)).toContain('Chromium is not installed')
  })
})
