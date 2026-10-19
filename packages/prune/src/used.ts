/**
 * The atoms a build emits: what the graph read, `keep`, every `keepFor` list, and the pair
 * closure.
 */
import { withRestorers } from '@navecss/core/collect'

import type { Graph } from './graph-types.ts'

/**
 * The emitted set, sorted: the atoms the graph read, `keep` and every `keepFor` list, closed
 * under the one pair where one atom restores what the other hides.
 */
export function emittedAtoms(
  graph: Graph,
  options: {
    readonly keep: readonly string[]
    readonly keepFor: Readonly<Record<string, readonly string[]>>
  },
): string[] {
  const atoms = new Set(graph.atoms)
  for (const atom of options.keep) atoms.add(atom)
  for (const list of Object.values(options.keepFor)) {
    for (const atom of list) atoms.add(atom)
  }
  return [...withRestorers(atoms)].toSorted((a, b) => a.localeCompare(b))
}
