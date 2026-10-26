/**
 * AC-nextjs-used-atoms-17 for the `cxModules` rows of AC-used-atoms-05, and for AC-used-atoms-47
 * (a declared module re-exporting Nave's `cx`, and every importer form), -48 (what a declared
 * module may not do) and -51 (how entries resolve) on the plugin run over core's own `atomic.css`.
 * The barrels sit under `components/`, entries resolve from the directory holding `next.config`,
 * and an alias is a tsconfig `paths` entry (`@/*` names the project directory).
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Scenario } from '../helpers/used-atoms-fixture.ts'

import { sorted } from '../helpers/graph-fixture.ts'
import { registerIsolation } from '../helpers/plugin-fixtures.ts'
import { fileOf, printedList, useUsedAtoms } from '../helpers/used-atoms-fixture.ts'
import { BARREL, BARREL_FILES, IMPORT, REFERENCE_ROWS } from '../helpers/used-atoms-rows.ts'

registerIsolation()
const { build, read, runAgain } = useUsedAtoms()

/**
 * AC-used-atoms-47's declared modules and importers, one module per row.
 */
const UI_FILES: Record<string, string> = {
  'components/ui/index.ts': BARREL,
  'components/ui2.ts': "export * from '@navecss/core/cx'\n",
  'components/ui3.ts': `${IMPORT}export { cx }\n`,
  'components/ui4.ts': "import { cx as c } from '@navecss/core/cx'\nexport { c as cx }\n",
  'components/a.ts': "import { cx } from './ui'\nexport const a = cx('flex')\n",
  'components/b.ts': "import { cx as k } from './ui/index.ts'\nexport const b = k('grid')\n",
  'components/c.ts': "import * as U from './ui2'\nexport const c = U.cx('block')\n",
  'components/d.ts':
    "import { cx } from './ui3'\nexport const d = (on: boolean) => [cx.raw('x'), cx(on && 'gap')]\n",
  'components/e.ts': "import { cx } from './ui4'\nexport const e = cx('hidden')\n",
  'components/f.ts': "import { cx } from '@/components/ui'\nexport const f = cx('truncate')\n",
}
const UI_MODULES = [
  './components/ui/index.ts',
  './components/ui2.ts',
  './components/ui3.ts',
  './components/ui4.ts',
]
const UI_ATOMS = sorted(['flex', 'grid', 'block', 'gap', 'hidden', 'truncate'])

/**
 * Reads the scenario with `cxModules`, then again with the array its report printed, as a reader
 * pasting the remedy does.
 */
async function pasteAndRead(
  scenario: Scenario,
  configured: readonly string[],
): Promise<{
  readonly first: Awaited<ReturnType<typeof read>>
  readonly list: string[] | undefined
  readonly pasted: Awaited<ReturnType<typeof read>> | undefined
}> {
  const first = await read({ ...scenario, options: { ...scenario.options, cxModules: configured } })
  const list = printedList(first.text)
  const pasted =
    list === undefined
      ? undefined
      : await read({ ...scenario, options: { ...scenario.options, cxModules: list } })
  return { first, list, pasted }
}

describe('AC-nextjs-used-atoms-17: AC-used-atoms-05, an undeclared re-export offers cxModules first', () => {
  const barrels = Object.fromEntries(
    REFERENCE_ROWS.filter(([, file]) => BARREL_FILES.includes(file as never)).map(
      ([, file, text]) => [file, text],
    ),
  )

  it('prints one array naming every listable barrel, once, before the direct import', async () => {
    const outcome = await read({ modules: barrels })
    const lines = outcome.text.split('\n').filter((line) => line.includes('cxModules: ['))

    expect(outcome.first).toMatch(/^4 problems in 4 files: /u)
    expect(lines).toHaveLength(1)
    expect(printedList(outcome.text)).toEqual([
      './components/utils.js',
      './components/utils2.js',
      './components/utils3.js',
      './components/utils4.js',
    ])
    expect(lines[0]).toContain('list it in withNave()')
    expect(lines[0]!.indexOf('cxModules: [')).toBeLessThan(
      lines[0]!.indexOf('import cx from @navecss/core/cx directly'),
    )
    expect(outcome.text).not.toContain('navePlugin()')
  })

  it('with a list already present, one paste is enough and the two barrels no longer alternate', async () => {
    const { first, list, pasted } = await pasteAndRead(
      {
        modules: {
          'components/ui/index.ts': BARREL,
          'components/other.ts': BARREL,
          'components/a.ts': "import { cx } from './ui'\nexport const a = cx('flex')\n",
          'components/b.ts': "import { cx } from './other'\nexport const b = cx('grid')\n",
        },
      },
      ['./components/ui/index.ts'],
    )

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems.map((line) => fileOf(line))).toEqual(['components/other.ts'])
    expect(list).toEqual(['./components/ui/index.ts', './components/other.ts'])
    expect(pasted?.report).toBeUndefined()
    expect(pasted?.atoms).toEqual(sorted(['flex', 'grid']))
  })

  it('builds the first three green once declared, and the namespace row still fails', async () => {
    const outcome = await read({
      modules: barrels,
      options: {
        cxModules: ['./components/utils.js', './components/utils2.js', './components/utils3.js'],
      },
    })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.problems.map((line) => fileOf(line))).toEqual(['components/utils4.js'])
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-47, a declared module re-exporting Nave’s cx, and every importer form', () => {
  const scenario = { modules: UI_FILES, options: { cxModules: UI_MODULES } }

  it('builds green and the layer names exactly the atoms the importers name', async () => {
    const outcome = await read(scenario)

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(UI_ATOMS)
  })

  it('serves the same layer in dev, with nothing printed', async () => {
    const outcome = await read({ ...scenario, isDev: true })

    expect(outcome.printed.errors).toEqual([])
    expect(outcome.atoms).toEqual(UI_ATOMS)
  })

  it('control: with cxModules empty, one problem on each declared module and none on an importer', async () => {
    const outcome = await read({ modules: UI_FILES })

    expect(outcome.first).toMatch(/^4 problems in 4 files: /u)
    expect(
      outcome.problems.map((line) => fileOf(line)).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual([
      'components/ui/index.ts',
      'components/ui2.ts',
      'components/ui3.ts',
      'components/ui4.ts',
    ])
  })

  it('fails an importer’s unreadable call, and a declared module’s own, in the file that holds it', async () => {
    const importer = await read({
      ...scenario,
      modules: {
        ...UI_FILES,
        'components/g.ts': "import { cx } from './ui'\nexport const g = (v: string) => cx(v)\n",
      },
    })
    const namespace = await read({
      ...scenario,
      modules: {
        ...UI_FILES,
        'components/c.ts': "import * as U from './ui2'\nexport const c = (v: string) => U.cx(v)\n",
      },
    })
    const declared = await read({
      ...scenario,
      modules: {
        ...UI_FILES,
        'components/ui3.ts': `${IMPORT}export { cx }\nexport const k = (v: string) => cx(v)\n`,
      },
    })

    expect(importer.problems.map((line) => fileOf(line))).toEqual(['components/g.ts'])
    expect(importer.first).toMatch(/^1 problem in 1 file: /u)
    expect(namespace.problems.map((line) => fileOf(line))).toEqual(['components/c.ts'])
    expect(declared.problems.map((line) => fileOf(line))).toEqual(['components/ui3.ts'])
  })

  it('reads an importer that writes `.` or `..`, and fails no build-end check', async () => {
    const outcome = await read({
      ...scenario,
      modules: {
        ...UI_FILES,
        'components/ui/button.ts': "import { cx } from '.'\nexport const g1 = cx('inlineFlex')\n",
        'components/ui/forms/field.ts':
          "import { cx } from '..'\nexport const g2 = cx('relative')\n",
      },
    })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(sorted([...UI_ATOMS, 'inlineFlex', 'relative']))
  })

  it('reads a call made through a query spelling of the barrel, never green with no rule for it', async () => {
    const outcome = await read({
      modules: {
        'components/ui/index.ts': BARREL,
        'components/q.ts': "import { cx } from './ui?v=1'\nexport const q = cx('flex')\n",
      },
      options: { cxModules: ['./components/ui/index.ts'] },
    })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(['flex'])
  })

  it('fails a dynamic import of the query spelling as one problem in the importer', async () => {
    const outcome = await read({
      modules: {
        'components/ui/index.ts': BARREL,
        'components/q.ts': "export const q = import('./ui?v=1').then((m) => m.cx('flex'))\n",
      },
      options: { cxModules: ['./components/ui/index.ts'] },
    })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.problems.map((line) => fileOf(line))).toEqual(['components/q.ts'])
  })

  describe('a namespace import of a declared module is read for its other exports', () => {
    const barrel = `${BARREL}export const Button = 'b'\n`
    const ns = "import * as U from './ui'\n"
    const options = { cxModules: ['./components/ui/index.ts'] }
    const reads: [string, string, string[]][] = [
      ['a member', `${ns}export const h = U.Button\n`, []],
      ['a member beside a call', `${ns}export const i = [U.cx('flex'), U.Button]\n`, ['flex']],
      ['a string key', `${ns}export const j = U['Button']\n`, []],
      ['a destructuring', `${ns}const { Button } = U\nexport const k = Button\n`, []],
    ]
    const refused: [string, string][] = [
      ['passed', `${ns}export const l = f(U)\n`],
      ['spread', `${ns}export const m = ({ ...U })\n`],
      ['read by a computed key', `${ns}export const n = (k: string) => U[k]\n`],
      ['destructured by cx', `${ns}const { cx: c } = U\nexport const o = c\n`],
      [
        'destructured with a rest element',
        `${ns}const { Button, ...rest } = U\nexport const p = [Button, rest]\n`,
      ],
    ]

    it.each(reads)('%s is no use of cx, built alone and green', async (_row, text, expected) => {
      const outcome = await read({
        modules: { 'components/ui/index.ts': barrel, 'components/h.ts': text },
        options,
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(sorted(expected))
    })

    it('reads a package’s namespace for its component and its cx', async () => {
      const outcome = await read({
        modules: {
          'components/App.tsx':
            "import * as UI from '@acme/ui'\nexport const A = () => [UI.Button, UI.cx('grid')]\n",
        },
        packages: {
          '@acme/ui': {
            'package.json': JSON.stringify({
              name: '@acme/ui',
              version: '1.0.0',
              main: 'index.js',
            }),
            'index.js': barrel,
          },
        },
        options: { cxModules: ['@acme/ui'] },
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(['grid'])
    })

    it.each(refused)('%s is one problem in the importer, built alone', async (_row, text) => {
      const outcome = await read({
        modules: { 'components/ui/index.ts': barrel, 'components/h.ts': text },
        options,
      })

      expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
      expect(outcome.problems.map((line) => fileOf(line))).toEqual(['components/h.ts'])
    })
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-48, what a declared module may not do, and the hidden second hop', () => {
  const rows: [string, string, number][] = [
    ['another name', "export { cx as x } from '@navecss/core/cx'\n", 1],
    ['a default', `${IMPORT}export default cx\n`, 1],
    ['a namespace', "export * as n from '@navecss/core/cx'\n", 1],
    ['not Nave’s', "export const cx = (...a) => a.join(' ')\n", 1],
    [
      'a wrapper',
      "import { cx as n } from '@navecss/core/cx'\nexport const cx = (...a) => n(...a)\n",
      2,
    ],
    ['a second hop', "export { cx } from './ui/index.ts'\n", 1],
  ]
  const declared = ['./components/ui/index.ts', './components/bad.ts']

  it.each(rows)('%s alone fails in the declared module', async (_row, text, count) => {
    const outcome = await read({
      modules: { 'components/ui/index.ts': BARREL, 'components/bad.ts': text },
      options: { cxModules: declared },
    })

    expect(outcome.first).toMatch(new RegExp(`^${count} problems? in 1 file: `, 'u'))
    expect(outcome.problems.map((line) => fileOf(line))).toEqual(
      Array.from({ length: count }, () => 'components/bad.ts'),
    )
    expect(outcome.printed.warnings).toEqual([])
  })

  it('control: each row replaced by the plain re-export builds green', async () => {
    const outcome = await read({
      modules: { 'components/ui/index.ts': BARREL, 'components/bad.ts': BARREL },
      options: { cxModules: declared },
    })

    expect(outcome.report).toBeUndefined()
  })

  it('fails a re-export of a declared module in an undeclared one, and a dynamic import of it', async () => {
    const options = { cxModules: ['./components/ui/index.ts'] }
    const hop = await read({
      modules: {
        'components/ui/index.ts': BARREL,
        'components/hop.ts': "export * from './ui/index.ts'\n",
        'components/use.ts': "import { cx } from './hop.ts'\nexport const u = cx('flex')\n",
      },
      options,
    })
    const dynamic = await read({
      modules: {
        'components/ui/index.ts': BARREL,
        'components/dyn.ts': "export const d = import('./ui/index.ts').then((m) => m.cx('flex'))\n",
      },
      options,
    })

    expect(hop.first).toMatch(/^1 problem in 1 file: /u)
    expect(hop.problems.map((line) => fileOf(line))).toEqual(['components/hop.ts'])
    expect(dynamic.first).toMatch(/^1 problem in 1 file: /u)
    expect(dynamic.problems.map((line) => fileOf(line))).toEqual(['components/dyn.ts'])
    expect(dynamic.text).toContain('a dynamic import of cx')
    expect(hop.printed.warnings).toEqual([])
    expect(dynamic.printed.warnings).toEqual([])
  })

  it('control: an undeclared module importing the declared one and calling cx builds green', async () => {
    const outcome = await read({
      modules: {
        'components/ui/index.ts': BARREL,
        'components/hop.ts': "import { cx } from './ui/index.ts'\nexport const h = cx('flex')\n",
      },
      options: { cxModules: ['./components/ui/index.ts'] },
    })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(['flex'])
  })

  describe('a star never lets a cx that is not Nave’s through unreported', () => {
    const options = { cxModules: ['./components/ui/index.ts'] }
    const user = "import { cx } from './ui'\nexport const a = cx('flex')\n"
    const stars: [string, string, Record<string, string>, string][] = [
      [
        'a star from a module that exports its own cx',
        "export * from './helpers'\n",
        {
          'components/ui/helpers.ts':
            "export const cx = (...a: string[]) => a.filter(Boolean).join(' ')\n",
        },
        '1 problem in 1 file',
      ],
      [
        'a star re-exported as cx',
        "export * as cx from './other'\n",
        { 'components/ui/other.ts': "export const Button = 'b'\n" },
        '1 problem in 1 file',
      ],
      [
        'a star from a module that is itself a Nave barrel',
        "export * from './inner'\n",
        { 'components/ui/inner.ts': BARREL },
        '2 problems in 2 files',
      ],
      [
        'a star from a module with no cx',
        "export * from './parts'\n",
        { 'components/ui/parts.ts': "export const Button = 'b'\n" },
        '1 problem in 1 file',
      ],
    ]

    it.each(stars)(
      '%s alone is a problem at the star, none in the importer',
      async (_row, barrel, others, count) => {
        const outcome = await read({
          modules: { 'components/ui/index.ts': barrel, 'components/a.ts': user, ...others },
          options,
        })

        expect(outcome.first.startsWith(count)).toBe(true)
        expect(
          outcome.problems.some((line) => line.startsWith('components/ui/index.ts:1:1: ')),
        ).toBe(true)
        expect(outcome.problems.some((line) => line.startsWith('components/a.ts:'))).toBe(false)
        expect(outcome.printed.warnings).toEqual([])
      },
    )

    it('the three export * from rows print the same message at the star, and it offers the explicit re-export', async () => {
      const messages: string[] = []
      const starRows = stars.filter((row) => row[1].startsWith('export * from'))
      for (const [, barrel, others] of starRows) {
        const outcome = await read({
          modules: { 'components/ui/index.ts': barrel, 'components/a.ts': user, ...others },
          options,
        })
        messages.push(
          outcome.problems.find((line) => line.startsWith('components/ui/index.ts:1:1: '))!,
        )
      }

      expect(new Set(messages).size).toBe(1)
      expect(messages[0]).toContain('this export can give it a cx the build does not follow')
    })

    it('control: an explicit re-export beside a star is no problem, and the importer’s call is read', async () => {
      const outcome = await read({
        modules: {
          'components/ui/index.ts': `${BARREL}export * from './parts'\n`,
          'components/ui/parts.ts': "export const Button = 'b'\n",
          'components/a.ts': user,
        },
        options,
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(['flex'])
    })
  })

  describe('a star from a declared module beside the module’s own Nave cx', () => {
    const forms = `${BARREL}export const Field = 'f'\n`
    const user = "import { cx, Field } from './ui'\nexport const a = [cx('flex'), Field]\n"
    const rows: [string, string][] = [
      ['A8: Nave’s cx by a star', "export * from '@navecss/core/cx'\nexport * from './forms'\n"],
      ['A7: Nave’s cx by an explicit export', `${BARREL}export * from './forms'\n`],
    ]

    it.each(rows)(
      '%s is one problem on the second barrel, and its printed array pasted is green',
      async (_row, barrel) => {
        const { first, list, pasted } = await pasteAndRead(
          {
            modules: {
              'components/ui/index.ts': barrel,
              'components/ui/forms/index.ts': forms,
              'components/a.ts': user,
            },
          },
          ['./components/ui/index.ts'],
        )

        expect(first.first).toMatch(/^1 problem in 1 file: /u)
        expect(first.problems.map((line) => fileOf(line))).toEqual(['components/ui/forms/index.ts'])
        expect(list).toEqual(['./components/ui/index.ts', './components/ui/forms/index.ts'])
        expect(pasted?.report).toBeUndefined()
        expect(pasted?.atoms).toEqual(['flex'])
      },
    )

    it('control: a barrel whose only export is a star of a second listed barrel is one problem at that star', async () => {
      const outcome = await read({
        modules: {
          'components/ui/index.ts': "export * from './forms'\n",
          'components/ui/forms/index.ts': forms,
          'components/a.ts': user,
        },
        options: { cxModules: ['./components/ui/index.ts', './components/ui/forms/index.ts'] },
      })

      expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
      expect(outcome.problems[0]).toMatch(/^components\/ui\/index\.ts:1:1: /u)
    })
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-51, cxModules entries resolve from the directory holding next.config', () => {
  const files = {
    'components/ui/index.ts': BARREL,
    'components/a.ts': UI_FILES['components/a.ts']!,
  }

  it('(a) an entry that resolves to nothing is no error and no message', async () => {
    const outcome = await read({
      modules: files,
      options: { cxModules: ['./components/ui/index.ts', './components/missing.ts'] },
    })

    expect(outcome.report).toBeUndefined()
    expect(outcome.printed.warnings).toEqual([])
    expect(outcome.printed.errors).toEqual([])
    expect(outcome.atoms).toEqual(['flex'])
  })

  it('(b) a typo fails on the undeclared barrel, whose first remedy prints the whole list with that barrel, and pasting it builds green', async () => {
    const { first, list, pasted } = await pasteAndRead({ modules: files }, [
      './components/ui/indx.ts',
    ])
    const remedy = first.text.split('\n', 3)[2]

    expect(first.first).toMatch(/^1 problem in 1 file: /u)
    expect(first.problems.map((line) => fileOf(line))).toEqual(['components/ui/index.ts'])
    expect(remedy).toContain("cxModules: ['./components/ui/indx.ts', './components/ui/index.ts']")
    expect(list).toEqual(['./components/ui/indx.ts', './components/ui/index.ts'])
    expect(pasted?.report).toBeUndefined()
    expect(pasted?.atoms).toEqual(['flex'])
  })

  it('(d) the entry written as the barrel’s absolute path', async () => {
    const project = await build({ modules: files })
    const outcome = await runAgain(project, {
      options: { cxModules: [path.join(project.dir, 'components/ui/index.ts')] },
    })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(['flex'])
  })

  describe('a relative entry matches by its file only, and Nave’s own module is no entry', () => {
    it('reads the barrel outside the code directories through the entry’s file and leaves a sibling ./ui alone', async () => {
      const outcome = await read({
        modules: {
          'components/a.ts': "import { cx } from '../ui'\nexport const a = cx('flex')\n",
          'components/feature/ui.ts': "export const cx = (...a: string[]) => a.join(' ')\n",
          'components/feature/b.ts':
            "import { cx } from './ui'\nexport const b = (v: string) => cx('card', v)\n",
        },
        files: { 'ui/index.ts': BARREL },
        options: { cxModules: ['./ui'] },
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(['flex'])
    })

    it('with the barrel inside components, an entry written as the importer writes it does nothing, and its printed array pastes green', async () => {
      const { first, list, pasted } = await pasteAndRead({ modules: files }, ['./ui'])

      expect(first.first).toMatch(/^1 problem in 1 file: /u)
      expect(first.problems.map((line) => fileOf(line))).toEqual(['components/ui/index.ts'])
      expect(list).toEqual(['./ui', './components/ui/index.ts'])
      expect(pasted?.report).toBeUndefined()
      expect(pasted?.atoms).toEqual(['flex'])
    })

    const direct = "import { cx } from '@navecss/core/cx'\nexport const d = cx('grid')\n"

    it('ignores the entry @navecss/core/cx on its own', async () => {
      const outcome = await read({
        modules: { 'components/d.ts': direct },
        options: { cxModules: ['@navecss/core/cx'] },
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(['grid'])
    })

    it('ignores the entry @navecss/core/cx beside the barrel’s entry', async () => {
      const outcome = await read({
        modules: { ...files, 'components/d.ts': direct },
        options: { cxModules: ['./components/ui/index.ts', '@navecss/core/cx'] },
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(sorted(['flex', 'grid']))
    })
  })

  describe('a # entry binds by file, never by its text alone', () => {
    const JOIN = "export const cx = (...a: string[]) => a.join(' ')\n"
    const scenario = (scope: Record<string, string>): Scenario => ({
      modules: {
        'components/ui/index.ts': BARREL,
        'components/feature/join.ts': JOIN,
        'components/feature/b.ts':
          "import { cx } from '#ds'\nexport const b = (v: string) => cx('card', v)\n",
        'components/a.ts': "import { cx } from '#ds'\nexport const a = cx('flex')\n",
      },
      files: {
        'components/feature/package.json': '{ "imports": { "#ds": "./join.ts" } }\n',
        ...scope,
      },
      options: { cxModules: ['./components/ui/index.ts', '#ds'] },
    })

    it.each([
      [
        'a nested scope maps #ds to the barrel',
        { 'components/package.json': '{ "imports": { "#ds": "./ui/index.ts" } }\n' },
      ],
      [
        'the root scope maps #ds to the barrel',
        {
          'package.json':
            '{ "private": true, "type": "module", "imports": { "#ds": "./components/ui/index.ts" } }\n',
        },
      ],
    ])(
      'where %s, another scope’s own #ds is no cx, and the barrel’s importer is read',
      async (_row, scope) => {
        const outcome = await read(scenario(scope))

        expect(outcome.report).toBeUndefined()
        expect(outcome.atoms).toEqual(['flex'])
      },
    )

    const nested = {
      files: { 'components/package.json': '{ "imports": { "#ds": "./ui/index.ts" } }\n' },
      modules: {
        'components/ui/index.ts': BARREL,
        'components/a.ts': "import { cx } from '#ds'\nexport const a = cx('grid')\n",
      },
    }

    it('is green with grid when only the barrel is listed: the import is read as the file its scope maps it to', async () => {
      const outcome = await read({
        ...nested,
        options: { cxModules: ['./components/ui/index.ts'] },
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.printed).toEqual({ errors: [], warnings: [] })
      expect(outcome.atoms).toEqual(['grid'])
    })

    it('is green with grid when the array the Vite plugin prints, with the # entry added, is pasted', async () => {
      const outcome = await read({
        ...nested,
        options: { cxModules: ['./components/ui/index.ts', '#ds'] },
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.atoms).toEqual(['grid'])
    })

    it('control: without cxModules the build fails with one problem, positioned in the barrel', async () => {
      const outcome = await read({ ...nested, options: {} })

      expect(outcome.text).toMatch(/^1 problem in 1 file: /u)
      expect(outcome.text).toContain('components/ui/index.ts:')
    })
  })
})
