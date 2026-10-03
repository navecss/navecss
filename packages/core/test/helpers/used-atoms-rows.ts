/**
 * The row tables the used-atoms criteria share between the build tests and the dev-server test:
 * one module per row, so a row that a build refuses is the row the dev server is asked to refuse.
 */

export const IMPORT = "import { cx } from '@navecss/core/cx'\n"

/**
 * The criterion for references to the `cx` binding other than a call: a row, the file it sits
 * in, and its text.
 */
export const REFERENCE_ROWS: readonly (readonly [string, string, string])[] = [
  ['assigned', 'src/f.js', `${IMPORT}export const f = cx\n`],
  ['passed as a value', 'src/g.js', `${IMPORT}export const g = ['flex'].map(cx)\n`],
  ['spread', 'src/h.js', `${IMPORT}export const h = { ...cx }\n`],
  ['.call', 'src/i.js', `${IMPORT}export const i = cx.call(null, 'flex')\n`],
  ['.apply', 'src/j.js', `${IMPORT}export const j = cx.apply(null, ['flex'])\n`],
  [
    'computed, identifier',
    'src/k.js',
    `${IMPORT}const key = 'raw'; export const k = cx[key]('x')\n`,
  ],
  ['computed, other literal', 'src/l.js', `${IMPORT}export const l = cx['dynamic']('flex')\n`],
  ['dynamic aliased', 'src/m.js', `${IMPORT}export const m = cx.dynamic\n`],
  ['dynamic passed', 'src/n.js', `${IMPORT}export const n = ['flex'].map(cx.dynamic)\n`],
  [
    'dynamic import, then',
    'src/o.js',
    "export const o = import('@navecss/core/cx').then((m) => m.cx('flex'))\n",
  ],
  [
    'dynamic import, await',
    'src/p.js',
    "const { cx: c2 } = await import('@navecss/core/cx')\nexport const p = c2('flex')\n",
  ],
  ['re-export from', 'src/utils.js', "export { cx } from '@navecss/core/cx'\n"],
  ['re-export of the binding', 'src/utils2.js', `${IMPORT}export { cx }\n`],
  ['star re-export', 'src/utils3.js', "export * from '@navecss/core/cx'\n"],
  ['namespace re-export', 'src/utils4.js', "export * as n from '@navecss/core/cx'\n"],
]

/**
 * The criterion for arguments the build cannot read: a row and the statements that follow the
 * `cx` import.
 */
export const ARGUMENT_ROWS: readonly (readonly [string, string])[] = [
  ['assigned again', "let v = 'flex'; v = 'grid'; cx(v)"],
  ['updated', "let u = 'flex'; u += ''; cx(u)"],
  ['no initialiser', "let w; w = 'flex'; cx(w)"],
  ['parameter', 'export function C(p) { return cx(p) }'],
  ['member (a prop)', 'export const C = (props) => cx(props.variant)'],
  ['call', 'cx(pick())'],
  ['array element', "const arr = ['flex']; cx(arr[0])"],
  ['spread', 'export const C = (props) => cx(...props.list)'],
  ['substitution', "cx(`fl${'ex'}`)"],
  ['one branch unresolvable', "export const C = (props) => cx(props.on ? 'flex' : props.variant)"],
  [
    'not in an enclosing scope',
    "function a() { const s = 'flex'; return s } export function b() { return cx(s) }",
  ],
  ['whitespace', "cx('flex gap')"],
  ['trailing space', "cx('flex ')"],
  ['leading space', "cx(' flex')"],
]

/**
 * The criterion for a Nave class built from pieces: an expression over the parameter `tone`, and
 * how many characters into the expression the build points at the piece.
 */
export const PIECED_CLASS_ROWS: readonly (readonly [string, number])[] = [
  ["'nave-' + tone", 0],
  ['`nave-${tone}`', 0],
  ['cx.raw(`nave-${tone}`)', 7],
  ['css`nave-${tone}`', 3],
  ["'btn nave-' + tone", 0],
  ["'nave-flex-' + tone", 0],
  ["'nave-' + 'flex'", 0],
  ['`nave-flex` + tone', 0],
  ["'Release nave-' + tone", 0],
]

/**
 * The text a pieced-class row sits in, and the column its expression starts at (1-based).
 * Nothing is imported from Nave unless the expression itself calls `cx`.
 */
export function pieceModule(expression: string): {
  readonly text: string
  readonly column: number
} {
  const prefix = 'export const row = (tone) => '
  const head = expression.includes('cx.') ? IMPORT : '\n'
  return {
    text: `${head}const css = (s, ...v) => s.join('')\n${prefix}${expression}\nconsole.log(row, css)\n`,
    column: prefix.length + 1,
  }
}
