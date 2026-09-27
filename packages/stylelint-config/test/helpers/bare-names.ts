/**
 * Finds the checked property names a Markdown document holds in BARE form, which is what a copy
 * of the property list consists of. The document is read outside fenced code, as units: each
 * list item, each table cell, each heading and each other paragraph. A unit is read as words,
 * so emphasis, link syntax and punctuation are never part of a name, and a name inside a
 * sentence is one word among others.
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

interface Unit {
  readonly kind: 'item' | 'paragraph' | 'cell' | 'heading'
  text: string
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/
const HEADING = /^\s{0,3}#{1,6}\s/
const PIPE_LED = /^\s*\|/
const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/

/**
 * The indexes of the run of non-blank lines holding a `|` that starts at `start`.
 */
function tableRunFrom(lines: readonly string[], start: number): number[] {
  let end = start
  while (end < lines.length && lines[end]!.trim() !== '' && lines[end]!.includes('|')) end++
  return Array.from({ length: end - start }, (_, offset) => start + offset)
}

/**
 * The indexes of the lines that belong to a table, with or without leading pipes: a line
 * holding a `|` followed by a delimiter row holding one, then every following non-blank line
 * holding a `|`.
 */
function tableRows(lines: readonly string[]): Set<number> {
  const rows = new Set<number>()
  for (const [index, line] of lines.entries()) {
    const next = lines[index + 1] ?? ''
    if (rows.has(index) || !line.includes('|')) continue
    if (!next.includes('|') || !DELIMITER_ROW.test(next)) continue
    for (const row of tableRunFrom(lines, index)) rows.add(row)
  }
  return rows
}

/**
 * The cells of a table row: between the pipes of a row that starts with one, and every
 * `|`-separated part of a row that does not.
 */
function cellsOf(line: string): Unit[] {
  const cells = PIPE_LED.test(line) ? line.split('|').slice(1, -1) : line.split('|')
  return cells.map((text) => ({ kind: 'cell', text }))
}

/**
 * Whether `line` continues the open unit: a list item continues on an indented line, and on an
 * unindented one with no blank line before it (Markdown's lazy continuation); a paragraph
 * continues on any line with no blank line before it.
 */
function isContinuation(line: string, current: Unit | undefined, wasBlank: boolean): boolean {
  if (current === undefined) return false
  if (!wasBlank) return true
  return current.kind === 'item' && /^\s+\S/.test(line)
}

/**
 * The unit a non-blank line that is not a table row opens, or `undefined` when it continues
 * the open one.
 */
function unitOpenedBy(
  line: string,
  current: Unit | undefined,
  wasBlank: boolean,
): Unit | undefined {
  if (HEADING.test(line)) return { kind: 'heading', text: line.replace(HEADING, '') }
  if (LIST_ITEM.test(line)) return { kind: 'item', text: line.replace(LIST_ITEM, '') }
  if (isContinuation(line, current, wasBlank)) return undefined
  return { kind: 'paragraph', text: line.trim() }
}

/**
 * The units of `markdown`, fenced code (backticks or tildes) removed first: each list item with
 * its continuation lines (a nested item being a unit of its own), each table cell, each heading
 * and each other paragraph.
 */
function unitsOf(markdown: string): Unit[] {
  const lines = markdown.replaceAll(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').split('\n')
  const rows = tableRows(lines)
  const units: Unit[] = []
  let current: Unit | undefined
  let wasBlank = false
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') {
      wasBlank = true
      if (current?.kind === 'paragraph') current = undefined
      continue
    }
    if (rows.has(index) || PIPE_LED.test(line)) {
      units.push(...cellsOf(line))
      current = undefined
    } else {
      const opened = unitOpenedBy(line, current, wasBlank)
      if (opened === undefined) current!.text += ` ${line.trim()}`
      else units.push(opened)
      // A heading takes no continuation lines.
      if (opened !== undefined) current = opened.kind === 'heading' ? undefined : opened
    }
    wasBlank = false
  }
  return units
}

/**
 * The words of a unit, after link and image syntax is reduced to its text: a code span is one
 * word (its trimmed content), and elsewhere a word is a run of letters, digits and hyphens.
 */
function wordsOf(text: string): string[] {
  const reduced = text
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replaceAll(/<https?:[^>]*>/g, ' ')
  return reduced
    .split('`')
    .flatMap((part, index) =>
      index % 2 === 1 ? [part.trim()] : (part.match(/[A-Za-z0-9-]+/g) ?? []),
    )
}

/**
 * The checked names a unit's words hold in bare form: the only word of the unit, or a word in a
 * run of three or more consecutive checked names, the words `and` and `or` skipped.
 */
function bareNamesIn(words: readonly string[], names: ReadonlySet<string>): string[] {
  if (words.length === 1) return names.has(words[0]!) ? [words[0]!] : []
  const bare: string[] = []
  let run: string[] = []
  for (const word of [...words.filter((w) => !/^(?:and|or)$/i.test(w)), '']) {
    if (names.has(word)) {
      run.push(word)
      continue
    }
    if (run.length >= 3) bare.push(...run)
    run = []
  }
  return bare
}

/**
 * The distinct checked names `markdown` holds in bare form, outside fenced code.
 */
export function bareCheckedNames(markdown: string, names: ReadonlySet<string>): Set<string> {
  return new Set(unitsOf(markdown).flatMap((unit) => bareNamesIn(wordsOf(unit.text), names)))
}
