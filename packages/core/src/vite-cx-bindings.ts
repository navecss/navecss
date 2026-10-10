/**
 * Which imports in a module bind Nave's `cx`: the named import (aliased or not) and a namespace
 * import of the module that holds it.
 */
import type { AstNode } from './vite-ast.ts'
import type { CxBinding } from './vite-cx-use.ts'
import type { Binding, ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt, staticStringOf } from './vite-ast.ts'

/**
 * The bindings in the module that stand for Nave's `cx`.
 */
export function cxBindingsOf(
  analysis: ScopeAnalysis,
  sources: ReadonlySet<string>,
): Map<Binding, CxBinding> {
  const found = new Map<Binding, CxBinding>()
  for (const { binding } of analysis.references) {
    if (binding?.kind !== 'import' || !binding.source || !sources.has(binding.source)) continue
    if (binding.imported === 'cx') found.set(binding, { binding, isNamespace: false })
    else if (binding.imported === '*') found.set(binding, { binding, isNamespace: true })
  }
  return found
}

/**
 * Whether the module imports from a `cx` source at all, used or not.
 */
export function isImportingCx(program: AstNode, sources: ReadonlySet<string>): boolean {
  return nodesAt(program, 'body').some((node) => {
    const source = staticStringOf(nodeAt(node, 'source'))
    return node.type === 'ImportDeclaration' && source !== undefined && sources.has(source)
  })
}
