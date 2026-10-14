/**
 * What an import declaration binds in the scope scan.
 */
import type { AstNode } from './vite-ast.ts'
import type { Scope } from './vite-scope-types.ts'

import { isTypeOnly, nodeAt, nodesAt, stringAt } from './vite-ast.ts'

/**
 * The imported name an import specifier takes.
 */
function importedName(specifier: AstNode): string {
  if (specifier.type === 'ImportNamespaceSpecifier') return '*'
  if (specifier.type !== 'ImportSpecifier') return 'default'
  const imported = nodeAt(specifier, 'imported')
  return stringAt(imported ?? specifier, 'name') ?? String(imported?.value)
}

/**
 * Declares what an import declaration binds.
 */
export function declareImport(node: AstNode, scope: Scope): void {
  if (isTypeOnly(node)) return
  const source = String(nodeAt(node, 'source')?.value)
  for (const specifier of nodesAt(node, 'specifiers')) {
    if (isTypeOnly(specifier)) continue
    const local = stringAt(nodeAt(specifier, 'local') ?? specifier, 'name')
    if (local === undefined) continue
    const imported = importedName(specifier)
    scope.bindings.set(local, { name: local, kind: 'import', writes: 0, source, imported })
  }
}
