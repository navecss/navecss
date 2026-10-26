/**
 * The rows that run a real `next build`, `next dev` or `next start` are the `build` project's,
 * which `test:build` runs on its own; `test` leaves them out, and `test/chromium` is run by
 * `test:browser`. A file that reaches the helpers that start Next.js anywhere else would run in
 * `test` beside the other suites and slow them past their timeouts, so it has to be under
 * `test/build/`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import config from '../vitest.config.ts'

const PACKAGE = path.resolve(import.meta.dirname, '..')
const TEST = path.join(PACKAGE, 'test')

/**
 * Files that reach the helpers but start a stand-in for `next` that serves one page, not Next.js.
 */
const STAND_IN = new Set(['test/leftovers.test.ts'])
const STARTERS = ['next-app.ts', 'next-dev.ts'].map((name) => path.join(TEST, 'helpers', name))

/**
 * The relative imports of a file, resolved, that are files.
 */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return text
    .matchAll(/(?:from|import)\s+['"](\.[^'"]+)['"]/gu)
    .map((match) => path.resolve(path.dirname(file), match[1]!))
    .filter((target) => statSync(target, { throwIfNoEntry: false })?.isFile() === true)
    .toArray()
}

/**
 * Whether the file reaches one of `targets` through its imports.
 */
function isReaching(file: string, targets: readonly string[], seen = new Set<string>()): boolean {
  if (targets.includes(file)) return true
  if (seen.has(file)) return false
  seen.add(file)
  return importsOf(file).some((imported) => isReaching(imported, targets, seen))
}

/**
 * The test files under `directory`, as paths relative to the package.
 */
function testFilesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => path.relative(PACKAGE, path.join(entry.parentPath, entry.name)))
}

const projects = (config.test?.projects ?? []) as {
  test: { exclude?: string[]; include: string[]; name: string }
}[]
const project = (name: string): (typeof projects)[number] =>
  projects.find((candidate) => candidate.test.name === name)!

describe('the rows that start Next.js', () => {
  const starting = testFilesUnder(TEST).filter(
    (file) =>
      !file.startsWith('test/chromium/') &&
      !STAND_IN.has(file) &&
      isReaching(path.join(PACKAGE, file), STARTERS),
  )

  it('are found (control: the monorepo rows reach the helpers)', () => {
    expect(starting).toContain('test/build/monorepo-criterion.test.ts')
    expect(starting.length).toBeGreaterThan(20)
  })

  it('are all under test/build, which the build project runs', () => {
    expect(starting.filter((file) => !file.startsWith('test/build/'))).toEqual([])
    expect(project('build').test.include).toEqual(['test/build/**/*.test.ts'])
  })

  it('are left out of the node project, so test does not run them', () => {
    expect(project('node').test.exclude).toContain('test/build/**')
  })

  it('reach the helpers only from test/build or test/chromium (the check sees a file that does not: control)', () => {
    const plain = path.join(TEST, 'readme.test.ts')
    expect(isReaching(plain, STARTERS)).toBe(false)
  })
})
