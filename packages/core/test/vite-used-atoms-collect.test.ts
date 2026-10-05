/**
 * The used-atoms criteria for collecting (AC-used-atoms-03 to -11, -34): a real `vite build` of
 * a scratch app, under the default (`'used'`), reading which atoms its `cx()` calls name and which
 * uses of `cx` it refuses. The row tables are the criteria's own; the collector alone runs the
 * same rows in vite-collect.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { atomClassMap } from '../src/atoms.ts'
import { REPORT_CAUSE } from '../src/vite-used-report.ts'
import { navePlugin } from '../src/vite.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  type Built,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import {
  ARGUMENT_ROWS,
  IMPORT,
  PIECED_CLASS_ROWS,
  pieceModule,
  REFERENCE_ROWS,
} from './helpers/used-atoms-rows.ts'
import { appConfig, startDev, stopDev } from './helpers/vite-app.ts'

/**
 * Builds an app of `modules` (each imported by `src/main.ts`) with the default plugin.
 */
async function build(
  modules: Record<string, string>,
  settings: Parameters<typeof buildUsed>[1] = {},
): Promise<Built> {
  const app = makeUsedApp(appFiles(modules))
  try {
    return await buildUsed(app, settings)
  } finally {
    app.dispose()
  }
}

describe('AC-used-atoms-03 — cx is recognised by its import binding, never by its name', () => {
  it('collects the named, aliased and namespace calls and none of the lookalikes', async () => {
    const built = await build({
      'src/named.ts': `${IMPORT}export const a = cx('flex')\n`,
      'src/aliased.ts':
        "import { cx as ncx } from '@navecss/core/cx'\nexport const b = ncx('grid')\n",
      'src/ns.ts': "import * as N from '@navecss/core/cx'\nexport const c = N.cx('block')\n",
      'src/lookalike.js': "const cx = (...a) => a.join(' ')\nexport const d = cx('inlineFlex')\n",
      'src/my-cx.ts': 'export const cx = (...a: string[]) => a.join(" ")\n',
      'src/local.ts': "import { cx } from './my-cx'\nexport const e = cx('hFull')\n",
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid', 'block'))
  })

  it('fails with one problem on a namespace that is used as anything but N.cx', async () => {
    const built = await build({
      'src/q.ts': "import * as N from '@navecss/core/cx'\nexport const q = [N]\n",
    })

    expect(built.error).toMatch(/^1 problem in 1 file/)
  })
})

describe('AC-used-atoms-04 — cx.raw in every form is never collected and never an error', () => {
  const raw = [
    IMPORT,
    "export const r1 = cx.raw('grid', Math.random() > 0.5 && 'x')",
    "export const r2 = cx['raw']('block')",
    "const { raw } = cx; export const r3 = raw('inlineFlex')",
    "const { raw: rr } = cx; export const r4 = rr('hidden')",
    "const r = cx.raw; export const r5 = r('truncate')",
    '',
  ].join('\n')

  it('builds green and ships no rule for any argument', async () => {
    const built = await build({ 'src/raw.ts': raw })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual([])
  })

  it.each(['const { raw, dynamic } = cx', 'const { raw, ...rest } = cx'])(
    'fails with one problem on %s',
    async (line) => {
      const built = await build({ 'src/raw.ts': `${IMPORT}${line}\n` })

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain('src/raw.ts:2:')
    },
  )
})

describe('AC-used-atoms-05 — every other reference to the binding is a build error', () => {
  const rows = REFERENCE_ROWS

  it.each(rows)(
    '%s alone fails the build with one problem in its own file',
    async (_name, file, text) => {
      const built = await build({ [file]: text })

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain(`${file}:`)
      expect(built.warnings).toEqual([])
    },
  )

  it('with every row present, one report lists every row', async () => {
    const modules = Object.fromEntries(rows.map(([, file, text]) => [file, text]))
    const built = await build(modules)

    expect(built.error).toMatch(/^15 problems in 15 files/)
    for (const [, file] of rows) expect(built.error).toContain(`${file}:`)
    expect(built.warnings).toEqual([])
  })
})

describe('AC-used-atoms-07 — references are attributed by lexical scope', () => {
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

  it('builds green and collects exactly flex and grid', async () => {
    const built = await build({ 'src/scope.js': lines.join('\n') })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid'))
  })

  it('control: renaming the shadowing declarations leaves one problem at each formerly shadowed reference', async () => {
    const renamed = [...lines]
    renamed[2] = 'export function p(z) { return e.map(String) }'
    renamed[3] = 'export const q = (z, t) => e + t'
    renamed[4] = 'export function l() { let z = [1]; return e.map(String) }'
    renamed[5] = 'export function k() { const z = (x) => x; return [1].map(e) }'
    renamed[6] = 'export function vv() { e(1); var z = (x) => x; return e }'
    renamed[7] = 'export function fh() { return [1].map(e); function z(x) { return x } }'
    renamed[8] = 'export function cl() { class z {} return [e] }'
    renamed[9] = 'export function ct() { try { throw 1 } catch (z) { return [e].map(String) } }'
    const built = await build({ 'src/scope.js': renamed.join('\n') })

    expect(built.error).toMatch(/^9 problems in 1 file/)
    // One problem at each formerly shadowed reference: its line, and the column of the name (or,
    // for the call on line 7, of its argument).
    const places = built
      .error!.split('\n')
      .filter((line) => line.startsWith('src/scope.js:'))
      .map((line) => line.split(': ', 1)[0]!)
    const at = (line: number, snippet: string, offset: number): string =>
      `src/scope.js:${line}:${renamed[line - 1]!.indexOf(snippet) + offset + 1}`
    expect(places).toEqual([
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

describe('AC-used-atoms-09 — every shape that resolves statically, and the set it gives', () => {
  it('builds green and ships exactly the union of the calls', async () => {
    const built = await build({
      'src/ok.js': [
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
      ].join('\n'),
    })

    expect(built.error).toBeUndefined()
    expect(atomLayerAtoms(built.css)).toEqual(
      atoms(
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
      ),
    )
  })
})

describe('AC-used-atoms-10 — anything else is a build error, never a warning', () => {
  const rows = ARGUMENT_ROWS

  it.each(rows)('%s fails with exactly one problem under every onUnknown', async (_name, body) => {
    for (const onUnknown of ['error', 'warn', 'ignore'] as const) {
      const built = await build({ 'src/row.js': `${IMPORT}${body}\n` }, { options: { onUnknown } })

      expect(built.error, onUnknown).toMatch(/^1 problem in 1 file/)
      expect(built.warnings, onUnknown).toEqual([])
    }
  })

  it('an import from another module fails the same way', async () => {
    const built = await build({
      'src/names.js': "export const N = 'flex'\n",
      'src/row.js': `${IMPORT}import { N } from './names.js'\ncx(N)\n`,
    })

    expect(built.error).toMatch(/^1 problem in 1 file/)
  })
})

/**
 * The message `request` was rejected with.
 */
async function rejectionMessage(request: Promise<unknown>): Promise<string> {
  try {
    await request
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('the request was expected to be rejected and was not')
}

describe('AC-used-atoms-11 — a literal that is no atom name, with extend atoms out of the hint', () => {
  const extend = { brandBox: { declarations: { color: 'red' } } }
  const hinted: [string, string][] = [
    ['interactve', 'Did you mean "interactive"?'],
    ['sr-only', 'Did you mean "srOnly"? Atom names are camelCase; "nave-sr-only" is its class.'],
    ['nave-flex', 'Did you mean "flex"?'],
  ]
  const unhinted = ['brandBoxx', 'legacy-card', 'toString']
  const literals = [...hinted.map(([literal]) => literal), ...unhinted]

  const buildRow = (literal: string): Promise<Built> =>
    build({ 'src/row.js': `${IMPORT}cx('${literal}')\n` }, { options: { extend } })

  it.each(hinted)('%s', async (literal, hint) => {
    const built = await buildRow(literal)

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain(`unknown atom "${literal}"`)
    expect(built.error).toContain(hint)
  })

  it.each(unhinted)('%s', async (literal) => {
    const built = await buildRow(literal)

    expect(built.error).toMatch(/^1 problem in 1 file/)
    expect(built.error).toContain(`unknown atom "${literal}"`)
    expect(built.error).not.toContain('Did you mean')
  })

  it('all rows together print the Available line once, last, with no extend atom', async () => {
    const modules = Object.fromEntries(
      literals.map((literal, index) => [`src/r${index}.js`, `${IMPORT}cx('${literal}')\n`]),
    )
    const built = await build(modules, { options: { extend } })
    const lines = built.error!.split('\n')

    expect(lines.filter((line) => line.startsWith('Available: '))).toHaveLength(1)
    expect(lines.at(-1)).toBe(`Available: ${Object.keys(atomClassMap).join(', ')}`)
    expect(built.error).not.toContain('brandBox,')
  })

  it('names an atom of the consumer’s own, with @nave as the remedy', async () => {
    const built = await build(
      { 'src/row.js': `${IMPORT}cx('brandBox')\n` },
      { options: { extend } },
    )

    expect(built.error).toContain('"brandBox" is an atom of your own, which has no class')
    expect(built.error).toContain('@nave brandBox')
  })
})

describe('AC-used-atoms-34 — one report at build end, 1-based root-relative positions', () => {
  let built: Built
  const h = '\nfunction h(..._: unknown[]) { return null }\n'
  const files = {
    'src/Card.tsx': [
      "import { cx } from '@navecss/core/cx'",
      "import './Only.tsx'",
      h.trim(),
      'export function Card(variant: string, list: string[]) {',
      '  return (',
      '    <section>',
      "      <div className={cx(variant as 'flex')}>x</div>",
      '    </section>',
      '  )',
      '}',
      'export function Names(list: string[]) {',
      '  const names = list.map(cx)',
      '  return names',
      '}',
    ].join('\n'),
    'src/list/Row.tsx': [
      "import { cx } from '@navecss/core/cx'",
      'export function Row(classes: never[]) {',
      '  // one',
      '  return cx(...classes)',
      '}',
    ].join('\n'),
    'src/Only.tsx': [
      "import { cx } from '@navecss/core/cx'",
      '',
      "export const o = cx('interactve')",
    ].join('\n'),
    'src/Long.tsx': [
      "import { cx } from '@navecss/core/cx'",
      'export function Long(someVeryLongVariableNameForTheVariantProp: never) {',
      '  return cx(someVeryLongVariableNameForTheVariantProp)',
      '}',
    ].join('\n'),
  }

  beforeAll(async () => {
    const app = makeUsedApp(appFiles(files, ['src/Card.tsx', 'src/list/Row.tsx', 'src/Long.tsx']))
    try {
      built = await buildUsed(app, {
        config: { oxc: { jsx: { runtime: 'classic', pragma: 'h' } } },
      })
    } finally {
      app.dispose()
    }
  })

  afterAll(() => {})

  it('fails once, after every module is transformed, with the module behind a failing one in it', () => {
    expect(built.error).toContain('src/Only.tsx:3:')
  })

  it('opens with the count and the cause, naming no option', () => {
    const [first] = built.error!.split('\n', 1)
    expect(first).toBe(`5 problems in 4 files: ${REPORT_CAUSE}`)
    expect(REPORT_CAUSE).toBe(
      'the build cannot tell which atoms these apply, and it ships only the atoms it can read.',
    )
    expect(first).not.toMatch(/atomic|'used'|'all'/)
  })

  it('prints one line per problem at its authored, 1-based, root-relative position', () => {
    const lines = built.error!.split('\n')
    expect(lines).toContain(
      'src/Card.tsx:7:26: cx(variant): the argument is not a literal atom name.',
    )
    expect(lines).toContain(
      'src/Card.tsx:12:26: cx is passed to map() as a value instead of being called.',
    )
    expect(lines).toContain('src/list/Row.tsx:4:13: cx(...classes): a spread argument.')
    expect(lines).toContain(
      'src/Long.tsx:3:13: cx(someVeryLongVariableNameForTheVariant...: the argument is not a literal atom name.',
    )
    expect(lines).toContain(
      'src/Only.tsx:3:21: cx(): unknown atom "interactve". Did you mean "interactive"?',
    )
  })

  it('prints the remedy block once, last, and never atomic: all or keepFor for application code', () => {
    const lines = built.error!.split('\n')
    const remedies = lines.filter((line) => line.startsWith('Name the atoms at the call'))
    expect(remedies).toHaveLength(1)
    expect(built.error).not.toMatch(/atomic: 'all'|keepFor/)
    expect(lines.at(-1)).toMatch(/^Call cx\(\) where the classes are applied/)
  })
})

describe('AC-used-atoms-35 — in dev, a per-module error with the same line text and remedy block', () => {
  const files = {
    'src/Card.tsx': [
      "import { cx } from '@navecss/core/cx'",
      'function h(..._: unknown[]) { return null }',
      'export function Card(variant: string) {',
      "  return h('div', { className: cx(variant as 'flex') })",
      '}',
    ].join('\n'),
    'src/Only.tsx': [
      "import { cx } from '@navecss/core/cx'",
      '',
      "export const o = cx('interactve')",
    ].join('\n'),
  }

  it('returns an error per module whose lines equal the build report’s, with the remedy block after them', async () => {
    const app = makeUsedApp(appFiles(files, ['src/Card.tsx', 'src/Only.tsx']))
    try {
      const built = await buildUsed(app, {
        config: { oxc: { jsx: { runtime: 'classic', pragma: 'h' } } },
      })
      const server = await startDev(appConfig(app.root, 'postcss', [navePlugin()]))
      try {
        const card = await rejectionMessage(server.transformRequest('/src/Card.tsx'))
        const only = await rejectionMessage(server.transformRequest('/src/Only.tsx'))

        const buildLines = built.error!.split('\n')
        const cardLine = buildLines.find((line) => line.startsWith('src/Card.tsx:'))!
        const onlyLine = buildLines.find((line) => line.startsWith('src/Only.tsx:'))!
        expect(card.split('\n', 1)[0]).toBe(cardLine)
        expect(card).toContain('Name the atoms at the call')
        expect(only.split('\n', 1)[0]).toBe(onlyLine)
        expect(card).not.toMatch(/^\d+ problems? in/)
      } finally {
        await server.close()
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('gives an application error for every row of AC-05, AC-10 and AC-31 that is application code, and none under all', async () => {
    const files: Record<string, string> = {}
    for (const [, file, text] of REFERENCE_ROWS) files[file] = text
    for (const [index, [, body]] of ARGUMENT_ROWS.entries()) {
      files[`src/arg${index}.js`] = `${IMPORT}${body}\n`
    }
    for (const [index, [expression]] of PIECED_CLASS_ROWS.entries()) {
      files[`src/piece${index}.js`] = pieceModule(expression).text
    }
    files['src/Dyn.js'] = `${IMPORT}export const d = (t) => cx.dynamic(t)\n`
    const app = makeUsedApp(appFiles(files))
    try {
      const used = await startDev(appConfig(app.root, 'postcss', [navePlugin()]))
      const all = await startDev(appConfig(app.root, 'postcss', [navePlugin({ atomic: 'all' })]))
      try {
        for (const file of Object.keys(files)) {
          await expect(used.transformRequest(`/${file}`), file).rejects.toThrow(`${file}:`)
          await expect(all.transformRequest(`/${file}`), file).resolves.toBeTruthy()
        }
      } finally {
        await used.close()
        await all.close()
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('reports no error in dev for a dependency’s problem', async () => {
    const app = makeUsedApp(
      appFiles({ 'src/uses.ts': "import { x } from 'bad-lib'\nconsole.log(x)\n" }),
    )
    addPackage(app, 'bad-lib', { 'index.js': `${IMPORT}export const x = (v) => cx(v)\n` })
    try {
      const server = await startDev(appConfig(app.root, 'postcss', [navePlugin()]))
      try {
        await expect(server.transformRequest('/src/uses.ts')).resolves.toBeTruthy()
        await expect(
          server.transformRequest('/node_modules/bad-lib/index.js'),
        ).resolves.toBeTruthy()
      } finally {
        await stopDev(server)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)
})
