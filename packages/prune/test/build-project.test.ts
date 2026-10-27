/**
 * The rows that run a real `next build`, `next dev` or `next start` are the `build` project's,
 * which `test:build` runs on its own; `test` leaves them out, and `test/chromium` is run by
 * `test:browser`. A file that reaches the helpers that start Next.js anywhere else would run in
 * `test` beside the other suites and slow them past their timeouts, so it has to be under
 * `test/build/`.
 */
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import config from '../vitest.config.ts'
import { isReaching, referencesOf } from './support/test-references.ts'

const PACKAGE = path.resolve(import.meta.dirname, '..')
const TEST = path.join(PACKAGE, 'test')

/**
 * Files that reach the helpers but start a stand-in for `next` that serves one page, not Next.js.
 */
const STAND_IN = new Set(['test/dev-until-css.test.ts', 'test/leftovers.test.ts'])
const STARTERS = ['next-app.ts', 'next-dev.ts'].map((name) => path.join(TEST, 'helpers', name))

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

/**
 * Whether a test file starts Next.js: it reaches the helpers that do, or runs `next` itself.
 */
function isStartingNext(file: string, targets: readonly string[]): boolean {
  return referencesOf(file).isCallingNextCommand || isReaching(file, targets)
}

describe('the rows that start Next.js', () => {
  const starting = testFilesUnder(TEST).filter(
    (file) =>
      !file.startsWith('test/chromium/') &&
      !STAND_IN.has(file) &&
      isStartingNext(path.join(PACKAGE, file), STARTERS),
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

  describe('are found in a planted file outside test/build', () => {
    let planted = ''
    beforeEach(() => {
      const made = mkdtempSync(path.join(tmpdir(), 'prune-planted-'))
      planted = realpathSync(made)
      mkdirSync(path.join(planted, 'helpers'))
      writeFileSync(path.join(planted, 'helpers/starter.ts'), 'export const start = 1\n')
    })
    afterEach(() => rmSync(planted, { recursive: true, force: true }))

    it('through a dynamic import of a helper that starts it', () => {
      const file = path.join(planted, 'x.test.ts')
      writeFileSync(file, "const { start } = await import('./helpers/starter.ts')\nvoid start\n")

      expect(isStartingNext(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through nextCommand, which a file that runs next itself calls', () => {
      const file = path.join(planted, 'y.test.ts')
      writeFileSync(
        file,
        "import { nextCommand } from './helpers/next-process.ts'\nconst args = nextCommand(['build'])\nvoid args\n",
      )

      expect(isStartingNext(file, STARTERS)).toBe(true)
    })

    it('through a require() of a path written without its extension', () => {
      const file = path.join(planted, 'a.test.ts')
      writeFileSync(file, "const { start } = require('./helpers/starter')\nvoid start\n")

      expect(isStartingNext(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through an import of a path written without its extension', () => {
      const file = path.join(planted, 'b.test.ts')
      writeFileSync(file, "import { start } from './helpers/starter'\nvoid start\n")

      expect(isStartingNext(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through an import of a directory whose index reaches it', () => {
      writeFileSync(
        path.join(planted, 'helpers/index.ts'),
        "export { start } from './starter.ts'\n",
      )
      const file = path.join(planted, 'c.test.ts')
      writeFileSync(file, "import { start } from './helpers'\nvoid start\n")

      expect(isStartingNext(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through a call of nextCommand on an object', () => {
      const file = path.join(planted, 'd.test.ts')
      writeFileSync(file, "const args = commands.nextCommand(['build'])\nvoid args\n")

      expect(isStartingNext(file, STARTERS)).toBe(true)
    })

    it('but not in a file whose strings and comments only name nextCommand (control)', () => {
      const file = path.join(planted, 'e.test.ts')
      writeFileSync(
        file,
        [
          'const text = "nextCommand([\'build\'])"',
          'const template = `nextCommand(${text})`',
          "// nextCommand(['dev'])",
          'void [text, template]',
          '',
        ].join('\n'),
      )

      expect(isStartingNext(file, STARTERS)).toBe(false)
    })

    it('but not in a file that imports neither (control)', () => {
      const file = path.join(planted, 'z.test.ts')
      writeFileSync(
        file,
        "import { nextEnvironment } from './helpers/next-process.ts'\nvoid nextEnvironment\n",
      )

      expect(isStartingNext(file, STARTERS)).toBe(false)
    })
  })
})
