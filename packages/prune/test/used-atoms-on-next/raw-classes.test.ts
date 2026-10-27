/**
 * AC-nextjs-used-atoms-17 for AC-used-atoms-30 (a written `nave-*` class is emitted on identifier
 * boundaries, Nave's own modules excluded) and AC-used-atoms-31 (a Nave class built from pieces is a
 * build error, a token reference is not) on the plugin run over core's own `atomic.css`. The
 * `.svelte` row and its control are dropped: only the JavaScript rules apply on Next.js.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { sorted } from '../helpers/graph-fixture.ts'
import { registerIsolation } from '../helpers/plugin-fixtures.ts'
import { CORE_ROOT } from '../helpers/project.ts'
import { dependency, fileOf, plainDependency, useUsedAtoms } from '../helpers/used-atoms-fixture.ts'
import {
  EMPTY_CONTINUES_ROWS,
  EXEMPT_PIECE_ROWS,
  IMPORT,
  PIECED_CLASS_ROWS,
  pieceModule,
  TOKEN_ROWS,
} from '../helpers/used-atoms-rows.ts'

registerIsolation()
const { build, read, runAgain } = useUsedAtoms()

const STRINGS = [
  "export const s1 = 'nave-block'",
  "export const s2 = 'a nave-inline-block,b'",
  "export const s3 = 'nave-flex-col'",
  "export const s4 = 'x\tnave-items-center'",
  String.raw`export const s5 = 'a\nnave-no-wrap'`,
  "export const s6 = '.nave-wrap-x nave-flex-wrap:hover'",
  "export const s7 = '--nave-justify-end'",
  "export const s8 = 'data-nave-justify-center'",
  "export const s9 = 'nave-flexx'",
  "export const s10 = 'anave-truncate'",
  '',
].join('\n')

const WRITTEN = [
  'flex',
  'hidden',
  'grid',
  'block',
  'inlineBlock',
  'flexCol',
  'itemsCenter',
  'flexWrap',
  'noWrap',
]

/**
 * The scenario of AC-used-atoms-30 without its Svelte component: a JSX literal stands in for it.
 */
const WRITTEN_CLASSES = {
  modules: {
    'components/App.ts': `${IMPORT}export const a = cx('flex')\n`,
    'components/Hidden.tsx': 'export const H = () => <div className="nave-hidden">h</div>\n',
    'components/strings.js': STRINGS,
  },
  packages: {
    'ui-lib': plainDependency('ui-lib', { 'index.js': 'export const c = "nave-grid"\n' }),
  },
}

describe('AC-nextjs-used-atoms-17: AC-used-atoms-30, literal classes match on CSS identifier boundaries', () => {
  it('the layer holds exactly the atoms written whole, a dependency that imports no cx included', async () => {
    const outcome = await read(WRITTEN_CLASSES)

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(sorted(WRITTEN))
  })

  it('the same layer is served in dev', async () => {
    const outcome = await read({ ...WRITTEN_CLASSES, isDev: true })

    expect(outcome.printed.errors).toEqual([])
    expect(outcome.atoms).toEqual(sorted(WRITTEN))
  })

  it('control: a whitespace-only matcher would miss the class after a tab, so the tab row reaches the rule', async () => {
    const outcome = await read({
      modules: { 'components/s.js': "export const s = 'x\tnave-items-center'\n" },
    })

    expect(outcome.atoms).toEqual(['itemsCenter'])
  })

  it('control: a scratch copy of core’s installed cx.js with another class appended is not matched', async () => {
    const app = { 'components/App.ts': `${IMPORT}export const a = cx('flex')\n` }
    const project = await build({ modules: app })
    // A real copy of core in place of the link, with a class appended to its cx module.
    const scope = path.join(project.dir, 'node_modules/@navecss')
    rmSync(path.join(scope, 'core'), { recursive: true })
    mkdirSync(path.join(scope, 'core'), { recursive: true })
    cpSync(path.join(CORE_ROOT, 'package.json'), path.join(scope, 'core/package.json'))
    cpSync(path.join(CORE_ROOT, 'dist'), path.join(scope, 'core/dist'), { recursive: true })
    const cxModule = path.join(scope, 'core/dist/cx.js')
    writeFileSync(cxModule, `${readFileSync(cxModule, 'utf8')}\n"nave-justify-between";\n`)
    const withCopy = await runAgain(project)
    // The same class in a module of the application is read.
    const inApplication = await read({
      modules: { ...app, 'components/s.js': "export const s = 'nave-justify-between'\n" },
    })

    expect(readFileSync(cxModule, 'utf8')).toContain('nave-justify-between')
    expect(withCopy.report).toBeUndefined()
    expect(withCopy.atoms).toEqual(['flex'])
    expect(inApplication.atoms).toEqual(sorted(['flex', 'justifyBetween']))
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-31, a Nave class built from pieces is a build error; a token reference is not', () => {
  it.each(PIECED_CLASS_ROWS)(
    'refuses %s with one problem at the piece',
    async (expression, offset) => {
      const { text, column } = pieceModule(expression)
      const outcome = await read({ modules: { 'components/row.js': text } })

      expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
      expect(outcome.problems[0]).toContain(`components/row.js:3:${column + offset}: `)
      expect(outcome.text).toContain('a Nave class built from pieces is invisible to the build')
      expect(outcome.printed.warnings).toEqual([])
    },
  )

  it.each(TOKEN_ROWS)('allows %s, with no problem and no warning', async (expression) => {
    const outcome = await read({ modules: { 'components/row.js': pieceModule(expression).text } })

    expect(outcome.report).toBeUndefined()
    expect(outcome.printed.warnings).toEqual([])
    // The one piece that is a whole class, `nave-flex `, is a written class and ships its rule.
    expect(outcome.atoms).toEqual(expression === "'nave-flex ' + tone" ? ['flex'] : [])
  })

  it.each(EXEMPT_PIECE_ROWS)(
    'allows %s, and the layer holds exactly its atoms',
    async (expression, expected) => {
      const outcome = await read({
        modules: { 'components/row.js': pieceModule(expression).text },
      })

      expect(outcome.report).toBeUndefined()
      expect(outcome.printed.warnings).toEqual([])
      expect(outcome.atoms).toEqual(sorted(expected))
    },
  )

  it.each(EMPTY_CONTINUES_ROWS)('refuses %s with one concatenation problem', async (expression) => {
    const outcome = await read({ modules: { 'components/row.js': pieceModule(expression).text } })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.text).toContain('a Nave class built from pieces is invisible to the build')
  })

  it('refuses it in a dependency that imports cx, and not in one that does not', async () => {
    const outcome = await read({
      packages: {
        'dep-cx': dependency('dep-cx', {
          'index.js': `${IMPORT}export const a = (t) => 'nave-' + t\nexport const f = cx('flex')\n`,
        }),
        'dep-plain': plainDependency('dep-plain', {
          'index.js': "export const b = (t) => 'nave-' + t\n",
        }),
      },
    })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.problems).toHaveLength(1)
    expect(outcome.problems[0]).toMatch(/^node_modules\/dep-cx\/index\.js:/u)
    expect(outcome.text).toContain('dep-cx')
    expect(outcome.text).not.toContain('dep-plain')
  })

  it('every application error row gives its problem on the dev terminal, and no green row does', async () => {
    const errors = Object.fromEntries(
      PIECED_CLASS_ROWS.map(([expression], index) => [
        `components/piece${index}.js`,
        pieceModule(expression).text,
      ]),
    )
    const greens = Object.fromEntries(
      TOKEN_ROWS.map((expression, index) => [
        `components/token${index}.js`,
        pieceModule(expression).text,
      ]),
    )
    const outcome = await read({ modules: { ...errors, ...greens }, isDev: true })

    expect(outcome.printed.errors).toHaveLength(1)
    const files = outcome.problems
      .map((line) => fileOf(line))
      .toSorted((a, b) => a.localeCompare(b))
    expect(files).toEqual(Object.keys(errors).toSorted((a, b) => a.localeCompare(b)))
    expect(outcome.printed.errors[0]).toMatch(
      new RegExp(`^${PIECED_CLASS_ROWS.length} problems`, 'u'),
    )
  })
})
