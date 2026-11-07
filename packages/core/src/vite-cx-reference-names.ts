/**
 * The names a module's type positions and JSX elements refer to, which the scope analysis reads no
 * reference for.
 */
import type { AstNode } from './vite-ast.ts'

import { childrenOf, nodeAt, pushAll } from './vite-ast.ts'

/**
 * The leftmost name of a type's reference: `a` of `a`, `a.b` and `a.b.c`.
 */
function leftmostName(node: AstNode | undefined): string | undefined {
  let current = node
  while (current?.type === 'TSQualifiedName') current = nodeAt(current, 'left')
  return current?.type === 'Identifier' ? (current.name as string) : undefined
}

/**
 * The name of the type a node refers to: that of `typeof name` and of a type reference.
 */
export function typeNameOf(node: AstNode): string | undefined {
  if (node.type === 'TSTypeQuery') return leftmostName(nodeAt(node, 'exprName'))
  return node.type === 'TSTypeReference' ? leftmostName(nodeAt(node, 'typeName')) : undefined
}

/**
 * The name a JSX element is written with: `a` of `<a />` and of `<a.b.c />`.
 */
export function jsxNameOf(node: AstNode): string | undefined {
  if (node.type !== 'JSXOpeningElement') return undefined
  let current = nodeAt(node, 'name')
  while (current?.type === 'JSXMemberExpression') current = nodeAt(current, 'object')
  return current?.type === 'JSXIdentifier' ? (current.name as string) : undefined
}

/**
 * The names `nameOf` finds across the nodes of `program`.
 */
export function namesIn(
  program: AstNode,
  nameOf: (node: AstNode) => string | undefined,
): Set<string> {
  const found = new Set<string>()
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const name = nameOf(node)
    if (name !== undefined) found.add(name)
    pushAll(stack, childrenOf(node))
  }
  return found
}
