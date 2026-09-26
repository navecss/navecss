/**
 * Counts checked property names written in BARE form inside each Markdown list and table, which
 * is what a copy of the property list consists of. A name inside an example declaration
 * (`color: var(--x, red)`) or used as a word in a sentence is an example, not a copy, and is not
 * counted.
 */
import { isMatchedByEntry } from './css-properties.ts'

/**
 * The checked property names: every plain-string entry of the strict-value property list, and
 * every non-prefixed name of `allProperties` that one of its pattern entries matches.
 */
export function checkedPropertyNames(
  entries: readonly string[],
  allProperties: readonly string[],
): Set<string> {
  const plain = entries.filter((entry) => !entry.startsWith('/'))
  const patterns = entries.filter((entry) => entry.startsWith('/'))
  const matched = allProperties.filter(
    (name) => !name.startsWith('-') && patterns.some((entry) => isMatchedByEntry(entry, name)),
  )
  return new Set([...plain, ...matched])
}

interface Block {
  readonly kind: 'list' | 'table'
  readonly units: string[]
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/

type LineKind = 'blank' | 'row' | 'item' | 'continuation' | 'other'

const PIPE_LED = /^\s*\|/
const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/

/**
 * The indexes of the run of non-blank lines holding a `|` that starts at `start`.
 */
function tableRunFrom(lines: readonly string[], start: number): number[] {
  let end = start
  while (end < lines.length && lines[end]!.trim() !== '' && lines[end]!.includes('|')) end++
  return Array.from({ length: end - start }, (_, offset) => start + offset)
}

/**
 * The indexes of the lines that belong to a table written without leading pipes: a line holding
 * a `|` followed by a delimiter row (`--- | ---`), then every following non-blank line holding a
 * `|`. A table whose rows start with `|` is found line by line in `lineKind`.
 */
function unledTableRows(lines: readonly string[]): Set<number> {
  const rows = new Set<number>()
  for (const [index, line] of lines.entries()) {
    const next = lines[index + 1] ?? ''
    if (rows.has(index) || PIPE_LED.test(line) || !line.includes('|')) continue
    if (!DELIMITER_ROW.test(next)) continue
    for (const row of tableRunFrom(lines, index)) rows.add(row)
  }
  return rows
}

/**
 * The cells of a table row: between the pipes of a row that starts with one, as before, and
 * every `|`-separated part of a row that does not.
 */
function cellsOf(line: string): string[] {
  return PIPE_LED.test(line) ? line.split('|').slice(1, -1) : line.split('|')
}

/**
 * What one line is, given the block open above it and whether the line before it was blank.
 */
function lineKind(
  line: string,
  current: Block | undefined,
  wasBlank: boolean,
  isUnledTableRow: boolean,
): LineKind {
  if (line.trim() === '') return 'blank'
  if (isUnledTableRow || PIPE_LED.test(line)) return 'row'
  if (LIST_ITEM.test(line)) return 'item'
  // An indented line continues the item above it, and so does an unindented one with no blank
  // line before it (Markdown's lazy continuation).
  const isInList = current?.kind === 'list'
  if (isInList && (!wasBlank || /^\s+\S/.test(line))) return 'continuation'
  return 'other'
}

/**
 * The block a row or an item belongs to: the open one if it is of the same kind, else a new
 * one, appended to `blocks`.
 */
function blockFor(kind: 'row' | 'item', current: Block | undefined, blocks: Block[]): Block {
  const blockKind = kind === 'row' ? 'table' : 'list'
  if (current?.kind === blockKind) return current
  const opened: Block = { kind: blockKind, units: [] }
  blocks.push(opened)
  return opened
}

/**
 * The lists and tables of `markdown`, fenced code (backticks or tildes) removed first. A list's units are its items,
 * nested items included, each with its continuation lines; blank lines between items keep one
 * list, as they do in Markdown. A table's units are its cells.
 */
function listsAndTables(markdown: string): Block[] {
  const blocks: Block[] = []
  let current: Block | undefined
  let wasBlank = false
  const lines = markdown.replaceAll(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').split('\n')
  const tableRows = unledTableRows(lines)
  for (const [index, line] of lines.entries()) {
    const kind = lineKind(line, current, wasBlank, tableRows.has(index))
    wasBlank = kind === 'blank'
    if (kind === 'row' || kind === 'item') {
      current = blockFor(kind, current, blocks)
      current.units.push(...(kind === 'row' ? cellsOf(line) : [line.replace(LIST_ITEM, '')]))
    } else if (kind === 'continuation') {
      current!.units[current!.units.length - 1] += ` ${line.trim()}`
    } else if (kind === 'other' || current?.kind === 'table') {
      current = undefined
    }
  }
  return blocks
}

/**
 * The checked names each unit holds in bare form: a code span whose whole trimmed content is the
 * name, or a unit whose whole text, backticks and one trailing `.`, `,`, `;` or `:` removed, is
 * the name.
 */
function bareNamesIn(unit: string, names: ReadonlySet<string>): string[] {
  const spans = unit
    .matchAll(/`([^`]+)`/g)
    .map((m) => m[1]!.trim())
    .toArray()
  const whole = unit
    .replaceAll('`', '')
    .trim()
    .replace(/[.,;:]$/, '')
  return [...spans, whole].filter((text) => names.has(text))
}

/**
 * For each list and table of `markdown`, the distinct checked names it holds in bare form.
 */
export function bareNamesPerListOrTable(markdown: string, names: ReadonlySet<string>): string[][] {
  return listsAndTables(markdown).map((block) => [
    ...new Set(block.units.flatMap((unit) => bareNamesIn(unit, names))),
  ])
}
