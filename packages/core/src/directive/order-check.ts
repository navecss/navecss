/**
 * The order check: where a rule's output lets a later declaration override a declaration from an
 * atom's conditional block by cascade order alone. Both must be on the same element at the same
 * specificity, in the same layer and neither `!important`; their conditions must not be provably
 * disjoint; and their properties must relate and not be the same property with equal values.
 */
import type {
  AtomFacts,
  Candidate,
  DirectiveFacts,
  Finding,
  RelatedPair,
  Unit,
} from './order-model.ts'
import type { AnchoredBlock, Declaration } from './plan.ts'
import type { ModelNode } from './rule-model.ts'
import type { Specificity } from './selector-specificity.ts'

import { conditionsMayOverlap } from './condition-overlap.ts'
import {
  candidatesOfAtomBlock,
  candidatesOfAtomDeclarations,
  candidatesOfOwnNode,
  type UnitContext,
  unitsOfBlock,
} from './order-units.ts'
import { propertiesRelate } from './property-relations.ts'
import { compareSpecificity } from './selector-specificity.ts'
import { declarationValuesEqual } from './value-equality.ts'

/**
 * A part of the rule's output, in output order.
 */
export type Segment = AtomBlockSegment | AtomDeclarationsSegment | OwnSegment

export interface OwnSegment {
  readonly kind: 'own'
  readonly node: ModelNode
}

export interface AtomDeclarationsSegment {
  readonly atom: AtomFacts
  readonly declarations: readonly Declaration[]
  readonly directive: DirectiveFacts
  readonly kind: 'atom-declarations'
}

export interface AtomBlockSegment {
  readonly atom: AtomFacts
  readonly block: AnchoredBlock
  readonly directive: DirectiveFacts
  readonly kind: 'atom-block'
}

/**
 * Whether two property names are the same property: custom properties by exact name, any other
 * ASCII case-insensitively.
 */
function isSameProperty(a: string, b: string): boolean {
  if (a.startsWith('--') || b.startsWith('--')) return a === b
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * The declarations of `unit` and `candidate` that the candidate overrides: related properties,
 * neither `!important`, and not the same property with an equal value.
 */
function relatedPairs(unit: Unit, candidate: Candidate): RelatedPair[] {
  const later = candidate.declaration
  if (later.important) return []
  return unit.declarations
    .filter((block) => !block.important && propertiesRelate(block.prop, later.prop))
    .filter(
      (block) =>
        !isSameProperty(block.prop, later.prop) ||
        !declarationValuesEqual(block.value, later.value),
    )
    .map((block) => ({ block, later }))
}

/**
 * Whether some specificity of `a` equals some specificity of `b`.
 */
function haveEqualSpecificity(a: readonly Specificity[], b: readonly Specificity[]): boolean {
  return a.some((x) => b.some((y) => compareSpecificity(x, y) === 0))
}

/**
 * The finding for `unit` and `candidate`, if the later declaration wins by order alone.
 */
function compare(unit: Unit, candidate: Candidate): Finding | undefined {
  if (!haveEqualSpecificity(unit.specificities, candidate.specificities)) return undefined
  if (!conditionsMayOverlap(unit.conditions, candidate.conditions)) return undefined
  const pairs = relatedPairs(unit, candidate)
  return pairs.length === 0 ? undefined : { unit, candidate, pairs }
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
function candidatesOf(segment: Segment, amp: Specificity): Candidate[] {
  if (segment.kind === 'own') return candidatesOfOwnNode(segment.node, amp)
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
 * The findings of one block segment against every later part of the output.
 */
function findingsOfBlock(
  segment: AtomBlockSegment,
  later: readonly Segment[],
  amp: Specificity,
): Finding[] {
  const units = unitsOfBlock(contextOf(segment, amp), segment.block)
  const candidates = later
    .filter((other) => !isSameAtom(segment, other))
    .flatMap((other) => candidatesOf(other, amp))
  return candidates.flatMap((candidate) =>
    units.map((unit) => compare(unit, candidate)).filter((f) => f !== undefined),
  )
}

/**
 * Every finding in a rule's output, `segments` being its parts in output order and `amp` what
 * `&` weighs inside it.
 */
export function checkOrder(segments: readonly Segment[], amp: Specificity): Finding[] {
  return segments.flatMap((segment, index) =>
    segment.kind === 'atom-block' ? findingsOfBlock(segment, segments.slice(index + 1), amp) : [],
  )
}
