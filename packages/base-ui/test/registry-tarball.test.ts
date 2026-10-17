import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadRegistry } from './support/registry/load.ts'
import {
  baseManifest,
  baseRef,
  editedSinceBase,
  exportsProblems,
  missingFromTarball,
  packedEntries,
  REGISTRY_PREFIX,
  rosterExports,
} from './support/registry/struct-tarball.ts'
import { manifestOf } from './support/registry/styled-subpaths.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const ROW_IDS = [
  ['test/manifest.test.ts', 'AC-base-ui-bridge-38'],
  ['test/tarball.test.ts', 'AC-base-ui-bridge-40'],
] as const

const EXISTING_ROWS = ROW_IDS.map(([row]) => row)

/**
 * Where there is no base ref (no git, or a checkout without history) the comparison falls back to
 * what is left to compare with, and says so.
 */
const warnNoBase = (what: string): void => {
  // eslint-disable-next-line no-console -- the fallback is named in the run's output, not skipped
  console.warn(`no base ref in this checkout: ${what}`)
}

const exportsAgainstBase = (): string[] => {
  const ref = baseRef()
  if (ref === undefined) {
    warnNoBase('exports was compared with the roster only')
    return exportsProblems(manifestOf().exports, rosterExports())
  }
  const base = baseManifest(ref)
  return [
    ...exportsProblems(manifestOf().exports, base.exports),
    ...(isDeepStrictEqual(base.files, ['dist']) ? [] : ['the base files is not ["dist"]']),
  ]
}

const existingRowsAgainstBase = (): string[] => {
  const ref = baseRef()
  if (ref === undefined) {
    warnNoBase('the existing rows were checked for their ids only')
    return ROW_IDS.filter(
      ([row, id]) => !readFileSync(path.join(PACKAGE_DIR, row), 'utf8').includes(id),
    ).map(([row]) => `${row} lost its describe id`)
  }
  return editedSinceBase(ref, EXISTING_ROWS)
}

const scratch: string[] = []

afterAll(() => {
  for (const directory of scratch) rmSync(directory, { force: true, recursive: true })
})

describe('AC-base-ui-registry-02: the tarball carries the registry inside dist, and nothing else about the package moves', () => {
  let entries: string[] = []

  beforeAll(() => {
    entries = packedEntries()
  }, 120_000)

  it('keeps files in package.json exactly ["dist"]', () => {
    expect(manifestOf().files).toEqual(['dist'])
  })

  it('lists every file of the registry under package/dist/registry/', () => {
    const { fileNames } = loadRegistry()
    expect(fileNames.length).toBeGreaterThan(1)
    expect(entries.filter((entry) => entry.startsWith(REGISTRY_PREFIX)).length).toBeGreaterThan(1)
    expect(missingFromTarball(entries, fileNames)).toEqual([])
  })

  it('control: a registry file left out of the listing is reported by name, and a listing without a registry reports every file', () => {
    const { fileNames } = loadRegistry()
    const without = entries.filter((entry) => entry !== `${REGISTRY_PREFIX}base-ui-dialog.json`)
    expect(missingFromTarball(without, fileNames)).toEqual([
      `${REGISTRY_PREFIX}base-ui-dialog.json`,
    ])
    const none = entries.filter((entry) => !entry.startsWith(REGISTRY_PREFIX))
    expect(missingFromTarball(none, fileNames)).toHaveLength(fileNames.length)
  })

  it('keeps exports as the roster of subpaths gives it, key for key and value for value', () => {
    expect(exportsProblems(manifestOf().exports, rosterExports())).toEqual([])
  })

  it("keeps exports equal to the base branch's, key for key and value for value", () => {
    expect(exportsAgainstBase()).toEqual([])
  })

  it('control: an added key, a lost key and a changed value in exports are each reported', () => {
    const real = manifestOf().exports
    expect(
      exportsProblems({ ...real, './registry': './dist/registry/registry.json' }, rosterExports()),
    ).toEqual(['exports gained ./registry'])
    const { './dialog': _lost, ...lacking } = real
    expect(exportsProblems(lacking, rosterExports())).toEqual(['exports lost ./dialog'])
    expect(
      exportsProblems({ ...real, './styles.css': './dist/other.css' }, rosterExports()),
    ).toEqual(['exports changed ./styles.css'])
    expect(
      exportsProblems(
        {
          ...real,
          './dialog': { types: './dist/dialog/index.d.ts', import: './dist/dialog/index.js' },
        },
        rosterExports(),
      ),
    ).toEqual(['exports changed ./dialog'])
  })

  it('leaves the existing manifest and tarball test files as the base branch has them', () => {
    expect(existingRowsAgainstBase()).toEqual([])
  })

  it('control: the edit check reports a tracked file changed since the base commit, and none when it is unchanged', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'registry-base-'))
    scratch.push(directory)
    const git = (...args: string[]): void => {
      execFileSync(
        'git',
        ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
        {
          cwd: directory,
          stdio: 'ignore',
        },
      )
    }
    git('init', '--quiet')
    writeFileSync(path.join(directory, 'a.test.ts'), 'one\n')
    writeFileSync(path.join(directory, 'b.test.ts'), 'two\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')
    expect(editedSinceBase('HEAD', ['a.test.ts', 'b.test.ts'], directory)).toEqual([])
    writeFileSync(path.join(directory, 'b.test.ts'), 'two!\n')
    expect(editedSinceBase('HEAD', ['a.test.ts', 'b.test.ts'], directory)).toEqual(['b.test.ts'])
  })
})
