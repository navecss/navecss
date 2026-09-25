/**
 * The five format functions `build.ts` wires into its platform config. Each reads the
 * flat, resolved token list the reader produces; `isPublic` (private primitives and
 * breakpoints excluded) is applied inside the token/CSS formats so @property blocks and
 * :root vars stay in sync automatically, and the two breakpoint formats share
 * `buildBreakpointMap` so the path-to-key convention has one source.
 */

import type { FlatToken } from './reader.ts'

import { shippedThemingPropertyNames } from './theming/emit.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEADER = '/* Nave Design System — generated, do not edit */'

// Cascade contract (index.css), byte-identical.
const LAYER_ORDER_STATEMENT =
  '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;'

/**
 * R26 [blocking]: every custom property Nave emits is prefixed `--nave-`. Applied HERE,
 * at the emitter, never by requiring the token SOURCE to nest under a `nave` group — the
 * latter would silently bind the theming specification's R29 rung-5 "bring your own DTCG
 * source" to Nave's own prefix shape, flagged in architecture review. Mirrors
 * `theming/emit.ts`'s own `--nave-color-` constant for the semantic colour layer, which
 * already conformed.
 */
const PREFIX = '--nave-'

const camelCase = (str: string): string =>
  str.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase())

/**
 * Converts a px value to em string (base 16px).
 * Used for breakpoint media query conditions.
 */
const toEm = (px: number): string => `${Number((px / 16).toFixed(4))}em`

/**
 * Maps DTCG $type to a CSS @property syntax string.
 *
 * Only types that can carry a real initial-value are listed. fontFamily,
 * cubicBezier and shadow are deliberately absent: they have no matching CSS
 * type, so their only possible registration is `syntax: '*'` with no
 * initial-value, which buys neither type checking nor transitions.
 */
const AT_PROPERTY_SYNTAX: Record<string, string> = {
  color: '<color>',
  dimension: '<length>',
  number: '<number>',
  duration: '<time>',
  fontWeight: '<number>',
}

/**
 * Absolute lengths, plus unitless zero. Anything else is font/viewport relative.
 */
const ABSOLUTE_LENGTH = /^-?(?:\d+|\d*\.\d+)(?:px|cm|mm|in|pt|pc|q)?$/i

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/**
 * Exclude private primitive tokens and breakpoints from consumer-facing CSS/JS output.
 */
const isPublic = (token: FlatToken): boolean =>
  !token.path.includes('_primitive') && token.path[0] !== 'breakpoint'

/**
 * Motion duration tokens that should collapse under prefers-reduced-motion.
 *  We deliberately keep --nave-motion-duration-instant at 0ms (it already is).
 */
const isReducibleDuration = (token: FlatToken): boolean =>
  token.type === 'duration' &&
  token.path[0] === 'motion' &&
  token.name !== 'motion-duration-instant'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Whether a token can be registered as a typed custom property.
 * A non-'*' syntax MUST carry a computationally independent initial-value.
 * rem and em are not (they resolve against a font size), so browsers silently
 * drop those registrations — which made this file's own "type safety" claim
 * false for every font-size token.
 */
function isRegistrable(token: FlatToken): boolean {
  const syntax = AT_PROPERTY_SYNTAX[token.type]
  if (syntax === undefined) return false
  if (syntax !== '<length>') return true
  return ABSOLUTE_LENGTH.test(String(token.value).trim())
}

/**
 * Builds a CSS @property block for a registrable token.
 */
function buildAtProperty(token: FlatToken): string {
  return [
    `  @property ${PREFIX}${token.name} {`,
    `    syntax: '${AT_PROPERTY_SYNTAX[token.type]}';`,
    `    inherits: true;`,
    `    initial-value: ${token.value};`,
    `  }`,
  ].join('\n')
}

/**
 * Formats a single CSS custom property declaration.
 */
const buildCustomProp = (token: FlatToken): string => `    ${PREFIX}${token.name}: ${token.value};`

// ---------------------------------------------------------------------------
// Format: CSS tokens
// ---------------------------------------------------------------------------

/**
 * Emits `dist/tokens.css`: `@property` registrations for registrable public tokens, the
 * `:root` custom-property block under `layer` (Nave's own build: `tokens.defaults`; the
 * consumer-invocable build: `tokens.presets`, R10 — fixed per invoking entry point, never a
 * public flag), and the prefers-reduced-motion override.
 */
export function formatCssTokens(tokens: FlatToken[], layer = 'tokens.defaults'): string {
  const allPublic = tokens.filter((t) => isPublic(t))

  // --- @property declarations (typed custom properties) ---
  const atPropertyBlock = allPublic
    .filter((t) => isRegistrable(t))
    .map((t) => buildAtProperty(t))
    .join('\n\n')

  // --- CSS custom properties ---
  const customPropsBlock = allPublic.map((t) => buildCustomProp(t)).join('\n')

  // --- prefers-reduced-motion overrides ---
  // 0.01ms: zero-duration never fires transitionend, hanging awaiters (matches reset.css).
  const reducedMotionBlock = allPublic
    .filter((t) => isReducibleDuration(t))
    .map((t) => `      ${PREFIX}${t.name}: 0.01ms;`)
    .join('\n')

  return [
    HEADER,
    LAYER_ORDER_STATEMENT,
    '',
    '/**',
    ' * @property declarations provide:',
    ' *   - Type safety (browsers reject invalid values)',
    ' *   - CSS transitions on custom properties (e.g. color tokens)',
    ' *   - IDE autocomplete in supported editors',
    ' *',
    ' * Only tokens whose initial-value is computationally independent are',
    ' * registered. Font-relative values (rem/em) cannot be, so those tokens',
    ' * ship as plain custom properties below.',
    ' */',
    atPropertyBlock,
    '',
    '/**',
    ` * Token values scoped under @layer ${layer}.`,
    ' * Override in @layer overrides — no specificity battles, ever.',
    ' */',
    `@layer ${layer} {`,
    '  :root {',
    customPropsBlock,
    '  }',
    '',
    '  /**',
    '   * Collapse all motion durations for users who prefer reduced motion.',
    '   * Any component using --nave-motion-duration-* gets this for free.',
    '   */',
    '  @media (prefers-reduced-motion: reduce) {',
    '    :root {',
    reducedMotionBlock,
    '    }',
    '  }',
    '}',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Format: JS/ESM tokens
// ---------------------------------------------------------------------------

/**
 * Emits `dist/tokens.js`: every public token as a `const` object keyed by CSS
 * custom-property name. Plain JavaScript only: the `tokens` declaration and the
 * `TokenName`/`TokenValue` aliases live in `dist/tokens.d.ts` (`formatTsDeclarations`), the
 * file the `types` condition resolves to. Writing them here as well shipped an entry point
 * Node refused at module load (`SyntaxError: Unexpected identifier 'as'`).
 *
 * The bare package name resolves to this file, so a CSS tool that wrongly reads it (for
 * example Vite, through postcss-import) needs to fail at a line that names the fix, not deep
 * in the token list. The second line does that: it uses a line comment rather than a block
 * comment, because a block comment is valid CSS and a CSS parser would just skip over it.
 */
export function formatJsTokens(tokens: FlatToken[]): string {
  const entries = tokens
    .filter((t) => isPublic(t))
    .map((t) => `  '${PREFIX}${t.name}': ${JSON.stringify(t.value)},`)
    .join('\n')

  return [
    HEADER,
    "// This file is the JavaScript entry of @navecss/tokens. For the stylesheet, use: @import '@navecss/tokens/css';",
    '',
    '/** The DTCG 2025.10 token set as a typed const object (e.g. `--nave-font-size-md`).',
    ' *  Keys are CSS custom property names. The semantic colour layer',
    ' *  (`--nave-color-*`) ships as CSS custom properties in `dist/tokens.css` and is',
    ' *  not part of this object; its property NAMES are typed separately as',
    ' *  `ColorPropertyName`, and its VALUES are reachable only through CSS (e.g.',
    ' *  `var(--nave-color-action-primary)`): the browser resolves each one for the',
    ' *  active colour scheme, and the neutral-derived ones also follow the tint.',
    ' */',
    'export const tokens = {',
    entries,
    '}',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Format: TypeScript declarations for the JS output
// ---------------------------------------------------------------------------

/**
 * Emits `dist/tokens.d.ts`: the TypeScript declarations for `formatJsTokens`'s output.
 *
 * Each key is typed by the JSON type its value actually carries, so `TokenValue` resolves to
 * `string | number` rather than to `string` alone. `formatJsTokens` stringifies whatever it is
 * given, and since the source moved to DTCG 2025.10 eighteen of its rows are JSON numbers: a
 * declaration typing all of them `string` is a shipped claim that is false about the artifact
 * sitting beside it, which is the same defect this migration exists to close, one file over.
 */
export function formatTsDeclarations(tokens: FlatToken[]): string {
  const keys = tokens
    .filter((t) => isPublic(t))
    .map((t) => `  '${PREFIX}${t.name}': ${typeof t.value === 'number' ? 'number' : 'string'}`)
    .join('\n')

  // The semantic colour layer's typed surface is NAMES ONLY, generated from the same source
  // `emitCss` reads (seed-invariant, per that function's own contract), never hand-written
  // and never folded into `tokens`/`TokenName`: a values map would be a static snapshot of
  // colour values this build computes live in the browser from the seed and the scheme,
  // which would silently opt a consumer out of that live computation with no error anywhere.
  const colorPropertyNameMembers = [...shippedThemingPropertyNames()]
    .toSorted((a, b) => a.localeCompare(b))
    .map((name) => `  | '${name}'`)
    .join('\n')

  return [
    HEADER,
    '',
    '/** The DTCG 2025.10 token set as a typed const object (e.g. `--nave-font-size-md`).',
    ' *  Keys are CSS custom property names. The semantic colour layer',
    ' *  (`--nave-color-*`) ships as CSS custom properties in `dist/tokens.css` and is',
    ' *  not part of this object; its property NAMES are typed separately as',
    ' *  `ColorPropertyName`, and its VALUES are reachable only through CSS (e.g.',
    ' *  `var(--nave-color-action-primary)`): the browser resolves each one for the',
    ' *  active colour scheme, and the neutral-derived ones also follow the tint.',
    ' */',
    'export declare const tokens: {',
    keys,
    '}',
    '',
    'export declare type TokenName = keyof typeof tokens',
    'export declare type TokenValue = typeof tokens[TokenName]',
    '',
    '/** Every `--nave-color-*` custom property the semantic colour layer emits: names',
    ' *  only, no value (see the doc comment above `tokens` for where the values live).',
    ' *  Disjoint from `TokenName` — a consumer who wants both writes',
    ' *  `TokenName | ColorPropertyName`.',
    ' */',
    'export declare type ColorPropertyName =',
    colorPropertyNameMembers,
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Format: breakpoints (JS/ESM and its TypeScript declarations)
//
// Naming convention:
//   phoneOnly          — (width < 37.5em)    derived from tabletPortrait boundary
//   tabletPortraitUp   — (width >= 37.5em)
//   tabletLandscapeUp  — (width >= 56.25em)
//   desktopUp          — (width >= 75em)
//   wideUp             — (width >= 112.5em)
//
// Why Level 4 syntax?
//   (width < 37.5em) and (width >= 37.5em) share the exact same boundary value.
//   < is exclusive, >= is inclusive. No overlap possible, no 1px gap needed,
//   no rounding issues at fractional device pixel ratios or non-integer zoom.
//
// Breakpoints are stored as px integers, converted to em at build time.
// The divisor is fixed at 16 — the spec's *initial* value for media-query
// em, not an assumption every user is at 16px. Load-bearing: aimed at the
// next reader tempted to simplify the conversion away.
//
// Why no Down variants?
//   Down variants (max-width based, except phoneOnly) are desktop-first thinking.
//   Nave enforces mobile-first. phoneOnly is the one legitimate exception —
//   it targets a specific device class, not "below X". All other responsive
//   design starts from the smallest context and expands upward.
// ---------------------------------------------------------------------------

/**
 * Builds the shared camelCase-name → px-value map both breakpoint formats read, so the
 * path-to-key convention has one source.
 */
function buildBreakpointMap(tokens: FlatToken[]): Record<string, number> {
  const bpMap: Record<string, number> = {}
  const bpTokens = tokens.filter((t) => t.path[0] === 'breakpoint')
  for (const t of bpTokens) {
    const key = camelCase(t.path.slice(1).join('-'))
    bpMap[key] = t.value as number
  }
  return bpMap
}

/**
 * Emits `dist/breakpoints.js`: raw px values, em conversions, and prebuilt Level 4 media
 * query condition strings.
 */
export function formatJsBreakpoints(tokens: FlatToken[]): string {
  const bpMap = buildBreakpointMap(tokens)
  if (Object.keys(bpMap).length === 0) return '// No breakpoints defined\n'

  const valuesLines = Object.entries(bpMap)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join(',\n')
  const emLines = Object.entries(bpMap)
    .map(([k, v]) => `  ${k}: '${toEm(v)}'`)
    .join(',\n')

  const mediaLines: string[] = []
  if (bpMap.tabletPortrait !== undefined) {
    // phone-only: everything below the tabletPortrait boundary
    // Uses < (exclusive upper bound) — same value as tabletPortraitUp
    mediaLines.push(
      `  phoneOnly: '(width < ${toEm(bpMap.tabletPortrait)})'`,
      `  tabletPortraitUp: '(width >= ${toEm(bpMap.tabletPortrait)})'`,
    )
  }
  if (bpMap.tabletLandscape !== undefined) {
    mediaLines.push(`  tabletLandscapeUp: '(width >= ${toEm(bpMap.tabletLandscape)})'`)
  }
  if (bpMap.desktop !== undefined) {
    mediaLines.push(`  desktopUp: '(width >= ${toEm(bpMap.desktop)})'`)
  }
  if (bpMap.wide !== undefined) {
    mediaLines.push(`  wideUp: '(width >= ${toEm(bpMap.wide)})'`)
  }

  return `/**
 * Nave breakpoints — generated from tokens.json
 * Do not edit directly. Run \`pnpm build\` in packages/tokens to regenerate.
 *
 * breakpoints — raw px boundary values (number, no unit)
 *   These are the design decisions. Edit tokens.json to change them.
 *
 * em — boundary values in em units (base: 16px)
 *   For reference. The media strings below use these values.
 *
 * media — pre-built Level 4 media query condition strings
 *   Use as @media keys in atoms.ts and consumer atoms.
 *   Never write breakpoint values as magic numbers in your codebase.
 *
 * Syntax: Level 4 range queries — (width < Xem) / (width >= Xem)
 *   phoneOnly and tabletPortraitUp share the same boundary value (37.5em).
 *   < is exclusive upper bound, >= is inclusive lower bound.
 *   No overlap, no gap, no rounding issues at any device pixel ratio.
 *
 * Why em: resolves against the browser's default font size, a user setting
 *   (not page zoom, which scales px and em alike).
 */

export const breakpoints = {
${valuesLines}
}

export const em = {
${emLines}
}

export const media = {
${mediaLines.join(',\n')}
}
`
}

/**
 * Emits `dist/breakpoints.d.ts`: the TypeScript declarations for `formatJsBreakpoints`'s
 * output.
 */
export function formatTsBreakpoints(tokens: FlatToken[]): string {
  const bpMap = buildBreakpointMap(tokens)
  if (Object.keys(bpMap).length === 0) return '// No breakpoints defined\n'

  const bpDecls = Object.entries(bpMap)
    .map(([k, v]) => `  readonly ${k}: ${v}`)
    .join('\n')

  const emDecls = Object.entries(bpMap)
    .map(([k, v]) => `  readonly ${k}: '${toEm(v)}'`)
    .join('\n')

  const mediaDecls: string[] = []
  if (bpMap.tabletPortrait !== undefined) {
    mediaDecls.push(
      `  readonly phoneOnly: '(width < ${toEm(bpMap.tabletPortrait)})'`,
      `  readonly tabletPortraitUp: '(width >= ${toEm(bpMap.tabletPortrait)})'`,
    )
  }
  if (bpMap.tabletLandscape !== undefined) {
    mediaDecls.push(`  readonly tabletLandscapeUp: '(width >= ${toEm(bpMap.tabletLandscape)})'`)
  }
  if (bpMap.desktop !== undefined) {
    mediaDecls.push(`  readonly desktopUp: '(width >= ${toEm(bpMap.desktop)})'`)
  }
  if (bpMap.wide !== undefined) {
    mediaDecls.push(`  readonly wideUp: '(width >= ${toEm(bpMap.wide)})'`)
  }

  return [
    HEADER,
    '',
    'export declare const breakpoints: {',
    bpDecls,
    '}',
    'export declare type BreakpointName = keyof typeof breakpoints',
    '',
    'export declare const em: {',
    emDecls,
    '}',
    '',
    'export declare const media: {',
    mediaDecls.join('\n'),
    '}',
    'export declare type MediaName = keyof typeof media',
    '',
  ].join('\n')
}
