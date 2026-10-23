/**
 * The test of one pair for the order check: a unit (a declaration group of an atom's conditional
 * block) and a candidate (a later declaration) are a finding when they are on the same element at
 * the same specificity, under conditions that may both hold, and set related properties to
 * different values, neither `!important`.
 */
import type { Candidate, Finding, OrderDeclaration, RelatedPair, Unit } from './order-model.ts'
import type { Specificity } from './selector-specificity.ts'

import { conditionsMayOverlap } from './condition-overlap.ts'
import { isSameProperty, propertiesRelate } from './property-relations.ts'
import { compareSpecificity } from './selector-specificity.ts'
import { normalizeValueForCompare } from './value-equality.ts'

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
export function compare(unit: Unit, candidate: Candidate): Finding | undefined {
  if (!haveEqualSpecificity(unit.specificities, candidate.specificities)) return undefined
  if (!conditionsMayOverlap(unit.conditions, candidate.conditions)) return undefined
  const pairs = relatedPairs(unit, candidate)
  return pairs.length === 0 ? undefined : { unit, candidate, pairs }
}
