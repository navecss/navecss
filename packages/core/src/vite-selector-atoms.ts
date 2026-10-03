/**
 * Which built-in atoms a selector needs. A rule can match only if some element carries a class
 * the selector asks for in one of its own compounds, so a class in a compound of the selector
 * itself is a need. An `:is()` or `:where()` among those compounds is a need only when every one
 * of its alternatives is one. A class inside `:not()`, `:has()` or any other argument is no need:
 * the rule can match without such an element.
 */
import type { Sheet } from './vite-css-blocks.ts'

import { atomOfClass } from './vite-literal-classes.ts'

const OPENERS = new Set(['(-token', '[-token', 'function-token'])
const CLOSERS = new Set([')-token', ']-token'])

/**
 * The selector list `[from, to)` as token ranges, one per member.
 */
export function membersOf(sheet: Sheet, from: number, to: number): [number, number][] {
  const members: [number, number][] = []
  let start = from
  let depth = 0
  for (let index = from; index < to; index += 1) {
    const type = sheet.tokens[index]!.type
    if (OPENERS.has(type)) depth += 1
    else if (CLOSERS.has(type)) depth -= 1
    else if (type === 'comma-token' && depth === 0) {
      members.push([start, index])
      start = index + 1
    }
  }
  members.push([start, to])
  return members
}

/**
 * The index of the token closing the parenthesis or bracket opened at `open`, or the last token
 * of `[open, to)` when it never closes.
 */
function closeOfGroup(sheet: Sheet, open: number, to: number): number {
  let depth = 0
  for (let index = open; index < to; index += 1) {
    const type = sheet.tokens[index]!.type
    if (OPENERS.has(type)) depth += 1
    else if (CLOSERS.has(type)) depth -= 1
    if (depth === 0) return index
  }
  return to - 1
}

/**
 * Whether the token at `index` opens `:is(` or `:where(`, whose alternatives are compounds of the
 * selector itself.
 */
function isTransparentList(sheet: Sheet, index: number): boolean {
  const token = sheet.tokens[index]!
  if (token.type !== 'function-token' || sheet.tokens[index - 1]?.type !== 'colon-token') {
    return false
  }
  const name = (token.structured as { value: string }).value.toLowerCase()
  return name === 'is' || name === 'where'
}

/**
 * The built-in atom of the class selector at token `index` (a `.` and an identifier), if it is
 * one.
 */
function atomAt(sheet: Sheet, index: number, to: number): string | undefined {
  const name = sheet.tokens[index + 1]
  if (index + 1 >= to || name?.type !== 'ident-token') return undefined
  const dot = sheet.tokens[index]!
  if (dot.type !== 'delim-token' || dot.raw !== '.') return undefined
  return atomOfClass((name.structured as { value: string }).value)
}

/**
 * The built-in atoms the tokens `[from, to)` name in compounds of the selector itself, and in the
 * alternatives of an `:is()` or `:where()` among them, never inside another argument.
 */
export function atomsNamedBy(sheet: Sheet, from: number, to: number): string[] {
  const atoms: string[] = []
  for (let index = from; index < to; index += 1) {
    if (!OPENERS.has(sheet.tokens[index]!.type)) {
      const atom = atomAt(sheet, index, to)
      if (atom) atoms.push(atom)
      continue
    }
    const close = closeOfGroup(sheet, index, to)
    if (isTransparentList(sheet, index)) atoms.push(...atomsNamedBy(sheet, index + 1, close))
    index = close
  }
  return atoms
}

/**
 * The atoms outside `emitted` that a list of alternatives all need: none unless every
 * alternative needs one.
 */
function sharedNeeds(
  sheet: Sheet,
  from: number,
  to: number,
  emitted: ReadonlySet<string>,
): string[] {
  const alternatives = membersOf(sheet, from, to).map(([start, end]) =>
    blockersOf(sheet, start, end, emitted),
  )
  return alternatives.every((needs) => needs.length > 0) ? alternatives.flat() : []
}

/**
 * The atoms outside `emitted` that make the selector `[from, to)` need an element that carries
 * them: none when it can match without one.
 */
export function blockersOf(
  sheet: Sheet,
  from: number,
  to: number,
  emitted: ReadonlySet<string>,
): string[] {
  const blockers: string[] = []
  for (let index = from; index < to; index += 1) {
    if (!OPENERS.has(sheet.tokens[index]!.type)) {
      const atom = atomAt(sheet, index, to)
      if (atom && !emitted.has(atom)) blockers.push(atom)
      continue
    }
    const close = closeOfGroup(sheet, index, to)
    if (isTransparentList(sheet, index))
      blockers.push(...sharedNeeds(sheet, index + 1, close, emitted))
    index = close
  }
  return blockers
}
