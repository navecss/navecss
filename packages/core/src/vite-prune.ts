/**
 * The atom is the unit of emission. Inside `@layer atomic`, every rule whose selector needs an
 * element carrying a built-in atom class outside the emitted set goes, selector lists pruned
 * member by member and at-rules left empty dropped; every other byte of the stylesheet is kept as
 * it was. A selector needs such an element when the class sits in one of its own compounds, or in
 * every alternative of an `:is()` or `:where()` among them; a class inside `:not()`, `:has()` or
 * any other argument is not a need, because the rule can match without it. What stays is the
 * layer as Vite's own CSS step produced it (nested or lowered, per `css.transformer`), so an
 * emitted atom keeps every rule the full layer yields for it.
 */
import type { Sheet, Statement } from './vite-css-blocks.ts'

import { firstSignificant, readSheet } from './vite-css-blocks.ts'
import { atomsNamedBy, blockersOf, membersOf } from './vite-selector-atoms.ts'

export interface LayerReading {
  /**
   * Whether the stylesheet holds an `@layer atomic { ... }` block.
   */
  readonly hasLayer: boolean
  /**
   * The built-in atoms whose class a rule in the layer selects.
   */
  readonly atoms: Set<string>
}

/**
 * At-rules whose block holds rules of their own, which the pruning descends into.
 */
const GROUPS = new Set([
  'container',
  'document',
  'layer',
  'media',
  'scope',
  'starting-style',
  'supports',
])

/**
 * The lowercased keyword of the at-rule starting at token `index`, if it is one.
 */
function atKeywordAt(sheet: Sheet, index: number): string | undefined {
  const token = sheet.tokens[index]
  if (token?.type !== 'at-keyword-token') return undefined
  return (token.structured as { value: string }).value.toLowerCase()
}

/**
 * Whether the block statement is exactly `@layer atomic { ... }`.
 */
function isAtomicLayer(sheet: Sheet, statement: Statement): boolean {
  if (statement.open === undefined) return false
  const significant: number[] = []
  for (let index = statement.from; index < statement.open; index += 1) {
    const type = sheet.tokens[index]!.type
    if (type !== 'whitespace-token' && type !== 'comment') significant.push(index)
  }
  const name = sheet.tokens[significant[1] ?? -1]
  return (
    significant.length === 2 &&
    atKeywordAt(sheet, significant[0]!) === 'layer' &&
    name?.type === 'ident-token' &&
    (name.structured as { value: string }).value === 'atomic'
  )
}

/**
 * At-rules that only make the rules inside them conditional: an `@layer atomic` inside one of
 * them is still the layer of that name (`@import url('@navecss/core') screen;` makes one).
 */
const CONDITIONALS = new Set(['container', 'document', 'media', 'scope', 'supports'])

/**
 * The `@layer atomic` blocks of the region `[from, to)`, found at the top level and inside
 * conditional at-rules, in document order. One inside another `@layer` is that layer's own.
 */
function layerBlocks(sheet: Sheet, from: number, to: number): Statement[] {
  const found: Statement[] = []
  for (const statement of sheet.statements(from, to)) {
    const { open, close } = statement
    if (open === undefined || close === undefined) continue
    if (isAtomicLayer(sheet, statement)) found.push(statement)
    else {
      const keyword = atKeywordAt(sheet, firstSignificant(sheet.tokens, statement.from, open))
      if (keyword !== undefined && CONDITIONALS.has(keyword)) {
        found.push(...layerBlocks(sheet, open + 1, close))
      }
    }
  }
  return found
}

/**
 * Whether the text of tokens `[from, to)` is only whitespace and comments.
 */
function isEmptyRegion(sheet: Sheet, from: number, to: number): boolean {
  return sheet.statements(from, to).length === 0
}

/**
 * The qualified rule `statement` with the members naming an unemitted atom removed.
 */
function pruneRule(sheet: Sheet, statement: Statement, emitted: ReadonlySet<string>): string {
  const { from, open, close } = statement as Required<Statement>
  const first = firstSignificant(sheet.tokens, from, open)
  const members = membersOf(sheet, first, open)
  const kept = members.filter(([start, end]) => blockersOf(sheet, start, end, emitted).length === 0)
  if (kept.length === members.length) return sheet.slice(from, close + 1)
  if (kept.length === 0) return ''
  let trailing = open
  while (trailing > first && firstSignificant(sheet.tokens, trailing - 1, trailing) === trailing) {
    trailing -= 1
  }
  const list = sheet.slice(first, trailing)
  const separator = /,\s/.test(list) ? ', ' : ','
  const text = kept.map(([start, end]) => sheet.slice(start, end).trim()).join(separator)
  return `${sheet.slice(from, first)}${text}${sheet.slice(trailing, open)}${sheet.slice(open, close + 1)}`
}

/**
 * The statements of the region `[from, to)` with the atoms outside `emitted` removed.
 */
function pruneRegion(sheet: Sheet, from: number, to: number, emitted: ReadonlySet<string>): string {
  const statements = sheet.statements(from, to)
  let out = ''
  for (const statement of statements) out += pruneStatement(sheet, statement, emitted)
  const last = statements.at(-1)
  return last ? out + sheet.slice(last.to, to) : sheet.slice(from, to)
}

/**
 * One statement of a region, pruned.
 */
function pruneStatement(sheet: Sheet, statement: Statement, emitted: ReadonlySet<string>): string {
  const { open, close } = statement
  if (open === undefined || close === undefined) return sheet.slice(statement.from, statement.to)
  const first = firstSignificant(sheet.tokens, statement.from, open)
  const keyword = atKeywordAt(sheet, first)
  if (keyword === undefined) return pruneRule(sheet, statement, emitted)
  if (!GROUPS.has(keyword)) return sheet.slice(statement.from, close + 1)
  if (isEmptyRegion(sheet, open + 1, close)) return sheet.slice(statement.from, close + 1)
  const inner = pruneRegion(sheet, open + 1, close, emitted)
  if (inner.trim() === '') return ''
  return `${sheet.slice(statement.from, open + 1)}${inner}}`
}

/**
 * `css` with every rule in an `@layer atomic` block that needs an atom outside `emitted` removed.
 */
export function pruneAtomicLayer(css: string, emitted: ReadonlySet<string>): string {
  if (!css.includes('@')) return css
  const sheet = readSheet(css)
  let out = ''
  let cursor = 0
  for (const statement of layerBlocks(sheet, 0, sheet.tokens.length)) {
    const { open, close } = statement as Required<Statement>
    out += sheet.slice(cursor, open + 1) + pruneRegion(sheet, open + 1, close, emitted)
    cursor = close
  }
  return cursor === 0 ? css : out + sheet.slice(cursor, sheet.tokens.length)
}

/**
 * Calls `visit` with the token range of every selector-list member of every rule in the region
 * `[from, to)`, descending into group at-rules.
 */
function visitMembers(
  sheet: Sheet,
  from: number,
  to: number,
  visit: (start: number, end: number) => void,
): void {
  for (const statement of sheet.statements(from, to)) {
    const { open, close } = statement
    if (open === undefined || close === undefined) continue
    const first = firstSignificant(sheet.tokens, statement.from, open)
    const keyword = atKeywordAt(sheet, first)
    if (keyword === undefined) {
      for (const [start, end] of membersOf(sheet, first, open)) visit(start, end)
    } else if (GROUPS.has(keyword)) {
      visitMembers(sheet, open + 1, close, visit)
    }
  }
}

/**
 * What the `@layer atomic` blocks of `css` hold.
 */
export function inspectAtomicLayer(css: string): LayerReading {
  const atoms = new Set<string>()
  if (!css.includes('@')) return { hasLayer: false, atoms }
  const sheet = readSheet(css)
  const blocks = layerBlocks(sheet, 0, sheet.tokens.length)
  for (const { open, close } of blocks) {
    visitMembers(sheet, open! + 1, close!, (start, end) => {
      for (const atom of atomsNamedBy(sheet, start, end)) atoms.add(atom)
    })
  }
  return { hasLayer: blocks.length > 0, atoms }
}

/**
 * The atoms outside `emitted` that a rule left in the `@layer atomic` blocks of `css` still needs
 * an element of: what a pruning to `emitted` would still remove, sorted.
 */
export function unprunedAtoms(css: string, emitted: ReadonlySet<string>): string[] {
  if (!css.includes('@')) return []
  const atoms = new Set<string>()
  const sheet = readSheet(css)
  for (const { open, close } of layerBlocks(sheet, 0, sheet.tokens.length)) {
    visitMembers(sheet, open! + 1, close!, (start, end) => {
      for (const atom of blockersOf(sheet, start, end, emitted)) atoms.add(atom)
    })
  }
  return [...atoms].toSorted((a, b) => a.localeCompare(b))
}
