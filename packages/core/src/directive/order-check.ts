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
  OrderDeclaration,
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
  type Emitted,
  type UnitContext,
  unitsOfBlock,
} from './order-units.ts'
import { isSameProperty, propertiesRelate } from './property-relations.ts'
import { compareSpecificity } from './selector-specificity.ts'
import { normalizeValueForCompare } from './value-equality.ts'

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
 * The comparison key of a declaration's value, made once: one declaration is compared with every
 * other one, and reading its tokens afresh for each pair is a cost per pair.
 */
const VALUE_KEYS = new WeakMap<OrderDeclaration, string>()

/**
 * The comparison key of `declaration`'s value.
 */
function valueKey(declaration: OrderDeclaration): string {
  let key = VALUE_KEYS.get(declaration)
  if (key === undefined) {
    key = normalizeValueForCompare(declaration.value)
    VALUE_KEYS.set(declaration, key)
  }
  return key
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
      (block) => !isSameProperty(block.prop, later.prop) || valueKey(block) !== valueKey(later),
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
 * weighs inside it and `emitted` what a directive inside a nested rule expands to. The candidates
 * of each part are read once, however many blocks come before it.
 */
export function checkOrder(
  segments: readonly Segment[],
  amp: Specificity,
  emitted: Emitted,
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
  return segments.flatMap((segment, index) =>
    segment.kind === 'atom-block' ? findingsOfBlock(index, segments, candidatesOfSegment, amp) : [],
  )
}
