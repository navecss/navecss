import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { HEADER } from './support/registry/cleared.ts'
import {
  headed,
  headerProblems,
  licenseProblems,
  type Notice,
  parseNotice,
} from './support/registry/files-header.ts'
import {
  makePackageCopy,
  type PackageCopy,
  readInCopy,
  type RunResult,
  runScript,
  writeInCopy,
} from './support/registry/files-package-copy.ts'
import { problemTexts } from './support/registry/files-problem.ts'
import { type LoadedRegistry, loadRegistry } from './support/registry/load.ts'
import { styledSubpaths } from './support/registry/styled-subpaths.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

// A copy is built twice per scenario, and the package's own build is a few seconds of work.
const BUILD_MS = 300_000
const GENERATOR = 'scripts/generate-registry.ts'
const REAL_LICENSE = readFileSync(path.join(PACKAGE_DIR, 'LICENSE'), 'utf8')
const REAL_NOTICE = parseNotice(REAL_LICENSE)
const EXAMPLE: Notice = { holder: 'Example Holder', year: '2031' }

const copyrightLine = (notice: Notice): string => `Copyright (c) ${notice.year} ${notice.holder}`

/**
 * The names the generator must not hard-code: the year and the holder the repository's LICENSE
 * states today.
 */
const hardCodedNotice = (source: string): string[] =>
  new Set(['2026', 'Nave Contributors', REAL_NOTICE.holder, REAL_NOTICE.year])
    .values()
    .filter((literal) => source.includes(literal))
    .toArray()

const buildCopy = (copy: PackageCopy, license: string): RunResult => {
  writeInCopy(copy, 'LICENSE', license)
  const styles = runScript(copy, 'build-styles.ts')
  if (styles.status !== 0) throw new Error(`build-styles.ts failed in the copy:\n${styles.output}`)
  return runScript(copy, 'generate-registry.ts', ['--root', copy.packageDir])
}

const registryOf = (copy: PackageCopy): LoadedRegistry =>
  loadRegistry(path.join(copy.packageDir, 'dist/registry'))

const itemFilesIn = (copy: PackageCopy): string[] => {
  const directory = path.join(copy.packageDir, 'dist/registry')
  return existsSync(directory)
    ? readdirSync(directory).filter((name) => name.startsWith('base-ui-'))
    : []
}

describe("AC-base-ui-registry-14: The header's year and holder come from LICENSE, never from the generator", () => {
  describe('a LICENSE that reads "Copyright (c) 2031 Example Holder"', () => {
    let copy: PackageCopy
    let run: RunResult

    beforeAll(() => {
      copy = makePackageCopy()
      run = buildCopy(
        copy,
        REAL_LICENSE.replace(copyrightLine(REAL_NOTICE), () => copyrightLine(EXAMPLE)),
      )
    }, BUILD_MS)
    afterAll(() => {
      copy.cleanup()
    })

    it('builds', () => {
      expect(run.status, run.output.slice(-2000)).toBe(0)
    })

    it('differs from the repository LICENSE, so a header that reads it cannot be the real one', () => {
      expect(readInCopy(copy, 'LICENSE')).not.toBe(REAL_LICENSE)
      expect(readInCopy(copy, 'LICENSE')).toContain('Copyright (c) 2031 Example Holder\n')
    })

    it('writes every item, with the second line of every header reading the example year and holder', () => {
      const registry = registryOf(copy)
      expect(
        registry.items
          .keys()
          .toArray()
          .toSorted((a, b) => a.localeCompare(b)),
      ).toEqual(styledSubpaths().map((subpath) => `base-ui-${subpath}`))
      expect(problemTexts(headerProblems(registry, EXAMPLE))).toEqual([])
      const lines = registry.items
        .values()
        .flatMap((item) => headed(item))
        .map((file) => file.content?.split('\n', 2)[1] ?? '')
        .toArray()
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) {
        expect(line.replace(/^(\/\/ |\/\* )/, '').replace(/ \*\/$/, '')).toBe(
          HEADER.line2(EXAMPLE.year, EXAMPLE.holder),
        )
      }
    })

    it('carries the example LICENSE as NAVECSS-LICENSE and, if it sets an author, the example holder', () => {
      const registry = registryOf(copy)
      const license = readInCopy(copy, 'LICENSE')
      expect(problemTexts(licenseProblems(registry, license))).toEqual([])
      const authors = registry.items
        .values()
        .map((item) => item.author)
        .filter((author) => author !== undefined)
        .toArray()
      for (const author of authors) expect(author).toBe(EXAMPLE.holder)
    })
  })

  describe.each([
    ['has no copyright line', 'All rights reserved.'],
    ['has a copyright line without a year', 'Copyright (c) Example Holder'],
  ])('a LICENSE that %s', (_name, replacement) => {
    let copy: PackageCopy
    let run: RunResult

    beforeAll(() => {
      copy = makePackageCopy()
      run = buildCopy(
        copy,
        REAL_LICENSE.replace(copyrightLine(REAL_NOTICE), () => replacement),
      )
    }, BUILD_MS)
    afterAll(() => {
      copy.cleanup()
    })

    it('fails the build, naming LICENSE', () => {
      expect(run.status).not.toBe(0)
      expect(run.status).not.toBeNull()
      expect(run.output).toContain('LICENSE')
    })

    it('leaves dist/registry with no item, the refusal being the LICENSE one', () => {
      expect(run.output).toContain('LICENSE')
      expect(itemFilesIn(copy)).toEqual([])
    })
  })

  describe('the generator source', () => {
    it('exists, and contains neither "2026" nor "Nave Contributors"', () => {
      const source = path.join(PACKAGE_DIR, GENERATOR)
      expect(existsSync(source)).toBe(true)
      expect(hardCodedNotice(readFileSync(source, 'utf8'))).toEqual([])
    })

    it('is checked by a function that finds both literals when they are there', () => {
      expect(hardCodedNotice("const holder = 'Nave Contributors'")).toContain('Nave Contributors')
      expect(hardCodedNotice('// Copyright (c) 2026')).toContain('2026')
      expect(hardCodedNotice('const holder = readHolder(license)')).toEqual([])
    })
  })
})
