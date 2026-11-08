/**
 * The names a CommonJS module writes its exports through, and the statements a forward is read
 * from: `exports` and `module.exports`, their members, a top-level call, and
 * `Object.defineProperty(...)` on them.
 */
import type { AstNode } from './vite-ast.ts'
import type { CxNames } from './vite-cx-take-keys.ts'
import type { Taken } from './vite-cx-takes.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { exportNameOf, nodeAt, nodesAt, staticStringOf } from './vite-ast.ts'

/**
 * Whether `node` is the name `name`.
 */
export function isName(node: AstNode | undefined, name: string): boolean {
  return node?.type === 'Identifier' && node.name === name
}

/**
 * Whether `node` is `module.exports`.
 */
export function isModuleExports(node: AstNode | undefined): boolean {
  if (node?.type !== 'MemberExpression' || node.computed === true) return false
  return isName(nodeAt(node, 'object'), 'module') && isName(nodeAt(node, 'property'), 'exports')
}

/**
 * Whether `node` is the exports object: `exports` or `module.exports`.
 */
export function isExportsObject(node: AstNode | undefined): boolean {
  return isName(node, 'exports') || isModuleExports(node)
}

/**
 * The name a non-computed member expression reads off its object, and that object.
 */
export function memberOf(node: AstNode | undefined): { name: string; object: AstNode } | undefined {
  if (node?.type !== 'MemberExpression' || node.computed === true) return undefined
  const object = nodeAt(node, 'object')
  const name = exportNameOf(nodeAt(node, 'property'))
  return object === undefined || name === undefined ? undefined : { name, object }
}

/**
 * The name of the export a member of the exports object writes to: `b` of `exports.b` and of
 * `module.exports.b`.
 */
export function exportsMemberOf(node: AstNode | undefined): string | undefined {
  const member = memberOf(node)
  if (!member) return undefined
  return isExportsObject(member.object) ? member.name : undefined
}

export interface Forward {
  /**
   * The names the module gives the take out under.
   */
  readonly given: readonly string[]
  readonly require: AstNode
  readonly takes: readonly Taken[]
}

export interface ForwardInput {
  /**
   * The module's scope analysis, made on first use.
   */
  readonly analysis: () => ScopeAnalysis
  readonly names: CxNames
  readonly requires: ReadonlySet<AstNode>
}

/**
 * The call a top-level expression statement makes, when it makes one.
 */
export function statementCallOf(statement: AstNode): AstNode | undefined {
  if (statement.type !== 'ExpressionStatement') return undefined
  const expression = nodeAt(statement, 'expression')
  return expression?.type === 'CallExpression' ? expression : undefined
}

/**
 * The parts of a top-level `Object.defineProperty(target, key, descriptor)` statement, `as` being
 * the key when it is a string.
 */
export function definePropertyOf(
  statement: AstNode,
):
  | { as: string | undefined; descriptor: AstNode | undefined; target: AstNode | undefined }
  | undefined {
  const call = statementCallOf(statement)
  const callee = call && memberOf(nodeAt(call, 'callee'))
  if (!call || callee?.name !== 'defineProperty' || !isName(callee.object, 'Object')) {
    return undefined
  }
  const [target, key, descriptor] = nodesAt(call, 'arguments')
  return { as: staticStringOf(key), descriptor, target }
}
