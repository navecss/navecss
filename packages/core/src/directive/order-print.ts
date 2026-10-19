/**
 * The directives a warning prints for the author to paste: the directive with the order of its
 * atoms changed, and the directive with a marker written into it. Both keep the prelude as
 * authored except for the change itself, and both end with the `;` a directive is written with.
 */
import type { AtomFacts } from './order-model.ts'

import { type PreludeMarkers, readMarkers } from './order-marker.ts'
import { type Token, tokenize } from './tokenizer.ts'

const MARKER_HEAD = 'nave-allow-override'

const WORD_LIKE = new Set([
  'dimension-token',
  'function-token',
  'hash-token',
  'ident-token',
  'number-token',
  'percentage-token',
])
const OPENING = new Set(['(-token', '[-token', 'function-token'])
const CLOSING = new Set([')-token', ']-token', 'comma-token', 'semicolon-token'])

/**
 * Whether the gap between two printed tokens is a space. Whitespace is one space. A comment that
 * was dropped leaves none before a closer or after an opener, and where it touched both tokens it
 * leaves one only between two words, which would run together without it.
 */
function isSpaced(
  gap: { readonly hasComment: boolean; readonly hasWhitespace: boolean },
  previous: Token,
  next: Token,
): boolean {
  if (!gap.hasComment) return gap.hasWhitespace
  if (CLOSING.has(next.type) || OPENING.has(previous.type)) return false
  return gap.hasWhitespace || (WORD_LIKE.has(previous.type) && WORD_LIKE.has(next.type))
}

/**
 * A value as a warning prints it, the same in every host: comments dropped, each gap between two
 * tokens one space or none, none at either end, and a string exactly as written. A host hands
 * over a value as it read it (PostCSS keeps the whitespace around a comment it took out of the
 * value), so this is the one place the printed form is decided.
 */
export function printedValue(value: string): string {
  let printed = ''
  let previous: Token | undefined
  let gap = { hasComment: false, hasWhitespace: false }
  for (const token of tokenize(value)) {
    if (token.type === 'whitespace-token') {
      gap = { ...gap, hasWhitespace: true }
    } else if (token.type === 'comment') {
      gap = { ...gap, hasComment: true }
    } else {
      if (previous !== undefined && isSpaced(gap, previous, token)) printed += ' '
      printed += token.raw
      previous = token
      gap = { hasComment: false, hasWhitespace: false }
    }
  }
  return printed
}

/**
 * `@nave ` and the prelude, trimmed, ending in the semicolon.
 */
function directiveText(prelude: string): string {
  return `@nave ${prelude.trim()};`
}

/**
 * The prelude with the atoms named in `order` (indexes into `atoms`), written into the slots the
 * atoms occupy, and everything between the slots (separators, comments) left where it is.
 */
function withAtomsInOrder(
  prelude: string,
  atoms: readonly AtomFacts[],
  order: readonly number[],
): string {
  let result = ''
  let cursor = 0
  for (const [slot, atom] of atoms.entries()) {
    result += prelude.slice(cursor, atom.offset) + atoms[order[slot]!]!.name
    cursor = atom.endOffset
  }
  return result + prelude.slice(cursor)
}

/**
 * The directive with the atoms at `moving` written, in their order, right after `atoms[after]`,
 * the others keeping their order.
 */
export function reorderedDirective(
  prelude: string,
  atoms: readonly AtomFacts[],
  placement: { readonly after: number; readonly moving: readonly number[] },
): string {
  const rest = atoms
    .map((_atom, index) => index)
    .filter((index) => !placement.moving.includes(index))
  const at = rest.indexOf(placement.after)
  const order = [...rest.slice(0, at + 1), ...placement.moving, ...rest.slice(at + 1)]
  return directiveText(withAtomsInOrder(prelude, atoms, order))
}

/**
 * A marker comment naming `names`, with the reason kept when there is one.
 */
function markerComment(names: readonly string[], reason: string | undefined): string {
  const suffix = reason === undefined ? '' : ` -- ${reason}`
  return `/* ${MARKER_HEAD}: ${names.join(' ')}${suffix} */`
}

/**
 * The prelude with `additions` written into the marker it already holds, or into the comment that
 * starts like a marker and is not one, or right after `@nave` when it holds neither.
 */
function withMarker(prelude: string, additions: readonly string[], found: PreludeMarkers): string {
  const first = found.markers[0]
  if (first) {
    const names = [...first.names, ...additions.filter((name) => !first.names.includes(name))]
    return (
      prelude.slice(0, first.start) + markerComment(names, first.reason) + prelude.slice(first.end)
    )
  }
  const bad = found.malformed[0]
  if (bad) {
    return (
      prelude.slice(0, bad.start) + markerComment(additions, undefined) + prelude.slice(bad.end)
    )
  }
  return `${markerComment(additions, undefined)} ${prelude.trim()}`
}

/**
 * The directive with a marker naming `additions` written into it.
 */
export function markedDirective(prelude: string, additions: readonly string[]): string {
  return directiveText(withMarker(prelude, additions, readMarkers(prelude)))
}

/**
 * The directive with the atoms at `moving` written, in their order, right before `atoms[before]`.
 */
export function directiveWithAtomsBefore(
  prelude: string,
  atoms: readonly AtomFacts[],
  placement: { readonly before: number; readonly moving: readonly number[] },
): string {
  const rest = atoms
    .map((_atom, index) => index)
    .filter((index) => !placement.moving.includes(index))
  const at = rest.indexOf(placement.before)
  const order = [...rest.slice(0, at), ...placement.moving, ...rest.slice(at)]
  return directiveText(withAtomsInOrder(prelude, atoms, order))
}
