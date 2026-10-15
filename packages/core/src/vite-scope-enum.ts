/**
 * An enum in the scope walk: its member names are declared in a scope of its own before any
 * initialiser is walked, since inside an initialiser a name that is a sibling member means the
 * member.
 */
import type { AstNode } from './vite-ast.ts'
import type { Scope, Walker } from './vite-scope-types.ts'

import { nodeAt, nodesAt, propertyNameOf } from './vite-ast.ts'
import { declare, newScope } from './vite-scope-types.ts'

/**
 * Walks the enum `node`: declares its members, then walks its body in that scope.
 */
export function visitEnum(node: AstNode, scope: Scope, walker: Walker): void {
  const inner = newScope(scope, false)
  const body = nodeAt(node, 'body')
  const members = body ? nodesAt(body, 'members') : []
  for (const member of members) {
    const name = propertyNameOf(nodeAt(member, 'id'), false)
    if (name !== undefined) declare(inner, { name, kind: 'const', writes: 0 })
  }
  if (!body) return
  walker.parentOf.set(body, node)
  walker.visit(body, inner)
}
