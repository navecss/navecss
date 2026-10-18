/**
 * The directives a warning prints for the author to paste: the directive with the order of its
 * atoms changed, and the directive with a marker written into it. Both keep the prelude as
 * authored except for the change itself, and both end with the `;` a directive is written with.
 */
import type { AtomFacts } from './order-model.ts'

import { type PreludeMarkers, readMarkers } from './order-marker.ts'

const MARKER_HEAD = 'nave-allow-override'

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
 * The directive with `atoms[moving]` written after `atoms[after]`, the others keeping their order.
 */
export function reorderedDirective(
  prelude: string,
  atoms: readonly AtomFacts[],
  placement: { readonly after: number; readonly moving: number },
): string {
  const rest = atoms.map((_atom, index) => index).filter((index) => index !== placement.moving)
  const at = rest.indexOf(placement.after)
  const order = [...rest.slice(0, at + 1), placement.moving, ...rest.slice(at + 1)]
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
