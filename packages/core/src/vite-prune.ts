/**
 * The atom is the unit of emission. Inside `@layer atomic`, every rule whose selector names a
 * built-in atom class outside the emitted set goes, selector lists pruned member by member and
 * at-rules left empty dropped; every other byte of the stylesheet is kept as it was. What stays is
 * the layer as Vite's own CSS step produced it (nested or lowered, per `css.transformer`), so an
 * emitted atom keeps every rule the full layer yields for it.
 */
import type { Sheet, Statement } from './vite-css-blocks.ts'

import { firstSignificant, readSheet } from './vite-css-blocks.ts'
import { atomOfClass } from './vite-literal-classes.ts'

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
 * The selector list of the rule `statement`, as token ranges `[from, to)`, one per member.
 */
function membersOf(sheet: Sheet, from: number, open: number): [number, number][] {
  const members: [number, number][] = []
  let start = from
  let depth = 0
  for (let index = from; index < open; index += 1) {
    const type = sheet.tokens[index]!.type
    if (['(-token', '[-token', 'function-token'].includes(type)) depth += 1
    else if ([')-token', ']-token'].includes(type)) depth -= 1
    else if (type === 'comma-token' && depth === 0) {
      members.push([start, index])
      start = index + 1
    }
  }
  members.push([start, open])
  return members
}

/**
 * The built-in atoms whose class the tokens `[from, to)` select, anywhere in a selector.
 */
function atomsSelectedBy(sheet: Sheet, from: number, to: number): string[] {
  const atoms: string[] = []
  for (let index = from; index < to - 1; index += 1) {
    const dot = sheet.tokens[index]!
    const name = sheet.tokens[index + 1]!
    if (dot.type !== 'delim-token' || dot.raw !== '.' || name.type !== 'ident-token') continue
    const atom = atomOfClass((name.structured as { value: string }).value)
    if (atom) atoms.push(atom)
  }
  return atoms
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
  const kept = members.filter(([start, end]) =>
    atomsSelectedBy(sheet, start, end).every((atom) => emitted.has(atom)),
  )
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
  return last ? out + sheet.slice(last.to, to) : out
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
 * `css` with every rule in an `@layer atomic` block that names an atom outside `emitted` removed.
 */
export function pruneAtomicLayer(css: string, emitted: ReadonlySet<string>): string {
  if (!css.includes('atomic')) return css
  const sheet = readSheet(css)
  let out = ''
  let cursor = 0
  for (const statement of sheet.statements(0, sheet.tokens.length)) {
    if (!isAtomicLayer(sheet, statement)) continue
    const { open, close } = statement as Required<Statement>
    out += sheet.slice(cursor, open + 1) + pruneRegion(sheet, open + 1, close, emitted)
    cursor = close
  }
  return cursor === 0 ? css : out + sheet.slice(cursor, sheet.tokens.length)
}

/**
 * Collects the atoms the rules in the region `[from, to)` select, descending into group at-rules.
 */
function collectAtoms(sheet: Sheet, from: number, to: number, atoms: Set<string>): void {
  for (const statement of sheet.statements(from, to)) {
    const { open, close } = statement
    if (open === undefined || close === undefined) continue
    const first = firstSignificant(sheet.tokens, statement.from, open)
    const keyword = atKeywordAt(sheet, first)
    if (keyword === undefined) {
      for (const atom of atomsSelectedBy(sheet, first, open)) atoms.add(atom)
    } else if (GROUPS.has(keyword)) {
      collectAtoms(sheet, open + 1, close, atoms)
    }
  }
}

/**
 * What the `@layer atomic` blocks of `css` hold.
 */
export function inspectAtomicLayer(css: string): LayerReading {
  const atoms = new Set<string>()
  if (!css.includes('atomic')) return { hasLayer: false, atoms }
  const sheet = readSheet(css)
  let hasLayer = false
  for (const statement of sheet.statements(0, sheet.tokens.length)) {
    if (!isAtomicLayer(sheet, statement)) continue
    hasLayer = true
    collectAtoms(sheet, statement.open! + 1, statement.close!, atoms)
  }
  return { hasLayer, atoms }
}
