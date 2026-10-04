/**
 * Which built-in atoms a selector needs. A class selector in one of the selector's own compounds
 * is a need: no element lacking the class can match it. A class inside `:not()`, `:has()` or any
 * functional argument other than `:is()` or `:where()` never makes a member removable, and inside
 * `:is()` or `:where()` it does so only when every alternative is removable. A rule kept for
 * either reason may ship a rule that matches nothing, and never drops one that matches: the safe
 * direction.
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

const closings = new WeakMap<Sheet, Map<number, number>>()

/**
 * The index of the token that closes each parenthesis, function or bracket of the sheet, found
 * once for the sheet. An opener that never closes has no entry.
 */
function closesOf(sheet: Sheet): Map<number, number> {
  const known = closings.get(sheet)
  if (known) return known
  const closes = new Map<number, number>()
  const open: number[] = []
  for (const [index, token] of sheet.tokens.entries()) {
    if (OPENERS.has(token.type)) open.push(index)
    else if (CLOSERS.has(token.type) && open.length > 0) closes.set(open.pop()!, index)
  }
  closings.set(sheet, closes)
  return closes
}

/**
 * The index after the group opened at `index`: past its closing token, or `to` when it never
 * closes inside the range.
 */
function afterGroup(sheet: Sheet, index: number, to: number): number {
  return Math.min((closesOf(sheet).get(index) ?? to - 1) + 1, to)
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
 * alternatives of an `:is()` or `:where()` among them, never inside another argument. One pass:
 * a group that is not transparent is stepped over whole.
 */
export function atomsNamedBy(sheet: Sheet, from: number, to: number): string[] {
  const atoms: string[] = []
  let index = from
  while (index < to) {
    const isGroup = OPENERS.has(sheet.tokens[index]!.type)
    if (isGroup && !isTransparentList(sheet, index)) {
      index = afterGroup(sheet, index, to)
      continue
    }
    const atom = isGroup ? undefined : atomAt(sheet, index, to)
    if (atom) atoms.push(atom)
    index += 1
  }
  return atoms
}

type Part = string | readonly Part[]

/**
 * The atoms one alternative needs: its own, and the chunks its nested lists passed on, kept
 * whole (never copied) with a count, so passing a chunk up costs nothing however deep the lists.
 */
interface Needs {
  readonly parts: Part[]
  size: number
}

interface Alternatives {
  readonly finished: Needs[]
  current: Needs
}

const newNeeds = (): Needs => ({ parts: [], size: 0 })
const newList = (): Alternatives => ({ finished: [], current: newNeeds() })

/**
 * Closes the list of alternatives `done` into `parent`: the atoms every alternative needs, none
 * unless every alternative needs one.
 */
function closeList(done: Alternatives, parent: Alternatives): void {
  const all = [...done.finished, done.current]
  if (all.some((needs) => needs.size === 0)) return
  for (const needs of all) {
    parent.current.parts.push(needs.parts)
    parent.current.size += needs.size
  }
}

/**
 * The atoms of `parts`, in order, found once.
 */
function flatten(parts: readonly Part[]): string[] {
  const atoms: string[] = []
  const stack: Part[] = [parts]
  while (stack.length > 0) {
    const part = stack.pop()!
    if (typeof part === 'string') atoms.push(part)
    else for (let index = part.length - 1; index >= 0; index -= 1) stack.push(part[index]!)
  }
  return atoms
}

/**
 * Reads the token at `index` into the open `lists` and returns the index to read next.
 */
function readToken(
  sheet: Sheet,
  index: number,
  limit: { readonly emitted: ReadonlySet<string>; readonly to: number },
  lists: Alternatives[],
): number {
  const type = sheet.tokens[index]!.type
  const list = lists.at(-1)!
  const isNested = lists.length > 1
  if (OPENERS.has(type)) {
    if (!isTransparentList(sheet, index)) return afterGroup(sheet, index, limit.to)
    lists.push(newList())
  } else if (isNested && type === ')-token') {
    closeList(lists.pop()!, lists.at(-1)!)
  } else if (isNested && type === 'comma-token') {
    list.finished.push(list.current)
    list.current = newNeeds()
  } else {
    const atom = atomAt(sheet, index, limit.to)
    if (atom && !limit.emitted.has(atom)) {
      list.current.parts.push(atom)
      list.current.size += 1
    }
  }
  return index + 1
}

/**
 * The atoms outside `emitted` that make the selector `[from, to)` need an element that carries
 * them: none when it can match without one. One pass over the tokens, however deep the `:is()`
 * and `:where()` lists nest: each list collects what each of its alternatives needs, and passes on
 * what all of them do.
 */
export function blockersOf(
  sheet: Sheet,
  from: number,
  to: number,
  emitted: ReadonlySet<string>,
): string[] {
  const lists = [newList()]
  let index = from
  while (index < to) index = readToken(sheet, index, { emitted, to }, lists)
  // A list left open ends with the range, as the group would.
  while (lists.length > 1) closeList(lists.pop()!, lists.at(-1)!)
  return flatten(lists[0]!.current.parts)
}
