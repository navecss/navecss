/**
 * How a module uses what its import specifiers take from a module that gives out `cx`: whether it
 * passes the value on to an export of its own (a forward), whether it carries it where the build
 * cannot follow it, and the takes of the whole module a dependency makes that the build cannot
 * read to the exports used.
 */
import type { AstNode } from './vite-ast.ts'
import type { Taken } from './vite-cx-takes.ts'
import type { Reference, ScopeAnalysis } from './vite-scope.ts'

import { exportNameOf, nodeAt } from './vite-ast.ts'
import { type Flow, flowOf } from './vite-cx-flow.ts'

/**
 * The references to the binding that the import specifier of `source` declares.
 */
export function usesOf(
  analysis: ScopeAnalysis,
  source: string,
  specifier: AstNode,
): readonly Reference[] {
  const local = exportNameOf(nodeAt(specifier, 'local'))
  return analysis.references.filter(
    ({ binding }) =>
      binding?.kind === 'import' && binding.source === source && binding.name === local,
  )
}

/**
 * Whether a use only passes the value on: it reaches an export and is neither called nor carried.
 */
function isPure(flow: Flow): boolean {
  return flow.names.size > 0 && !flow.isCalled && !flow.isUnbound
}

/**
 * How the module passes on what the import specifier declares: `isPassedOn` when it reaches an
 * export of the module, by an export statement or through aliases of it, `isForward` when it does
 * nothing else with it.
 */
export function passingOf(
  analysis: ScopeAnalysis,
  source: string,
  specifier: AstNode,
): { isForward?: true; isPassedOn?: true } {
  const flows = usesOf(analysis, source, specifier).map((use) => flowOf(analysis, use.node))
  if (flows.every((flow) => flow.names.size === 0)) return {}
  return flows.every((flow) => isPure(flow))
    ? { isForward: true, isPassedOn: true }
    : { isPassedOn: true }
}

/**
 * Whether a use of the import specifier carries it where the build cannot follow it.
 */
export function isCarriedOn(analysis: ScopeAnalysis, source: string, specifier: AstNode): boolean {
  return usesOf(analysis, source, specifier).some((use) => flowOf(analysis, use.node).isUnbound)
}

/**
 * A dependency's take of the whole module that is not a forward, which the build cannot read to
 * the exports it uses: held.
 */
export function withHeld(taken: Taken, source: string): Taken {
  const isWhole = taken.names.length === 0 && taken.isForward !== true
  if (!isWhole || taken.shape === 'names' || taken.shape === 'star') return taken
  const form =
    taken.shape === 'namespace'
      ? `uses the namespace of ${source} where the build cannot follow it`
      : `imports ${source} and uses it where the build cannot follow it`
  return { ...taken, isHeld: true, form }
}
