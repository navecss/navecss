/**
 * Which packages call `cx.dynamic()` in code the Pages Router reaches: the Pages Router bundles a
 * dependency's server code only when the config asks, and `cx.dynamic()` reads its map from the
 * bundle.
 */
import type { Graph } from './graph-types.ts'

/**
 * The files `file` imports that the walk has not met.
 */
function unmet(graph: Pick<Graph, 'edges'>, file: string, met: ReadonlySet<string>): string[] {
  return [...(graph.edges.get(file) ?? new Set<string>()).difference(met)]
}

/**
 * Adds to `graph.pagesDynamicPackages` the packages under `node_modules` that call `cx.dynamic()`
 * in a file reachable from `starts`.
 * @param graph What the walk read: the files each file imports and the files that call it.
 * @param starts The files the Pages Router starts from.
 * @param packageOf The package a file belongs to, when it is under `node_modules`.
 */
export function addPagesDynamicPackages(
  graph: Pick<Graph, 'dynamicFiles' | 'edges' | 'pagesDynamicPackages'>,
  starts: readonly string[],
  packageOf: (file: string) => string | undefined,
): void {
  const met = new Set(starts)
  const queue = [...starts]
  while (queue.length > 0) {
    const file = queue.pop()!
    const name = graph.dynamicFiles.has(file) ? packageOf(file) : undefined
    if (name !== undefined) graph.pagesDynamicPackages.add(name)
    const next = unmet(graph, file, met)
    for (const reached of next) met.add(reached)
    queue.push(...next)
  }
}
