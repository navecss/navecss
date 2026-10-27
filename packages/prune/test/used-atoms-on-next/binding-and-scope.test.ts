/**
 * AC-nextjs-used-atoms-17 for AC-used-atoms-03, -04, -07, -08 and -09 on the plugin run over core's
 * own `atomic.css`: how `cx` is recognised (by its import binding, in every form of `cx.raw`, by
 * lexical scope, in minified dependencies) and which atoms every statically readable argument
 * names. The modules are `.ts` files under `components/` that the fixture's page imports.
 */
import { describe, expect, it } from 'vitest'

import { sorted } from '../helpers/graph-fixture.ts'
import { registerIsolation } from '../helpers/plugin-fixtures.ts'
import { dependency, fileOf, IMPORT, useUsedAtoms } from '../helpers/used-atoms-fixture.ts'

registerIsolation()
const { read } = useUsedAtoms()

describe('AC-nextjs-used-atoms-17: AC-used-atoms-03, cx is recognised by its import binding, never by its name', () => {
  const modules = {
    'components/named.ts': "import { cx } from '@navecss/core/cx'; export const a = cx('flex')\n",
    'components/aliased.ts':
      "import { cx as ncx } from '@navecss/core/cx'; export const b = ncx('grid')\n",
    'components/ns.ts': "import * as N from '@navecss/core/cx'; export const c = N.cx('block')\n",
    'components/lookalike.js':
      "const cx = (...a) => a.join(' '); export const d = cx('inlineFlex')\n",
    'components/local.ts': "import { cx } from './my-cx'; export const e = cx('hFull')\n",
    'components/my-cx.ts': 'export const cx = (...a: string[]) => a.join(" ")\n',
  }

  it('builds green and the layer holds exactly flex, grid and block', async () => {
    const outcome = await read({ modules })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(sorted(['flex', 'grid', 'block']))
  })

  it('gives no error in dev for any module', async () => {
    const outcome = await read({ modules, isDev: true })

    expect(outcome.printed.errors).toEqual([])
    expect(outcome.atoms).toEqual(sorted(['flex', 'grid', 'block']))
  })

  it('control: a lookalike that is the real binding collects, so the fixture reaches the case', async () => {
    const outcome = await read({
      modules: {
        'components/lookalike.js': `${IMPORT}export const d = cx('inlineFlex')\n`,
      },
    })

    expect(outcome.atoms).toEqual(['inlineFlex'])
  })

  it('never collects N.cx.raw(), and fails one module that uses the namespace as a value with one problem', async () => {
    const raw = await read({
      modules: {
        'components/ns.ts':
          "import * as N from '@navecss/core/cx'; export const c = N.cx.raw('x')\n",
      },
    })
    const value = await read({
      modules: {
        'components/q.ts': "import * as N from '@navecss/core/cx'; export const q = [N]\n",
      },
    })

    expect(raw.report).toBeUndefined()
    expect(raw.atoms).toEqual([])
    expect(value.first).toMatch(/^1 problem in 1 file: /u)
    expect(value.problems.map((line) => fileOf(line))).toEqual(['components/q.ts'])
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-04, cx.raw in every form is never collected and never an error', () => {
  const raw = [
    IMPORT,
    "export const r1 = cx.raw('grid', Math.random() > 0.5 && 'x')",
    "export const r2 = cx['raw']('block')",
    "const { raw } = cx; export const r3 = raw('inlineFlex')",
    "const { raw: rr } = cx; export const r4 = rr('hidden')",
    "const r = cx.raw; export const r5 = r('truncate')",
    '',
  ].join('\n')

  it('builds green and the layer holds no rule for any argument', async () => {
    const outcome = await read({ modules: { 'components/raw.ts': raw } })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual([])
  })

  it.each(['const { raw, dynamic } = cx', 'const { raw, ...rest } = cx'])(
    'a copy with line 4 replaced by `%s` fails with one problem on that line',
    async (line) => {
      const lines = raw.split('\n')
      lines[3] = `${line}; export const r3 = raw('inlineFlex')`
      const outcome = await read({ modules: { 'components/raw.ts': lines.join('\n') } })

      expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
      expect(outcome.problems[0]).toMatch(/^components\/raw\.ts:4:/u)
    },
  )
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-07, references are attributed by lexical scope', () => {
  const lines = [
    "import { cx as e } from '@navecss/core/cx'",
    "export const a = e('flex')",
    'export function p(e) { return e.map(String) }',
    'export const q = (e, t) => e + t',
    'export function l() { let e = [1]; return e.map(String) }',
    'export function k() { const e = (x) => x; return [1].map(e) }',
    'export function vv() { e(1); var e = (x) => x; return e }',
    'export function fh() { return [1].map(e); function e(x) { return x } }',
    'export function cl() { class e {} return [e] }',
    'export function ct() { try { throw 1 } catch (e) { return [e].map(String) } }',
    "export function blk() { { let e = 1; void e } return e('grid') }",
    '',
  ]

  it('builds green and the layer holds exactly flex and grid', async () => {
    const outcome = await read({ modules: { 'components/scope.ts': lines.join('\n') } })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(sorted(['flex', 'grid']))
  })

  it('control: renaming each shadowing declaration leaves one problem at each formerly shadowed reference', async () => {
    const renamed = [...lines]
    renamed[2] = 'export function p(z) { return e.map(String) }'
    renamed[3] = 'export const q = (z, t) => e + t'
    renamed[4] = 'export function l() { let z = [1]; return e.map(String) }'
    renamed[5] = 'export function k() { const z = (x) => x; return [1].map(e) }'
    renamed[6] = 'export function vv() { e(1); var z = (x) => x; return e }'
    renamed[7] = 'export function fh() { return [1].map(e); function z(x) { return x } }'
    renamed[8] = 'export function cl() { class z {} return [e] }'
    renamed[9] = 'export function ct() { try { throw 1 } catch (z) { return [e].map(String) } }'
    const outcome = await read({ modules: { 'components/scope.ts': renamed.join('\n') } })

    expect(outcome.first).toMatch(/^9 problems in 1 file: /u)
    const at = (line: number, snippet: string, offset: number): string =>
      `components/scope.ts:${line}:${renamed[line - 1]!.indexOf(snippet) + offset + 1}`
    expect(outcome.problems.map((line) => line.split(': ', 1)[0])).toEqual([
      at(3, 'e.map(String)', 0),
      at(4, 'e + t', 0),
      at(5, 'e.map(String)', 0),
      at(6, '.map(e)', 5),
      at(7, 'e(1)', 2),
      at(7, 'return e', 7),
      at(8, '.map(e)', 5),
      at(9, '[e]', 1),
      at(10, '[e]', 1),
    ])
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-08, well-formed minified dependencies build', () => {
  const minLib = [
    'import{cx as e}from"@navecss/core/cx";',
    'var t=t=>e(`flex`,t&&`grid`);',
    'function n(){return e(`itemsCenter`)}',
    'var r=e=>e.map(String);',
    'export{t as a,n as b,r as pass};',
  ].join('')
  const esbLib = 'import{cx as o}from"@navecss/core/cx";var c="gap",p=()=>o(c);export{p as c};'

  it('guards that the checked-in texts hold the forms the rules name', () => {
    expect(minLib).toContain('`flex`')
    expect(minLib).toMatch(/var r=e=>e\.map\(String\)/u)
    expect(esbLib).toMatch(/var c="gap"/u)
  })

  it('builds green and the layer holds exactly flex, grid, itemsCenter and gap', async () => {
    const outcome = await read({
      packages: {
        'min-lib': dependency('min-lib', { 'index.js': minLib }),
        'esb-lib': dependency('esb-lib', { 'index.js': esbLib }),
      },
    })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(sorted(['flex', 'grid', 'itemsCenter', 'gap']))
  })

  it('control: assigning the binding that holds an atom fails with one problem naming min-lib', async () => {
    const assigned = minLib.replace(
      'function n(){return e(`itemsCenter`)}',
      'function n(){let q=`itemsCenter`;q=`x`;return e(q)}',
    )
    const outcome = await read({
      packages: { 'min-lib': dependency('min-lib', { 'index.js': assigned }) },
    })

    expect(assigned).not.toBe(minLib)
    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.text).toContain('min-lib')
    expect(outcome.problems[0]).toMatch(/node_modules\/min-lib\/index\.js:/u)
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-09, every shape that resolves statically, and the set it gives', () => {
  const source = [
    IMPORT,
    "export const c1 = (props) => cx('flex')",
    'export const c2 = (props) => cx(`grid`)',
    "export const c3 = (props) => cx(null, undefined, false, '')",
    "export const c4 = (props) => cx(props.on && 'block')",
    "export const c5 = (props) => cx(props.on ? 'inlineFlex' : '')",
    "export const c6 = (props) => cx(props.a ? (props.b ? 'flexCol' : 'flexWrap') : null)",
    "export function c7() { const n = 'itemsCenter'; return cx(n) }",
    "export function c8(props) { let m = props.on ? 'itemsStart' : ''; return cx(m) }",
    "export function c9() { var k = 'itemsEnd'; return cx(k) }",
    "export function c10(props) { const x = props.on ? 'justifyCenter' : null; return cx(x ?? 'justifyEnd') }",
    "export function c11(props) { const y = props.on ? 'justifyBetween' : ''; return cx(y || 'flexGrow') }",
    "export function c12() { const w = 'relative'; return () => cx(w) }",
    "export const c13 = (props) => ({ row: cx('absolute'), grid: cx('insetFull') })[props.variant]",
    '',
  ].join('\n')
  const union = [
    'flex',
    'grid',
    'block',
    'inlineFlex',
    'flexCol',
    'flexWrap',
    'itemsCenter',
    'itemsStart',
    'itemsEnd',
    'justifyCenter',
    'justifyEnd',
    'justifyBetween',
    'flexGrow',
    'relative',
    'absolute',
    'insetFull',
  ]

  it('builds green and the layer holds exactly the union of the right-hand column', async () => {
    const outcome = await read({ modules: { 'components/ok.ts': source } })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(sorted(union))
  })

  it('serves the same layer in dev, with nothing printed', async () => {
    const outcome = await read({ modules: { 'components/ok.ts': source }, isDev: true })

    expect(outcome.printed.errors).toEqual([])
    expect(outcome.atoms).toEqual(sorted(union))
  })

  it('control: a call outside the shapes is the one thing that turns the build red', async () => {
    const outcome = await read({
      modules: { 'components/ok.ts': `${source}export const bad = (props) => cx(props.variant)\n` },
    })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
  })
})
