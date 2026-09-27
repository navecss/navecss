/**
 * The class-channel grammar: given a class-bearing expression (a whole `className` value, a
 * template slot, a helper argument, or an argument of `cx.raw()`), finds every literal piece an
 * author wrote and every `&&` placed directly in a class position. Rule 1 reports what this
 * finds; rule 2 and the counting rule ask whether it finds anything rule 1 would report, so the
 * three rules can never disagree about the same source.
 *
 * The grammar: a string literal; a template literal's static text, and each `${}` slot read as a
 * class position of its own (wherever the template sits); both branches of a conditional; the
 * right side of `&&` and both sides of `||`/`??`; both sides of a string `+`; an identifier bound
 * by a `const`, followed exactly one hop; single-child wrappers (TypeScript's `as`, `satisfies`,
 * `!`, an optional chain); and calls. A call to Nave's `cx()` has each argument read as one atom
 * name, whole (the way `cx()` maps it at run time); a call to a class-composition helper, or to a
 * `cx` that is not Nave's, has each argument read as class text, arrays and object keys included;
 * `cx.raw()` and any other call contribute nothing.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope, SourceCode } from 'eslint'

import { type CxBindings, resolveCxCallee } from '../cx-binding.ts'
import {
  collectTemplatePieces,
  isStringLiteral,
  type LiteralPiece,
  resolveConstHop,
  splitWhitespace,
  TRANSPARENT_WRAPPER_TYPES,
} from '../literal-pieces.ts'

type AnyNode = TSESTree.Node

export interface WalkContext {
  bindings: CxBindings
  helpers: string[]
  sourceCode: SourceCode
}

/**
A literal piece read as class text, admitted only by the consumer's declarations.
 */
export interface ClassPieceFinding extends LiteralPiece {
  kind: 'class'
}

/**
 * One argument of Nave's `cx()`, which must be an atom name as a whole. `rendered` is the
 * argument as the message quotes it; `isWhole` is false for static text beside a `${}` slot,
 * which can never be exactly one atom name.
 */
export interface AtomPieceFinding extends LiteralPiece {
  callee: AnyNode
  isWhole: boolean
  kind: 'atom'
  rendered: string
}

/**
An `&&` directly in a class position: the whole value, or a template slot.
 */
interface SlotAndFinding {
  isWhole: boolean
  kind: 'slot-and'
  node: TSESTree.LogicalExpression
}

export type ClassFinding = AtomPieceFinding | ClassPieceFinding | SlotAndFinding

/**
 * True for a call to a name in the helper list, or to any `cx` that did not resolve to Nave's
 * (the caller has already ruled that out through scope analysis before asking).
 */
function isHelperCall(callee: AnyNode, helpers: string[]): boolean {
  if (callee.type !== 'Identifier') return false
  return helpers.includes(callee.name) || callee.name === 'cx'
}

/**
A string literal or expression-free template as one whole `cx()` argument.
 */
function wholeAtomPiece(
  node: AnyNode,
  text: string,
  rendered: string,
  callee: AnyNode,
): AtomPieceFinding {
  return { kind: 'atom', node, text, rendered, callee, isWhole: true, truncated: false }
}

/**
 * A template passed to `cx()`: expression-free it is one name; with slots and no static text it
 * is a pass-through of what the slots hold; with static text beside a slot it is one runtime
 * string that is never exactly an atom name as written.
 */
function atomTemplateFindings(
  ctx: WalkContext,
  node: TSESTree.TemplateLiteral,
  scope: Scope.Scope,
  callee: AnyNode,
): ClassFinding[] {
  const rendered = ctx.sourceCode.getText(node as never)
  if (node.expressions.length === 0) {
    const text = node.quasis[0]!.value.cooked ?? node.quasis[0]!.value.raw
    return [wholeAtomPiece(node, text, rendered, callee)]
  }
  const hasStaticText = node.quasis.some((quasi) => quasi.value.raw.length > 0)
  if (!hasStaticText) {
    return node.expressions.flatMap((slot) => positionFindings(ctx, slot, scope, callee))
  }
  return [
    { kind: 'atom', node, text: rendered, rendered, callee, isWhole: false, truncated: false },
  ]
}

/**
A string literal in a class position: its pieces, or (inside `cx()`) one whole name.
 */
function stringFindings(
  ctx: WalkContext,
  node: TSESTree.StringLiteral,
  callee: AnyNode | undefined,
): ClassFinding[] {
  if (callee) {
    return [wholeAtomPiece(node, node.value, JSON.stringify(node.value), callee)]
  }
  return splitWhitespace(node.value, node, false, false).map((piece) => ({
    ...piece,
    kind: 'class',
  }))
}

/**
A template literal in a class position: its static pieces, then each slot as a class position.
 */
function templateFindings(
  ctx: WalkContext,
  node: TSESTree.TemplateLiteral,
  scope: Scope.Scope,
  callee: AnyNode | undefined,
): ClassFinding[] {
  if (callee) return atomTemplateFindings(ctx, node, scope, callee)
  const pieces: ClassFinding[] = collectTemplatePieces(node).map((piece) => ({
    ...piece,
    kind: 'class',
  }))
  return [...pieces, ...node.expressions.flatMap((slot) => slotFindings(ctx, slot, scope))]
}

/**
The key of a helper's object-map argument (`{ 'is-open': open }`) is itself a literal class.
 */
function objectKeyFinding(property: TSESTree.ObjectLiteralElement): ClassFinding[] {
  if (property.type !== 'Property' || property.computed) return []
  if (property.key.type === 'Identifier') {
    return [{ kind: 'class', node: property.key, text: property.key.name, truncated: false }]
  }
  if (isStringLiteral(property.key)) {
    return [{ kind: 'class', node: property.key, text: property.key.value, truncated: false }]
  }
  return []
}

/**
A helper-call argument: the class-position grammar, widened with arrays and object keys.
 */
function helperArgumentFindings(
  ctx: WalkContext,
  node: AnyNode,
  scope: Scope.Scope,
): ClassFinding[] {
  if (node.type === 'ArrayExpression') {
    return node.elements.flatMap((element) =>
      element && element.type !== 'SpreadElement'
        ? helperArgumentFindings(ctx, element, scope)
        : [],
    )
  }
  if (node.type === 'ObjectExpression') {
    return node.properties.flatMap((property) => objectKeyFinding(property))
  }
  return positionFindings(ctx, node, scope, undefined)
}

/**
 * A call in a class position: Nave's `cx()` (each argument one atom name), `cx.raw()` (rule 2's
 * territory, nothing here), a helper (each argument class text), or any other call (opaque).
 */
function callFindings(
  ctx: WalkContext,
  node: TSESTree.CallExpression,
  scope: Scope.Scope,
): ClassFinding[] {
  const args = node.arguments.filter((argument) => argument.type !== 'SpreadElement')
  const resolved = resolveCxCallee(node.callee, ctx.bindings, scope)
  if (resolved === 'cx') {
    return args.flatMap((argument) => positionFindings(ctx, argument, scope, node.callee))
  }
  if (resolved === 'raw' || !isHelperCall(node.callee, ctx.helpers)) return []
  return args.flatMap((argument) => helperArgumentFindings(ctx, argument, scope))
}

/**
 * Every finding reachable from `node` through the grammar in this file's docblock. `callee` is
 * set while reading an argument of Nave's `cx()` (so a literal there is one atom name) and unset
 * in a plain class position. Unwraps the single-child productions in a loop, so only the
 * genuinely branching productions recurse.
 *
 * One dispatch per grammar production; splitting it across files would scatter one grammar the
 * three calling rules must agree on.
 */
// eslint-disable-next-line complexity
function positionFindings(
  ctx: WalkContext,
  node: AnyNode,
  scope: Scope.Scope,
  callee: AnyNode | undefined,
): ClassFinding[] {
  let current = node
  let currentScope = scope
  let canHop = true

  while (true) {
    if (isStringLiteral(current)) return stringFindings(ctx, current, callee)
    if (current.type === 'TemplateLiteral') {
      return templateFindings(ctx, current, currentScope, callee)
    }
    if (current.type === 'CallExpression') return callFindings(ctx, current, currentScope)

    if (current.type === 'ConditionalExpression') {
      return [
        ...positionFindings(ctx, current.consequent, currentScope, callee),
        ...positionFindings(ctx, current.alternate, currentScope, callee),
      ]
    }

    if (current.type === 'LogicalExpression' && current.operator === '&&') {
      current = current.right
      continue
    }

    if (
      current.type === 'LogicalExpression' ||
      (current.type === 'BinaryExpression' && current.operator === '+')
    ) {
      // '||' and '??': both sides are candidates for the value used; '+': both sides are text.
      return [
        ...positionFindings(ctx, current.left, currentScope, callee),
        ...positionFindings(ctx, current.right, currentScope, callee),
      ]
    }

    if (TRANSPARENT_WRAPPER_TYPES.has(current.type)) {
      current = (current as TSESTree.ChainExpression).expression
      continue
    }

    const hop = canHop ? resolveConstHop(current, currentScope) : undefined
    if (!hop) return []
    current = hop.init
    currentScope = hop.scope
    canHop = false
  }
}

/**
A template slot (or the whole value): an `&&` directly here is its own finding.
 */
function slotFindings(ctx: WalkContext, node: AnyNode, scope: Scope.Scope): ClassFinding[] {
  if (node.type === 'LogicalExpression' && node.operator === '&&') {
    return [{ kind: 'slot-and', node, isWhole: false }]
  }
  return positionFindings(ctx, node, scope, undefined)
}

/**
Every finding in a whole `className`/`class` attribute value.
 */
export function collectValueFindings(
  ctx: WalkContext,
  node: AnyNode,
  scope: Scope.Scope,
): ClassFinding[] {
  if (node.type === 'LogicalExpression' && node.operator === '&&') {
    return [{ kind: 'slot-and', node, isWhole: true }]
  }
  return positionFindings(ctx, node, scope, undefined)
}

/**
 * Every finding in one argument of a `cx.raw()` call, read exactly as rule 1 reads a class
 * position (an `&&` here is an argument, not a slot, so it is composition).
 */
export function collectArgumentFindings(
  ctx: WalkContext,
  node: AnyNode,
  scope: Scope.Scope,
): ClassFinding[] {
  return positionFindings(ctx, node, scope, undefined)
}
