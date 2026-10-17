import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { filesUnder } from './support/dist.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const TEST_DIR = path.join(PACKAGE_DIR, 'test')
const ROOT = path.join(PACKAGE_DIR, '../..')

const idOf = (number: number): string => `AC-base-ui-registry-${String(number).padStart(2, '0')}`

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_unused, index) => from + index)

// Criteria whose instrument is not another test file of this package: 31 is this file, 27 is checked
// once at review, and 32's release half and 33 run after a release (scripts/check-registry-reach.mjs).
const TIER_A = [...range(1, 23), 28, 29, 30, 32, 34]
const BROWSER = [24, 25, 26]

const read = (file: string): string => readFileSync(path.join(TEST_DIR, file), 'utf8')

const testFiles = (directory: string, suffix: string): string[] =>
  readdirSync(path.join(TEST_DIR, directory))
    .filter((name) => name.startsWith('registry-') && name.endsWith(suffix))
    .map((name) => path.posix.join(directory, name))

// This file is the auditor: its own patterns would match themselves.
const tierAFiles = [...testFiles('.', '.test.ts'), ...testFiles('render', '.test.ts')].filter(
  (file) => file !== 'registry-wiring.test.ts',
)
const browserFiles = testFiles('browser', '.browser.test.ts')

const namingTest = (files: readonly string[], id: string): string[] =>
  files.filter((file) => new RegExp(`describe\\(\\s*['"\`]${id}\\b`).test(read(file)))

describe('AC-base-ui-registry-31: the instruments run where they are claimed to run, over the registry the build wrote', () => {
  it.each(TIER_A.map((number) => ({ id: idOf(number) })))(
    'has a test in the package test set that names $id',
    ({ id }) => {
      expect(namingTest(tierAFiles, id), id).not.toEqual([])
    },
  )

  it.each(BROWSER.map((number) => ({ id: idOf(number) })))(
    'has a test in the browser set that names $id',
    ({ id }) => {
      expect(namingTest(browserFiles, id), id).not.toEqual([])
    },
  )

  it('finds the instrument files it audits, so the checks below read something', () => {
    expect(tierAFiles.length).toBeGreaterThan(10)
    expect(browserFiles.length).toBe(3)
  })

  it('has no registry test that skips itself, so an absent registry cannot pass them', () => {
    const skipping = [...tierAFiles, ...browserFiles].filter((file) =>
      /\b(?:describe|it|test)\.(?:skip|skipIf|todo|runIf)\b|\bxit\b|\bxdescribe\b/.test(read(file)),
    )
    expect(skipping).toEqual([])
  })

  it('has no registry test that generates the registry in process: they read the one the build wrote', () => {
    const generating = [...tierAFiles, ...browserFiles].filter((file) =>
      /\b(?:generateItems|buildItem|moduleBody)\b|from ['"][./]*scripts\/registry\//.test(
        read(file),
      ),
    )
    expect(generating).toEqual([])
  })

  it('fails, rather than skipping, when the registry directory is absent', async () => {
    const { loadRegistry } = await import('./support/registry/load.ts')
    expect(() => loadRegistry(path.join(PACKAGE_DIR, 'dist/registry-absent'))).toThrow(/absent/)
  })

  it("runs in ci:check: the package's test and test:browser are steps of ci:check", () => {
    const gate = readFileSync(path.join(ROOT, 'scripts/run-ci-check.mjs'), 'utf8')
    expect(gate).toMatch(/name: 'test'/)
    expect(gate).toMatch(/name: 'test:browser'/)
    const scripts = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(scripts.scripts.test).toBe('vitest run')
    expect(scripts.scripts['test:browser']).toContain('vitest.browser.config.ts')
  })

  it('covers every test file by one of the two package configs', () => {
    expect(filesUnder(path.join(TEST_DIR, 'browser'), ['.browser.test.ts']).length).toBeGreaterThan(
      browserFiles.length,
    )
  })
})
