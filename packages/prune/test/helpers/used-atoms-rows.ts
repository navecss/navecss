/**
 * The row tables the used-atoms criteria share between the plugin-level tests and the real builds:
 * one module per row, so a row the plugin refuses is the row a build is asked to fail on. The
 * modules sit under `components/`, which the fixture's page imports.
 */

export const IMPORT = "import { cx } from '@navecss/core/cx'\n"

/**
 * References to the `cx` binding other than a call: a row, the file it sits in, and its text.
 */
export const REFERENCE_ROWS: readonly (readonly [string, string, string])[] = [
  ['assigned', 'components/f.js', `${IMPORT}export const f = cx\n`],
  ['passed as a value', 'components/g.js', `${IMPORT}export const g = ['flex'].map(cx)\n`],
  ['spread', 'components/h.js', `${IMPORT}export const h = { ...cx }\n`],
  ['.call', 'components/i.js', `${IMPORT}export const i = cx.call(null, 'flex')\n`],
  ['.apply', 'components/j.js', `${IMPORT}export const j = cx.apply(null, ['flex'])\n`],
  [
    'computed member, identifier',
    'components/k.js',
    `${IMPORT}const key = 'raw'; export const k = cx[key]('x')\n`,
  ],
  [
    'computed member, other literal',
    'components/l.js',
    `${IMPORT}export const l = cx['dynamic']('flex')\n`,
  ],
  ['cx.dynamic aliased', 'components/m.js', `${IMPORT}export const m = cx.dynamic\n`],
  ['cx.dynamic passed', 'components/n.js', `${IMPORT}export const n = ['flex'].map(cx.dynamic)\n`],
  [
    'dynamic import, then',
    'components/o.js',
    "export const o = import('@navecss/core/cx').then((m) => m.cx('flex'))\n",
  ],
  [
    'dynamic import, await',
    'components/p.js',
    "const { cx: c2 } = await import('@navecss/core/cx')\nexport const p = c2('flex')\n",
  ],
  ['re-export from', 'components/utils.js', "export { cx } from '@navecss/core/cx'\n"],
  ['re-export of the binding', 'components/utils2.js', `${IMPORT}export { cx }\n`],
  ['star re-export', 'components/utils3.js', "export * from '@navecss/core/cx'\n"],
  ['namespace re-export', 'components/utils4.js', "export * as n from '@navecss/core/cx'\n"],
]

/**
 * The barrels among the reference rows, by file.
 */
export const BARREL_FILES = [
  'components/utils.js',
  'components/utils2.js',
  'components/utils3.js',
  'components/utils4.js',
] as const

/**
 * Arguments the plugin cannot read: a row and the statements that follow the `cx` import.
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
  ['whitespace inside', "cx('flex gap')"],
  ['trailing space', "cx('flex ')"],
  ['leading space', "cx(' flex')"],
]

/**
 * The module of an argument row. With `isRunnable`, nothing runs when the module is imported: a
 * real build imports it, and a statement that calls an undefined `pick()` would throw there.
 */
export function argumentModule(body: string, isRunnable = false): string {
  if (!isRunnable || body.includes('export')) return `${IMPORT}${body}\n`
  return `${IMPORT}export function row(props, pick) { ${body} }\n`
}

/**
 * A Nave class built from pieces: an expression over the parameter `tone`, and how many
 * characters into the expression the plugin points at the piece.
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
  ["'nave-flex' + (on ? 'nave-grid' : '')", 0],
  ["'nave-flex' + (on && ' nave-grid')", 0],
]

/**
 * The same criterion's rows that look like a built class and are not: an expression over `tone` or
 * `on` that builds green with no problem.
 */
export const TOKEN_ROWS: readonly string[] = [
  '`color: var(--nave-color-${tone})`',
  "'--nave-' + tone",
  "'data-nave-' + tone",
  "'x-nave-' + tone",
  "tone + 'nave-'",
  "'nave-flex ' + tone",
]

/**
 * The green rows that name atoms: an expression whose right side can only end the identifier, and
 * the atoms the layer must hold for it, since a row that built green and emitted nothing would
 * ship the class with no rule.
 */
export const EXEMPT_PIECE_ROWS: readonly (readonly [string, readonly string[]])[] = [
  ["'nave-flex' + (on ? ' nave-grid' : '')", ['flex', 'grid']],
  ["`nave-flex${on ? ' nave-grid' : ''}`", ['flex', 'grid']],
  ["'<i class=\"nave-flex' + '\">'", ['flex']],
  ["'nave-flex' + (on ? '' : ' x') + ' y'", ['flex']],
]

/**
 * Concatenations in which an empty value can continue the identifier: each is one problem.
 */
export const EMPTY_CONTINUES_ROWS: readonly string[] = [
  "`nave-flex${''}-col`",
  "'nave-flex' + (on ? '' : ' x') + '-col'",
  "`nave-flex${on ? '' : ' x'}-col`",
]

/**
 * The text a pieced-class row sits in. Nothing is imported from Nave unless the expression
 * itself calls `cx`. The expression starts on line 3.
 */
export function pieceModule(expression: string): {
  readonly column: number
  readonly text: string
} {
  const prefix = 'export const row = (tone, on) => '
  const head = expression.includes('cx.') ? IMPORT : '\n'
  return {
    text: `${head}const css = (s, ...v) => s.join('')\n${prefix}${expression}\nconsole.log(row, css)\n`,
    column: prefix.length + 1,
  }
}

/**
 * The literals AC-used-atoms-11 calls `cx` with, and the hint each gets (`undefined` for none).
 */
export const LITERAL_ROWS: readonly (readonly [string, string | undefined])[] = [
  ['interactve', 'Did you mean "interactive"?'],
  ['sr-only', 'Did you mean "srOnly"? Atom names are camelCase; "nave-sr-only" is its class.'],
  ['nave-flex', 'Did you mean "flex"?'],
  ['brandBoxx', undefined],
  ['legacy-card', undefined],
  ['toString', undefined],
]

/**
 * The consumer's own atom the literal rows run beside.
 */
export const EXTEND = { brandBox: { declarations: { color: 'red' } } }

/**
 * The barrel text every declared module starts from.
 */
export const BARREL = "export { cx } from '@navecss/core/cx'\n"
