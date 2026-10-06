import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import { PACKAGE_DIR } from './support/stylesheet.ts'

const run = promisify(execFile)

/**
What a tarball holds that a consumer must not receive: a test file, or anything under a test directory.
 */
const unwanted = (entries: readonly string[]): string[] =>
  entries.filter((entry) => /\.test\.|\/test\//.test(entry))

const byName = (a: string, b: string): number => a.localeCompare(b)

const TOP_LEVEL = new Set(['package/LICENSE', 'package/package.json', 'package/README.md'])

const pack = async (): Promise<string[]> => {
  const { stdout } = await run('npm', ['pack', '--ignore-scripts', '--dry-run', '--json'], {
    cwd: PACKAGE_DIR,
  })
  const reply = JSON.parse(stdout) as unknown
  const entry = (Array.isArray(reply) ? reply[0] : Object.values(reply as object)[0]) as {
    files: { path: string }[]
  }
  return entry.files.map((file) => `package/${file.path}`)
}

describe('AC-base-ui-bridge-40: the tarball', () => {
  it('holds dist, the manifest, the README and the LICENSE, and no test file or test directory', async () => {
    const entries = await pack()
    expect(entries.filter((entry) => TOP_LEVEL.has(entry)).toSorted(byName)).toEqual(
      [...TOP_LEVEL].toSorted(byName),
    )
    expect(
      entries.filter((entry) => !TOP_LEVEL.has(entry) && !entry.startsWith('package/dist/')),
    ).toEqual([])
    expect(entries.some((entry) => entry.startsWith('package/dist/'))).toBe(true)
    expect(unwanted(entries)).toEqual([])
  }, 120_000)

  it('control: a planted test file and a planted test directory are reported', () => {
    expect(unwanted(['package/dist/a.js', 'package/dist/a.test.js', 'package/test/x.js'])).toEqual([
      'package/dist/a.test.js',
      'package/test/x.js',
    ])
  })
})
