/**
 * AC-eslint-plugin-10 covers: R5, R6 (how a `cxModules` entry matches an import: a relative entry
 * by its file only, a `#` entry by its file where the import resolves, an alias or an absolute
 * entry as written), through the plugin's real rules on real files.
 */
import { RuleTester } from 'eslint'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe } from 'vitest'

import { countEscapesRule } from '../src/rules/count-escapes.ts'
import { rawReasonRule } from '../src/rules/raw-reason.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
}

const ruleTester = new RuleTester()
const RULES = [rawReasonRule, countEscapesRule]

const BARREL = "export { cx } from '@navecss/core/cx'\n"
const JOIN = "export const cx = (...names) => names.filter(Boolean).join(' ')\n"

/**
 * A scratch project, its files written at once so the cases below can name them.
 */
function project(files: Record<string, string>): string {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-eslint-plugin-match-'))
  const root = realpathSync(scratch)
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), text)
  }
  return root
}

/**
 * Runs the cases of the enclosing describe from `root`: a `cxModules` entry resolves from the
 * working directory at lint time, which is when the vitest integration runs each case.
 */
function useCwd(root: string): void {
  let before: string
  beforeEach(() => {
    before = process.cwd()
    process.chdir(root)
  })
  afterEach(() => {
    process.chdir(before)
  })
}

const settingsOf = (cxModules: string[]): { '@navecss': { cxModules: string[] } } => ({
  '@navecss': { cxModules },
})

const call = (source: string): string => `import { cx } from '${source}'\ncx.raw('x')\n`

describe('AC-10: how a cxModules entry matches an import', () => {
  afterAll(() => {
    process.chdir(path.resolve(import.meta.dirname, '..'))
  })

  describe('a relative entry matches by its file only, never as written', () => {
    const root = project({ 'src/feature/ui.js': JOIN, 'src/feature/b.js': '' })
    useCwd(root)
    for (const rule of RULES) {
      ruleTester.run('raw', rule, {
        valid: [
          {
            // `./ui` names no file from the working directory, and in `src/feature` it is a sibling
            // join function, not Nave's `cx`.
            code: call('./ui'),
            languageOptions,
            settings: settingsOf(['./ui']),
            filename: path.join(root, 'src/feature/b.js'),
          },
        ],
        invalid: [],
      })
    }
  })

  describe('control: a relative entry naming the barrel from the working directory still matches another directory', () => {
    const root = project({
      'src/ui/index.js': BARREL,
      'src/a/x.js': '',
      'src/b/c/y.js': '',
    })
    useCwd(root)
    for (const rule of RULES) {
      ruleTester.run('raw', rule, {
        valid: [],
        invalid: [
          {
            code: call('../ui/index.js'),
            languageOptions,
            settings: settingsOf(['./src/ui/index.js']),
            filename: path.join(root, 'src/a/x.js'),
            errors: 1,
          },
          {
            code: call('../../ui/index.js'),
            languageOptions,
            settings: settingsOf(['./src/ui/index.js']),
            filename: path.join(root, 'src/b/c/y.js'),
            errors: 1,
          },
        ],
      })
    }
  })

  describe('an alias entry and an absolute entry still match as written, from any directory', () => {
    const root = project({ 'src/a/x.js': '', 'src/b/y.js': '' })
    useCwd(root)
    const settings = settingsOf(['~/ui/cx', '/src/ui/cx.js'])
    for (const rule of RULES) {
      ruleTester.run('raw', rule, {
        valid: [],
        invalid: [
          { source: '~/ui/cx', file: 'src/a/x.js' },
          { source: '/src/ui/cx.js', file: 'src/a/x.js' },
          { source: '~/ui/cx', file: 'src/b/y.js' },
          { source: '/src/ui/cx.js', file: 'src/b/y.js' },
        ].map(({ source, file }) => ({
          code: call(source),
          languageOptions,
          settings,
          filename: path.join(root, file),
          errors: 1,
        })),
      })
    }
  })

  describe('a # entry binds by file when the import resolves', () => {
    const root = project({
      'src/package.json': '{ "imports": { "#ds": "./ui/index.js" } }\n',
      'src/ui/index.js': BARREL,
      'src/feature/package.json': '{ "imports": { "#ds": "./join.js" } }\n',
      'src/feature/join.js': JOIN,
      'src/feature/b.js': '',
      'src/a.js': '',
    })
    useCwd(root)
    const settings = settingsOf(['./src/ui/index.js', '#ds'])
    for (const rule of RULES) {
      ruleTester.run('raw', rule, {
        valid: [
          {
            // In this package scope `#ds` is a join function: it binds nothing.
            code: call('#ds'),
            languageOptions,
            settings,
            filename: path.join(root, 'src/feature/b.js'),
          },
        ],
        invalid: [
          {
            // Control: under `src`, `#ds` is the barrel.
            code: call('#ds'),
            languageOptions,
            settings,
            filename: path.join(root, 'src/a.js'),
            errors: 1,
          },
        ],
      })
    }
  })

  describe('a # alias this plugin cannot resolve is matched as written; a # entry mapped only in a nested package.json is not', () => {
    const bare = project({ 'src/c.js': '' })
    const nested = project({
      'src/feature/package.json': '{ "imports": { "#ds": "./ui/index.js" } }\n',
      'src/feature/ui/index.js': BARREL,
      'src/feature/c.js': '',
    })
    describe('no package.json maps it (a tsconfig paths or bundler alias)', () => {
      useCwd(bare)
      for (const rule of RULES) {
        ruleTester.run('raw', rule, {
          valid: [],
          invalid: [
            {
              code: call('#ds'),
              languageOptions,
              settings: settingsOf(['#ds']),
              filename: path.join(bare, 'src/c.js'),
              errors: 1,
            },
          ],
        })
      }
    })
    describe('only src/feature/package.json maps it to the barrel', () => {
      useCwd(nested)
      for (const rule of RULES) {
        ruleTester.run('raw', rule, {
          valid: [
            {
              code: call('#ds'),
              languageOptions,
              settings: settingsOf(['#ds']),
              filename: path.join(nested, 'src/feature/c.js'),
            },
          ],
          invalid: [],
        })
      }
    })
  })
})
