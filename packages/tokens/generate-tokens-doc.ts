/**
 * Generates `TOKENS.md`: every custom property `dist/tokens.css` declares, its group, and —
 * for colour — whether it follows `--nave-color-tint`. Composes the same CSS content `build.ts`
 * writes to `dist/tokens.css` (DTCG tokens plus the theming layer), in memory, rather than
 * reading the built artifact off disk, so this generator needs no prior `pnpm run build` and
 * cannot read a stale `dist/`.
 *
 * No value column for colours: their values are `light-dark(oklch(from var(--nave-color-tint)
 * ...))` expressions, which inform nobody. No description column, in either kind: `tokens.json`
 * descriptions include cleared prose, and rendering them into a table is a licensing/
 * accessibility routing question this generator does not decide.
 *
 * Run: node generate-tokens-doc.ts  (writes TOKENS.md)
 * Checked for drift by test/tokens-doc-drift.test.ts.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

import { type BuildConfig, composeBuild } from './src/builder.ts'
import { formatCssTokens } from './src/formats.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const OUTPUT_PATH = path.resolve(HERE, 'TOKENS.md')

const CSS_CONFIG: BuildConfig = {
  source: [path.resolve(HERE, 'tokens.json')],
  platforms: {
    css: {
      buildPath: '',
      files: [{ destination: 'tokens.css', format: formatCssTokens }],
    },
  },
}

// Matches across line breaks (`[\s\S]*?`), not just within one line: a `--nave-*` declaration's
// value is free to wrap onto a following physical line (a multi-layer `box-shadow`, for one),
// and a value never contains an unescaped `;` of its own, so scanning up to the next `;`
// (non-greedy, so a following declaration's `;` is never swallowed) is safe regardless of how
// many lines the value spans.
const PROPERTY_DECL = /(--nave-[\w-]+):\s*([\s\S]*?);/g

// Strips CSS comments before `PROPERTY_DECL` scans: a comment mentioning a `--nave-*` name (as
// documentation, or as a crossed-out alias) is not a declaration, and `PROPERTY_DECL` cannot
// otherwise tell the two apart. Left unstripped, a comment can run past its own `*/` looking for
// the next `;`, swallowing a real declaration that follows it, or stand in as the "first
// occurrence" of a name a real declaration only declares later. CSS comments do not nest, so a
// non-greedy match up to the first `*/` is exact.
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g

/**
 * Removes every CSS comment from `css`, so `PROPERTY_DECL` only ever scans real declarations.
 */
function stripComments(css: string): string {
  return css.replaceAll(CSS_COMMENT, '')
}

interface TokenRow {
  name: string
  group: string
  followsTint: boolean
}

/**
 * Every `--nave-*` custom property declared in `css`, in first-occurrence order, deduplicated
 * by name (a later occurrence — e.g. the `prefers-reduced-motion` override block — restates the
 * same name with a conditional value, and the FIRST occurrence is always the base declaration
 * that precedes any such override in the generated file). A declaration's value may span more
 * than one physical line; see `PROPERTY_DECL` above.
 */
export function parseTokens(css: string): TokenRow[] {
  const seen = new Set<string>()
  const rows: TokenRow[] = []
  for (const match of stripComments(css).matchAll(PROPERTY_DECL)) {
    const name = match[1]!
    if (seen.has(name)) continue
    seen.add(name)
    const value = match[2]!
    const group = name.replace('--nave-', '').split('-', 1)[0]!
    rows.push({ name, group, followsTint: value.includes('var(--nave-color-tint)') })
  }
  return rows
}

/**
 * The CSS `dist/tokens.css` would carry: DTCG tokens plus the theming layer, composed in
 * memory.
 */
async function composeTokensCss(): Promise<string> {
  const composed = await composeBuild(CSS_CONFIG)
  const themingStep = await import('./src/theming/build-step.ts')
  const withTheming = themingStep.withThemingLayer(composed)
  const cssFile = withTheming.find((file) => file.destination.endsWith('tokens.css'))
  if (!cssFile) throw new Error('generate-tokens-doc: composeBuild produced no tokens.css output')
  return cssFile.content
}

const GROUP_LABELS: Record<string, string> = {
  color: 'Colour',
  font: 'Font',
  line: 'Line height',
  letter: 'Letter spacing',
  spacing: 'Spacing',
  size: 'Size',
  border: 'Border width',
  radius: 'Radius',
  shadow: 'Shadow',
  opacity: 'Opacity',
  layer: 'Layer (z-index)',
  motion: 'Motion',
}

/**
 * Renders one group's rows as a markdown table; colour groups get the follows-tint column.
 */
function renderTable(rows: TokenRow[], isColorGroup: boolean): string[] {
  const lines: string[] = []
  if (isColorGroup) {
    lines.push(
      '| Custom property | Follows `--nave-color-tint` |',
      '| --------------- | ---------------------------- |',
    )
    for (const row of rows) {
      lines.push(`| \`${row.name}\` | ${row.followsTint ? 'yes' : 'no'} |`)
    }
  } else {
    lines.push('| Custom property |', '| --------------- |')
    for (const row of rows) {
      lines.push(`| \`${row.name}\` |`)
    }
  }
  return lines
}

/**
 * Renders the full `TOKENS.md` markdown, formatted with the repository's own Prettier config.
 */
export async function generate(): Promise<string> {
  const css = await composeTokensCss()
  const rows = parseTokens(css)

  const groupOrder = [...new Set(rows.map((row) => row.group))]
  const byGroup = new Map<string, TokenRow[]>(groupOrder.map((group) => [group, []]))
  for (const row of rows) byGroup.get(row.group)!.push(row)

  const lines: string[] = [
    '# TOKENS.md',
    '',
    'Generated from the token build; do not edit by hand.',
    '',
    "Every custom property `@navecss/tokens` declares, grouped, with colour's own follows-tint",
    'column: whether re-hueing `--nave-color-tint` moves that property. Values are not shown —',
    "a colour's value is a `light-dark()` expression that informs nobody on its own, and a",
    'non-colour value is exactly what its name says.',
    '',
  ]

  for (const group of groupOrder) {
    lines.push(
      `## ${GROUP_LABELS[group] ?? group}`,
      '',
      ...renderTable(byGroup.get(group)!, group === 'color'),
      '',
    )
  }

  const markdown = `${lines.join('\n').trimEnd()}\n`
  return format(markdown, {
    ...(await resolveConfig(OUTPUT_PATH)),
    parser: 'markdown',
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUTPUT_PATH, await generate())
  console.log(`Wrote ${OUTPUT_PATH}`)
}
