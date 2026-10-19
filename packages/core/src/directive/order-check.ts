/**
 * The order check: where a rule's output lets a later declaration override a declaration from an
 * atom's conditional block by cascade order alone. Both must be on the same element at the same
 * specificity, in the same layer and neither `!important`; their conditions must not be provably
 * disjoint; and their properties must relate and not be the same property with equal values.
 */
import type { AtomFacts, Candidate, DirectiveFacts, Finding } from './order-model.ts'
import type { AnchoredBlock, Declaration } from './plan.ts'
import type { ModelNode } from './rule-model.ts'
import type { Specificity } from './selector-specificity.ts'

import { compare } from './order-compare.ts'
import { outwardFindings } from './order-outward.ts'
import {
  candidatesOfAtomBlock,
  candidatesOfAtomDeclarations,
  candidatesOfOwnNode,
  type Emitted,
  type UnitContext,
  unitsOfBlock,
} from './order-units.ts'

/**
 * A part of the rule's output, in output order.
 */
export type Segment = AtomBlockSegment | AtomDeclarationsSegment | OwnSegment

interface OwnSegment {
  readonly kind: 'own'
  readonly node: ModelNode
}

interface AtomDeclarationsSegment {
  readonly atom: AtomFacts
  readonly declarations: readonly Declaration[]
  readonly directive: DirectiveFacts
  readonly kind: 'atom-declarations'
}

interface AtomBlockSegment {
  readonly atom: AtomFacts
  readonly block: AnchoredBlock
  readonly directive: DirectiveFacts
  readonly kind: 'atom-block'
}

/**
 * The context an atom's body is read in.
 */
function contextOf(
  segment: AtomBlockSegment | AtomDeclarationsSegment,
  amp: Specificity,
): UnitContext {
  return { amp, atom: segment.atom, directive: segment.directive }
}

/**
 * The candidates one segment contributes.
 */
function candidatesOf(segment: Segment, amp: Specificity, emitted: Emitted): Candidate[] {
  if (segment.kind === 'own') return candidatesOfOwnNode(segment.node, amp, emitted)
  const context = contextOf(segment, amp)
  if (segment.kind === 'atom-declarations') {
    return candidatesOfAtomDeclarations(context, segment.declarations)
  }
  return candidatesOfAtomBlock(context, segment.block)
}

/**
 * Whether two segments are parts of the same atom of the same directive.
 */
function isSameAtom(a: Segment, b: Segment): boolean {
  return (
    a.kind !== 'own' &&
    b.kind !== 'own' &&
    a.directive.ref === b.directive.ref &&
    a.atom.atomIndex === b.atom.atomIndex
  )
}

/**
 * The findings of one block segment against the candidates of the later parts of the output.
 */
function findingsOfBlock(
  index: number,
  segments: readonly Segment[],
  candidatesOfSegment: (index: number) => readonly Candidate[],
  amp: Specificity,
): Finding[] {
  const segment = segments[index] as AtomBlockSegment
  const units = unitsOfBlock(contextOf(segment, amp), segment.block)
  const candidates = segments.flatMap((other, at) =>
    at > index && !isSameAtom(segment, other) ? candidatesOfSegment(at) : [],
  )
  return candidates.flatMap((candidate) =>
    units.map((unit) => compare(unit, candidate)).filter((f) => f !== undefined),
  )
}

/**
 * Every finding in a rule's output, `segments` being its parts in output order, `amp` what `&`
 * weighs inside it and `emitted` what a directive inside a nested rule expands to, which is also
 * compared with what the rule holds after it (`order-outward.ts`), unless every selector of the rule
 * ends in a pseudo-element, where a nested `&` matches nothing. The candidates
 * of each part are read once, however many blocks come before it.
 */
export function checkOrder(
  segments: readonly Segment[],
  amp: Specificity,
  emitted: Emitted,
  isPseudoElementRule = false,
): Finding[] {
  const known = new Map<number, readonly Candidate[]>()
  const candidatesOfSegment = (index: number): readonly Candidate[] => {
    let candidates = known.get(index)
    if (candidates === undefined) {
      candidates = candidatesOf(segments[index]!, amp, emitted)
      known.set(index, candidates)
    }
    return candidates
  }
  const inner = segments.flatMap((segment, index) =>
    segment.kind === 'atom-block' ? findingsOfBlock(index, segments, candidatesOfSegment, amp) : [],
  )
  if (isPseudoElementRule) return inner
  return [...inner, ...outwardFindings(segments, amp, emitted, candidatesOfSegment)]
}
