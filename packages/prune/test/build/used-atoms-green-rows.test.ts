/**
 * AC-nextjs-used-atoms-17, on a real `next build` of the newest Next.js on both bundlers: the rows
 * of AC-used-atoms-03, -04, -07, -08, -09, -30 and -31 that build green. Each group is one app
 * built once, exit 0, no line from the package, and the atoms its built CSS holds a rule for are
 * exactly the union the rows name (an atom a row must not collect is absent). The modules are `.js`
 * files under `components/` and a JSX literal stands in for the Svelte component of AC-used-atoms-30.
 * The floor version is covered by the other real-build files.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { NextApp, Run } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { builtAtoms, BUNDLERS, configText, TIMEOUT } from '../helpers/used-atoms-build.ts'
import { dependency, plainDependency } from '../helpers/used-atoms-fixture.ts'
import { EXEMPT_PIECE_ROWS, IMPORT, pieceModule, TOKEN_ROWS } from '../helpers/used-atoms-rows.ts'

const MIN_LIB = [
  'import{cx as e}from"@navecss/core/cx";',
  'var t=t=>e(`flex`,t&&`grid`);',
  'function n(){return e(`itemsCenter`)}',
  'var r=e=>e.map(String);',
  'export{t as a,n as b,r as pass};',
].join('')
const ESB_LIB = 'import{cx as o}from"@navecss/core/cx";var c="gap",p=()=>o(c);export{p as c};'

/**
 * AC-used-atoms-03, -04, -07 and -08.
 */
const BINDING = {
  files: {
    'components/named.js': "import { cx } from '@navecss/core/cx'; export const a = cx('flex')\n",
    'components/aliased.js':
      "import { cx as ncx } from '@navecss/core/cx'; export const b = ncx('grid')\n",
    'components/ns.js':
      "import * as N from '@navecss/core/cx'; export const c = N.cx('block'); export const raw = N.cx.raw('x')\n",
    'components/lookalike.js':
      "const cx = (...a) => a.join(' '); export const d = cx('inlineFlex')\n",
    'components/local.js': "import { cx } from './my-cx.js'; export const e = cx('hFull')\n",
    'components/my-cx.js': "export const cx = (...a) => a.join(' ')\n",
    'components/raw.js': [
      IMPORT,
      "export const r1 = cx.raw('grid', Math.random() > 0.5 && 'x')",
      "export const r2 = cx['raw']('block')",
      "const { raw } = cx; export const r3 = raw('inlineFlex')",
      "const { raw: rr } = cx; export const r4 = rr('hidden')",
      "const r = cx.raw; export const r5 = r('truncate')",
      '',
    ].join('\n'),
    'components/scope.js': [
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
    ].join('\n'),
  },
  packages: {
    'min-lib': dependency('min-lib', { 'index.js': MIN_LIB }),
    'esb-lib': dependency('esb-lib', { 'index.js': ESB_LIB }),
  },
  atoms: ['block', 'flex', 'gap', 'grid', 'itemsCenter'],
}

/**
 * AC-used-atoms-09.
 */
const SHAPES = {
  files: {
    'components/ok.js': [
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
  },
  packages: {},
  atoms: [
    'absolute',
    'block',
    'flex',
    'flexCol',
    'flexGrow',
    'flexWrap',
    'grid',
    'inlineFlex',
    'insetFull',
    'itemsCenter',
    'itemsEnd',
    'itemsStart',
    'justifyBetween',
    'justifyCenter',
    'justifyEnd',
    'relative',
  ],
}

/**
 * AC-used-atoms-30, with AC-used-atoms-31's green rows beside it.
 */
const WRITTEN = {
  files: {
    'components/App.js': `${IMPORT}export const a = cx('flex')\n`,
    'components/Hidden.jsx': 'export const H = () => <div className="nave-hidden">h</div>\n',
    'components/strings.js': [
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
    ].join('\n'),
    ...Object.fromEntries(
      [...TOKEN_ROWS, ...EXEMPT_PIECE_ROWS.map(([expression]) => expression)].map(
        (expression, index) => [`components/green${index}.js`, pieceModule(expression).text],
      ),
    ),
  },
  packages: {
    'ui-lib': plainDependency('ui-lib', { 'index.js': 'export const c = "nave-grid"\n' }),
  },
  atoms: [
    'block',
    'flex',
    'flexCol',
    'flexWrap',
    'grid',
    'hidden',
    'inlineBlock',
    'itemsCenter',
    'noWrap',
  ],
}

interface Group {
  readonly atoms: readonly string[]
  readonly files: Record<string, string>
  readonly packages: Record<string, Record<string, string>>
}

/**
 * Builds a fresh app of the group: its modules and packages imported by the page.
 */
async function buildGroup(
  group: Group,
  flags: readonly string[],
): Promise<{ app: NextApp; atoms: string[]; run: Run }> {
  const app = createNextApp(configText())
  const packages: Record<string, string> = {}
  for (const [name, files] of Object.entries(group.packages)) {
    for (const [file, text] of Object.entries(files))
      packages[`node_modules/${name}/${file}`] = text
  }
  const imports = [
    ...Object.keys(group.files).map((file) => `../${file}`),
    ...Object.keys(group.packages),
  ]
  app.write({
    ...group.files,
    ...packages,
    'app/page.jsx': `${imports.map((specifier) => `import '${specifier}'`).join('\n')}\n\nexport default function Page() {\n  return <main />\n}\n`,
  })
  const run = await app.next(['build', ...flags])
  return { app, atoms: builtAtoms(app), run }
}

describe.skipIf(SKIP_REASON !== undefined)(
  `the green rows of the used-atoms criteria on a real next build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    describe.each(BUNDLERS)('%s, newest', (_name, flags) => {
      let binding: Awaited<ReturnType<typeof buildGroup>>
      let shapes: Awaited<ReturnType<typeof buildGroup>>
      let written: Awaited<ReturnType<typeof buildGroup>>
      beforeAll(async () => {
        binding = await buildGroup(BINDING, flags)
        shapes = await buildGroup(SHAPES, flags)
        written = await buildGroup(WRITTEN, flags)
      }, TIMEOUT)
      afterAll(async () => {
        await Promise.all([binding?.app.remove(), shapes?.app.remove(), written?.app.remove()])
      })

      it.each([
        [
          'AC-used-atoms-03, -04, -07 and -08: the binding, raw, scope and minified rows',
          'binding',
        ],
        ['AC-used-atoms-09: every shape that resolves statically', 'shapes'],
        [
          'AC-used-atoms-30 and -31: literal classes on identifier boundaries, and the green pieced rows',
          'written',
        ],
      ] as const)(
        '%s: exit 0, nothing from the package, exactly the atoms the rows name',
        (_row, key) => {
          const group = { binding: BINDING, shapes: SHAPES, written: WRITTEN }[key]
          const built = { binding, shapes, written }[key]

          expect(built.run.code, built.run.output).toBe(0)
          expect(built.run.output).not.toContain(REPORT_CAUSE)
          expect(built.run.output).not.toContain('Nave:')
          expect(built.atoms).toEqual(group.atoms)
        },
      )
    })
  },
)
