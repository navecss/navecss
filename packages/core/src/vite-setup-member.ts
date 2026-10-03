/**
 * What a compiled Vue component's script exposes to its template, and how a template reads it:
 * `$setup.<name>`.
 */
import type { AstNode } from './vite-ast.ts'

import { nodeAt, propertyNameOf, stringAt } from './vite-ast.ts'

export type SetupExposure =
  { readonly kind: 'cx' } | { readonly kind: 'values'; readonly values: readonly string[] }

export type SetupExposures = ReadonlyMap<string, SetupExposure>

/**
 * The name `$setup.<name>` reads, when `node` is such a member read.
 */
export function setupMemberName(node: AstNode): string | undefined {
  if (node.type !== 'MemberExpression') return undefined
  const object = nodeAt(node, 'object')
  if (object?.type !== 'Identifier' || stringAt(object, 'name') !== '$setup') return undefined
  return propertyNameOf(nodeAt(node, 'property'), node.computed === true)
}
