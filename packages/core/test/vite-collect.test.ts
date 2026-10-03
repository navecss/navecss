/**
 * The collector on its own, over the module text the post-order half sees: which atoms a
 * module's `cx()` calls name (AC-used-atoms-03, -07, -09), which uses of the binding it refuses
 * (AC-used-atoms-04, -05, -10), the hint rule for a literal that is no atom (AC-used-atoms-11),
 * and the literal `nave-*` classes it matches or refuses (AC-used-atoms-30, -31). The build-level
 * fixtures in vite-used-atoms-*.test.ts run the same rows through a real `vite build`.
 */
import { atoms } from '../src/atoms.ts'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import { CX_SOURCE, type ModuleReading, readModule } from '../src/vite-collect.ts'
import type { AstNode } from '../src/vite-ast.ts'

const IMPORT = `import { cx } from '${CX_SOURCE}'\n`

/**
 * Reads `code` as an application module that may name `own` as the consumer's atoms.
 */
function read(code: string, own: readonly string[] = [], isDependency = false): ModuleReading {
  return readModule(code, parseAst(code) as unknown as AstNode, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: new Set(own),
    isDependency,
  })
}

describe('AC-used-atoms-03 — cx is recognised by its import binding, never by its name', () => {
  const rows: [string, string, string[]][] = [
    ['named', `${IMPORT}export const a = cx('flex')`, ['flex']],
    ['aliased', `import { cx as ncx } from '${CX_SOURCE}'\nexport const b = ncx('grid')`, ['grid']],
    ['namespace', `import * as N from '${CX_SOURCE}'\nexport const c = N.cx('block')`, ['block']],
    ['lookalike', `const cx = (...a) => a.join(' ')\nexport const d = cx('inlineFlex')`, []],
    ['local', `import { cx } from './my-cx'\nexport const e = cx('hFull')`, []],
  ]
  it.each(rows)('%s', (_name, code, expected) => {
    const reading = read(code)
    expect([...reading.atoms]).toEqual(expected)
    expect(reading.problems).toEqual([])
  })

  it('refuses a namespace that is used as anything but N.cx, and never collects N.cx.raw', () => {
    const raw = read(`import * as N from '${CX_SOURCE}'\nexport const r = N.cx.raw('x')`)
    expect(raw.atoms.size).toBe(0)
    expect(raw.problems).toEqual([])

    const bad = read(`import * as N from '${CX_SOURCE}'\nexport const q = [N]`)
    expect(bad.problems.map((p) => p.kind)).toEqual(['reference'])
  })
})

describe('AC-used-atoms-04 — cx.raw in every form is never collected and never an error', () => {
  const lines = [
    "export const r1 = cx.raw('grid', Math.random() > 0.5 && 'x')",
    "export const r2 = cx['raw']('block')",
    "const { raw } = cx; export const r3 = raw('inlineFlex')",
    "const { raw: rr } = cx; export const r4 = rr('hidden')",
    "const r = cx.raw; export const r5 = r('truncate')",
  ]
  it.each(lines)('%s', (line) => {
    const reading = read(IMPORT + line)
    expect(reading.atoms.size).toBe(0)
    expect(reading.problems).toEqual([])
  })

  it.each(['const { raw, dynamic } = cx', 'const { raw, ...rest } = cx'])('refuses %s', (line) => {
    const reading = read(`${IMPORT}${line}`)
    expect(reading.problems.map((p) => p.kind)).toEqual(['reference'])
  })
})

describe('AC-used-atoms-05 — every other reference to the binding is a build error', () => {
  const rows: [string, string, 'reexport' | 'reference'][] = [
    ['assigned', `${IMPORT}export const f = cx`, 'reference'],
    ['passed as a value', `${IMPORT}export const g = ['flex'].map(cx)`, 'reference'],
    ['spread', `${IMPORT}export const h = { ...cx }`, 'reference'],
    ['.call', `${IMPORT}export const i = cx.call(null, 'flex')`, 'reference'],
    ['.apply', `${IMPORT}export const j = cx.apply(null, ['flex'])`, 'reference'],
    [
      'computed, identifier',
      `${IMPORT}const key = 'raw'; export const k = cx[key]('x')`,
      'reference',
    ],
    ['computed, other literal', `${IMPORT}export const l = cx['dynamic']('flex')`, 'reference'],
    ['dynamic aliased', `${IMPORT}export const m = cx.dynamic`, 'reference'],
    ['dynamic passed', `${IMPORT}export const n = ['flex'].map(cx.dynamic)`, 'reference'],
    [
      'dynamic import, then',
      `export const o = import('${CX_SOURCE}').then((m) => m.cx('flex'))`,
      'reference',
    ],
    [
      'dynamic import, await',
      `const { cx: c2 } = await import('${CX_SOURCE}'); export const p = c2('flex')`,
      'reference',
    ],
    ['re-export from', `export { cx } from '${CX_SOURCE}'`, 'reexport'],
    ['re-export of the binding', `${IMPORT}export { cx }`, 'reexport'],
    ['star re-export', `export * from '${CX_SOURCE}'`, 'reexport'],
    ['namespace re-export', `export * as n from '${CX_SOURCE}'`, 'reexport'],
  ]
  it.each(rows)('%s is exactly one problem', (_name, code, kind) => {
    const reading = read(code)
    expect(reading.problems.map((p) => p.kind)).toEqual([kind])
  })
})

describe('AC-used-atoms-07 — references are attributed by lexical scope', () => {
  const code = [
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
  ].join('\n')

  it('collects flex and grid and refuses nothing', () => {
    const reading = read(code)
    expect([...reading.atoms].toSorted()).toEqual(['flex', 'grid'])
    expect(reading.problems).toEqual([])
  })

  it('control: renaming each shadowing declaration leaves one problem per formerly shadowed reference', () => {
    const lines = code.split('\n')
    const renamed = [
      ...lines.slice(0, 2),
      'export function p(z) { return e.map(String) }',
      'export const q = (z, t) => e + t',
      'export function l() { let z = [1]; return e.map(String) }',
      'export function k() { const z = (x) => x; return [1].map(e) }',
      'export function vv() { e(1); var z = (x) => x; return e }',
      'export function fh() { return [1].map(e); function z(x) { return x } }',
      'export function cl() { class z {} return [e] }',
      'export function ct() { try { throw 1 } catch (z) { return [e].map(String) } }',
      lines[10]!,
    ].join('\n')
    expect(read(renamed).problems.filter((p) => p.kind === 'reference')).toHaveLength(8)
  })
})

describe('AC-used-atoms-09 — every shape that resolves statically, and the set it gives', () => {
  const rows: [string, string[]][] = [
    ["cx('flex')", ['flex']],
    ['cx(`grid`)', ['grid']],
    ["cx(null, undefined, false, '')", []],
    ["cx(props.on && 'block')", ['block']],
    ["cx(props.on ? 'inlineFlex' : '')", ['inlineFlex']],
    ["cx(props.a ? (props.b ? 'flexCol' : 'flexWrap') : null)", ['flexCol', 'flexWrap']],
    ["const n = 'itemsCenter'; cx(n)", ['itemsCenter']],
    ["let m = props.on ? 'itemsStart' : ''; cx(m)", ['itemsStart']],
    ["var k = 'itemsEnd'; cx(k)", ['itemsEnd']],
    [
      "const x = props.on ? 'justifyCenter' : null; cx(x ?? 'justifyEnd')",
      ['justifyCenter', 'justifyEnd'],
    ],
    [
      "const y = props.on ? 'justifyBetween' : ''; cx(y || 'flexGrow')",
      ['justifyBetween', 'flexGrow'],
    ],
    ["function f() { const w = 'relative'; return () => cx(w) }", ['relative']],
    ["({ row: cx('absolute'), grid: cx('insetFull') })[props.variant]", ['absolute', 'insetFull']],
  ]
  it.each(rows)('%s', (body, expected) => {
    const reading = read(`${IMPORT}export function C(props) { ${body} }`)
    expect(reading.problems).toEqual([])
    expect([...reading.atoms].toSorted()).toEqual(expected.toSorted())
  })
})

describe('AC-used-atoms-10 — anything else is a build error', () => {
  const rows: [string, string][] = [
    ['assigned again', "let v = 'flex'; v = 'grid'; cx(v)"],
    ['updated', "let u = 'flex'; u += ''; cx(u)"],
    ['no initialiser', "let w; w = 'flex'; cx(w)"],
    ['parameter', 'export function C2(p) { return cx(p) }'],
    ['member', 'cx(props.variant)'],
    ['call', 'cx(pick())'],
    ['import from another module', 'cx(N)'],
    ['array element', "const arr = ['flex']; cx(arr[0])"],
    ['spread', 'cx(...props.list)'],
    ['substitution', "cx(`fl${'ex'}`)"],
    ['one branch unresolvable', "cx(props.on ? 'flex' : props.variant)"],
    [
      'not in an enclosing scope',
      "function a() { const s = 'flex'; return s } export function b() { return cx(s) }",
    ],
    ['whitespace inside', "cx('flex gap')"],
    ['trailing space', "cx('flex ')"],
    ['leading space', "cx(' flex')"],
  ]
  it.each(rows)('%s', (_name, body) => {
    const prefix = body === 'cx(N)' ? "import { N } from './names.js'\n" : ''
    const reading = read(`${IMPORT}${prefix}export function C(props) { ${body} }`)
    expect(reading.problems).toHaveLength(1)
    expect(reading.problems[0]!.kind).toBe('argument')
  })

  it('says a string with whitespace holds two names or whitespace, never "unknown atom" alone', () => {
    const [two] = read(`${IMPORT}cx('flex gap')`).problems
    expect(two!.text).toMatch(/two atom names/)
    const [around] = read(`${IMPORT}cx('flex ')`).problems
    expect(around!.text).toMatch(/whitespace/)
  })
})

describe('AC-used-atoms-11 — a literal that is no atom name, with extend atoms out of the hint', () => {
  const own = ['brandBox']
  const rows: [string, RegExp | undefined][] = [
    ['interactve', /Did you mean "interactive"\?/],
    ['sr-only', /Did you mean "srOnly"\? Atom names are camelCase; "nave-sr-only" is its class\./],
    ['nave-flex', /Did you mean "flex"\? Atom names are camelCase/],
    ['brandBoxx', undefined],
    ['legacy-card', undefined],
    ['toString', undefined],
  ]
  it.each(rows)('%s', (literal, hint) => {
    const [problem] = read(`${IMPORT}cx('${literal}')`, own).problems
    expect(problem!.kind).toBe('unknown')
    expect(problem!.text).toContain(`unknown atom "${literal}"`)
    if (hint) expect(problem!.text).toMatch(hint)
    else expect(problem!.text).not.toMatch(/Did you mean/)
    expect(problem!.needsAvailable).toBe(!hint)
  })

  it('names an atom of the consumer’s own as having no class, with @nave as the remedy', () => {
    const [problem] = read(`${IMPORT}cx('brandBox')`, own).problems
    expect(problem!.kind).toBe('own')
    expect(problem!.text).toMatch(/atom of your own, which has no class/)
    expect(problem!.text).toContain('@nave brandBox')
  })

  it('never lists an extend atom as a candidate', () => {
    const [problem] = read(`${IMPORT}cx('brandBoxs')`, own).problems
    expect(problem!.text).not.toContain('brandBox"')
  })
})

describe('AC-used-atoms-30 — literal classes match on CSS identifier boundaries', () => {
  const rows: [string, string[]][] = [
    ["'nave-block'", ['block']],
    ["'a nave-inline-block,b'", ['inlineBlock']],
    ["'nave-flex-col'", ['flexCol']],
    ["'x\tnave-items-center'", ['itemsCenter']],
    [String.raw`'a\nnave-no-wrap'`, ['noWrap']],
    ["'.nave-wrap-x nave-flex-wrap:hover'", ['flexWrap']],
    ["'--nave-justify-end'", []],
    ["'data-nave-justify-center'", []],
    ["'nave-flexx'", []],
    ["'anave-truncate'", []],
    ['`<div class="nave-hidden">h</div>`', ['hidden']],
  ]
  it.each(rows)('%s', (literal, expected) => {
    const reading = read(`export const s = ${literal}`)
    expect([...reading.classes]).toEqual(expected)
  })
})

describe('AC-used-atoms-31 — a Nave class built from pieces is a build error', () => {
  const errors = [
    "'nave-' + tone",
    '`nave-${tone}`',
    'cx.raw(`nave-${tone}`)',
    'css`nave-${tone}`',
    "'btn nave-' + tone",
    "'nave-flex-' + tone",
    "'nave-' + 'flex'",
    '`nave-flex` + tone',
    "'Release nave-' + tone",
  ]
  const greens = [
    '`color: var(--nave-color-${tone})`',
    "'--nave-' + tone",
    "'data-nave-' + tone",
    "'x-nave-' + tone",
    "tone + 'nave-'",
    "'nave-flex ' + tone",
  ]
  it.each(errors)('refuses %s', (expression) => {
    const reading = read(`${IMPORT}export function C(tone) { return ${expression} }`)
    expect(reading.problems.map((p) => p.kind)).toEqual(['concatenation'])
  })
  it.each(greens)('allows %s', (expression) => {
    const reading = read(`${IMPORT}export function C(tone) { return ${expression} }`)
    expect(reading.problems).toEqual([])
  })

  it('refuses it in a dependency that imports cx and not in one that does not', () => {
    expect(read("export const t = (x) => 'nave-' + x", [], true).problems).toEqual([])
    expect(
      read(`${IMPORT}export const t = (x) => 'nave-' + x`, [], true).problems.map((p) => p.kind),
    ).toEqual(['concatenation'])
  })
})

describe('the vocabulary', () => {
  it('reads the atoms from the declaration object at test time, never a count', () => {
    expect(Object.keys(atoms).length).toBeGreaterThan(0)
  })
})
