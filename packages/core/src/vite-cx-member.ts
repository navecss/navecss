/**
 * What a member of a value of Nave's `cx` is: one the build reads, a call of the value itself, or
 * one it cannot follow. Only a read of `raw` or `dynamic` by a static key is harmless
 * (`cx.raw` maps no atom, `cx.dynamic` returns only atoms the options keep), and `call` or
 * `apply` called is the module's own call; every other name, every computed key and every write to
 * a member may return the value, a function over it, or rewrite what the application calls. The
 * reader of the `cx` binding and the walk through its aliases both ask this, so one allowlist
 * judges both.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, propertyNameOf, wrappedBy } from './vite-ast.ts'

export type MemberRole = 'call' | 'read' | 'unknown'

/**
 * The members of the value the build reads and does not follow.
 */
export const READ_MEMBERS: ReadonlySet<string> = new Set(['dynamic', 'raw'])

/**
 * The members that call the value or a function over it: `cx.call(...)` and `cx.apply(...)` are
 * the module's own call when they are the callee of a call, and `Function.prototype`'s method
 * otherwise.
 */
const CALL_MEMBERS: ReadonlySet<string> = new Set(['apply', 'call'])

/**
 * The parents whose `left` is a target they write to.
 */
const LEFT_TARGETS: ReadonlySet<string> = new Set([
  'AssignmentExpression',
  'AssignmentPattern',
  'ForInStatement',
  'ForOfStatement',
])

/**
 * The parents that write to whatever sits directly in them.
 */
const WHOLE_TARGETS: ReadonlySet<string> = new Set([
  'ArrayPattern',
  'RestElement',
  'UpdateExpression',
])

/**
 * `node`, or the expression above it when it sits inside a parenthesis or a type assertion
 * (`x as T`, `x satisfies T`, `x!`), which leave the value as it is.
 */
export function unwrapped(analysis: ScopeAnalysis, node: AstNode): AstNode {
  let current = node
  for (;;) {
    const parent = analysis.parentOf.get(current)
    if (!parent || wrappedBy(parent) !== current) return current
    current = parent
  }
}

/**
 * Whether `member` is written to: the left of an assignment, the operand of an update or a
 * `delete`, the left of a `for...in` or `for...of`, or a target inside a destructuring assignment.
 */
export function isMemberWrite(analysis: ScopeAnalysis, member: AstNode): boolean {
  const top = unwrapped(analysis, member)
  const parent = analysis.parentOf.get(top)
  if (!parent) return false
  if (LEFT_TARGETS.has(parent.type)) return nodeAt(parent, 'left') === top
  if (WHOLE_TARGETS.has(parent.type)) return true
  if (parent.type === 'UnaryExpression') return parent.operator === 'delete'
  return (
    parent.type === 'Property' &&
    nodeAt(parent, 'value') === top &&
    analysis.parentOf.get(parent)?.type === 'ObjectPattern'
  )
}

/**
 * Whether `member` is the callee of a call.
 */
function isCallee(analysis: ScopeAnalysis, member: AstNode): boolean {
  const top = unwrapped(analysis, member)
  const parent = analysis.parentOf.get(top)
  return parent?.type === 'CallExpression' && nodeAt(parent, 'callee') === top
}

/**
 * The role of the member `member` of the value: a harmless `read`, the value's own `call`, or
 * `unknown`, which the build cannot follow.
 */
export function memberRoleOf(analysis: ScopeAnalysis, member: AstNode): MemberRole {
  if (member.computed === true || isMemberWrite(analysis, member)) return 'unknown'
  const name = propertyNameOf(nodeAt(member, 'property'), false)
  if (name !== undefined && READ_MEMBERS.has(name)) return 'read'
  if (name === undefined || !CALL_MEMBERS.has(name)) return 'unknown'
  return isCallee(analysis, member) ? 'call' : 'read'
}
