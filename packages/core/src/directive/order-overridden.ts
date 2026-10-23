/**
 * What a finding overrides, as longhands: the longhands of the block's declarations that the
 * later declaration also sets. A logical property and its physical counterpart share none, so a
 * pair like that overrides all the block's longhands.
 */
import type { RelatedPair } from './order-model.ts'

import { longhandsOf, standardName } from './property-relations.ts'

/**
 * The longhands one pair overrides, named as the block's own property names them: those whose
 * property the later declaration also sets, a legacy name alias counting as the property it
 * stands for.
 */
function overriddenByPair(pair: RelatedPair): readonly string[] {
  const block = longhandsOf(pair.block.prop)
  const later = new Set(longhandsOf(pair.later.prop).map((longhand) => standardName(longhand)))
  const shared = block.filter((longhand) => later.has(standardName(longhand)))
  return shared.length > 0 ? shared : block
}

/**
 * The longhands `pairs` override, in the order the block declares them, each once.
 */
export function overriddenLonghands(pairs: readonly RelatedPair[]): string[] {
  const all = pairs.flatMap((pair) => overriddenByPair(pair))
  return [...new Set(all)]
}
