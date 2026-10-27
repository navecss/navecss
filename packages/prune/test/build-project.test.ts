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
import { isStartingNext } from './support/test-references.ts'

const PACKAGE = path.resolve(import.meta.dirname, '..')
const TEST = path.join(PACKAGE, 'test')

/**
 * Files that reach the helpers but start a stand-in for `next` that serves one page, not Next.js.
 */
const STAND_IN = new Set([
  'test/dev-until-css.test.ts',
  'test/later-route-retry.test.ts',
  'test/leftovers.test.ts',
])
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

describe('the rows that start Next.js', () => {
  const starting = testFilesUnder(TEST).filter(
    (file) =>
      !file.startsWith('test/chromium/') &&
      !STAND_IN.has(file) &&
      isStartingNext(path.join(PACKAGE, file), STARTERS, TEST),
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
    expect(isStartingNext(plain, STARTERS, TEST)).toBe(false)
  })

  describe('are found in a planted file outside test/build', () => {
    let planted = ''
    const isStartingPlanted = (file: string, targets: readonly string[]): boolean =>
      isStartingNext(file, targets, planted)
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

      expect(isStartingPlanted(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through nextCommand, which a file that runs next itself calls', () => {
      const file = path.join(planted, 'y.test.ts')
      writeFileSync(
        file,
        "import { nextCommand } from './helpers/next-process.ts'\nconst args = nextCommand(['build'])\nvoid args\n",
      )

      expect(isStartingPlanted(file, STARTERS)).toBe(true)
    })

    it('through a require() of a path written without its extension', () => {
      const file = path.join(planted, 'a.test.ts')
      writeFileSync(file, "const { start } = require('./helpers/starter')\nvoid start\n")

      expect(isStartingPlanted(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through an import of a path written without its extension', () => {
      const file = path.join(planted, 'b.test.ts')
      writeFileSync(file, "import { start } from './helpers/starter'\nvoid start\n")

      expect(isStartingPlanted(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through an import of a directory whose index reaches it', () => {
      writeFileSync(
        path.join(planted, 'helpers/index.ts'),
        "export { start } from './starter.ts'\n",
      )
      const file = path.join(planted, 'c.test.ts')
      writeFileSync(file, "import { start } from './helpers'\nvoid start\n")

      expect(isStartingPlanted(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through a call of nextCommand on an object', () => {
      const file = path.join(planted, 'd.test.ts')
      writeFileSync(file, "const args = commands.nextCommand(['build'])\nvoid args\n")

      expect(isStartingPlanted(file, STARTERS)).toBe(true)
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

      expect(isStartingPlanted(file, STARTERS)).toBe(false)
    })

    it.each([
      [
        'an import of nextCommand under another name',
        "import { nextCommand as run } from './helpers/next-process.ts'\nrun(['build'])\n",
      ],
      [
        'nextCommand assigned to another name',
        "import { nextCommand } from './helpers/next-process.ts'\nconst run = nextCommand\nrun(['build'])\n",
      ],
      [
        'nextCommand passed on as a value',
        "import { nextCommand } from './helpers/next-process.ts'\n[['build']].map(nextCommand)\n",
      ],
      [
        'a require made by createRequire and kept in a name',
        "import { createRequire } from 'node:module'\nconst load = createRequire(import.meta.url)\nload('./helpers/starter')\n",
      ],
      [
        'a require made by createRequire and called at once',
        "import { createRequire } from 'node:module'\ncreateRequire(import.meta.url)('./helpers/starter')\n",
      ],
      [
        'an import() whose argument is computed',
        "const name = './helpers/' + 'starter'\nawait import(name)\n",
      ],
      [
        'a require() whose argument is computed',
        "const name = './helpers/' + 'starter'\nrequire(name)\n",
      ],
    ])('through %s', (_how, source) => {
      const file = path.join(planted, 'f.test.ts')
      writeFileSync(file, source)

      expect(isStartingPlanted(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through a helper it imports that calls nextCommand', () => {
      writeFileSync(
        path.join(planted, 'helpers/runner.ts'),
        "import { nextCommand } from './next-process.ts'\nexport const run = () => nextCommand(['build'])\n",
      )
      writeFileSync(path.join(planted, 'helpers/outer.ts'), "export { run } from './runner.ts'\n")
      const file = path.join(planted, 'i.test.ts')
      writeFileSync(file, "import { run } from './helpers/outer.ts'\nvoid run\n")

      expect(isStartingPlanted(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('through a require made by createRequire that is called above where it is made', () => {
      const file = path.join(planted, 'j.test.ts')
      writeFileSync(
        file,
        [
          "import { createRequire } from 'node:module'",
          "function later() {\n  return load('./helpers/starter')\n}",
          'const load = createRequire(import.meta.url)',
          'void later',
          '',
        ].join('\n'),
      )

      expect(isStartingPlanted(file, [path.join(planted, 'helpers/starter.ts')])).toBe(true)
    })

    it('but not through a helper that only defines nextCommand (control)', () => {
      writeFileSync(
        path.join(planted, 'helpers/defines.ts'),
        'export function nextCommand(args: string[]): string[] {\n  return args\n}\nexport const other = 1\n',
      )
      const file = path.join(planted, 'k.test.ts')
      writeFileSync(file, "import { other } from './helpers/defines.ts'\nvoid other\n")

      expect(isStartingPlanted(file, [path.join(planted, 'helpers/starter.ts')])).toBe(false)
    })

    it('but not in a file that imports nextCommand and never uses it (control)', () => {
      const file = path.join(planted, 'g.test.ts')
      writeFileSync(file, "import { nextCommand } from './helpers/next-process.ts'\nvoid 1\n")

      expect(isStartingPlanted(file, STARTERS)).toBe(false)
    })

    it('but not in a file whose import() and require() name a file by a plain string (control)', () => {
      const file = path.join(planted, 'h.test.ts')
      writeFileSync(file, "await import('./helpers/starter.ts')\nrequire('node:path')\n")

      expect(isStartingPlanted(file, STARTERS)).toBe(false)
    })

    it('but not in a file that imports neither (control)', () => {
      const file = path.join(planted, 'z.test.ts')
      writeFileSync(
        file,
        "import { nextEnvironment } from './helpers/next-process.ts'\nvoid nextEnvironment\n",
      )

      expect(isStartingPlanted(file, STARTERS)).toBe(false)
    })
  })
})
