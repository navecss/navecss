/**
 * The class-channel grammar: given a class-bearing expression (a whole `className` value, a
 * template slot, a helper argument, or an argument of `cx.raw()`), finds every literal piece an
 * author wrote and every `&&` placed directly in a class position. Rule 1 reports what this
 * finds; rule 2 and the counting rule ask whether it finds anything rule 1 would report, so the
 * three rules can never disagree about the same source.
 *
 * The grammar: a whole `className` value that is an inline function, read through the values it
 * returns (an expression body, or each `return` of a block body, nested functions excluded); a
 * string literal; a template literal's static text, and each `${}` slot read as a class position
 * of its own; both branches of a conditional; the right side of `&&` and both sides of `||`/`??`;
 * a string `+` chain, read like a template literal (its string literals the static text, every
 * other operand a slot); an identifier bound by a `const`, followed exactly one hop;
 * single-child wrappers (TypeScript's `as`, `satisfies`, `!`, an optional chain); and calls.
 *
 * A call to Nave's `cx()` has each argument read as one atom name, whole, and an array or object
 * literal there is reported whatever it holds. A call to Nave's `cx.dynamic()` is read the same
 * way, except that a name built at run time contributes nothing: a template literal with a slot
 * (unless it is a single slot and nothing else) and a string `+` chain with an operand that is
 * not a string literal, because `cx.dynamic()` exists for a name the build cannot read. Inside
 * the arguments of a `cx.raw()`, a `cx.dynamic()` call contributes nothing at all: it is
 * composition there, and the counting rule counts it once at the call. A call to a helper, or to
 * a `cx` that is not Nave's, has each argument read as class text, arrays and object keys
 * included; `cx.raw()` and any other call contribute nothing.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope, SourceCode } from 'eslint'

import type { CxBindings } from '../cx-binding.ts'

import { isHelperCall, resolveCxCallee } from '../cx-callee.ts'
import { inlineFunction, returnedValues } from '../function-returns.ts'
import {
  collectConcatPieces,
  collectTemplatePieces,
  concatOperands,
  isBuiltName,
  isStringLiteral,
  resolveConstHop,
  splitWhitespace,
  TRANSPARENT_WRAPPER_TYPES,
} from '../literal-pieces.ts'
import {
  type AtomCallee,
  type ClassHit,
  classHits,
  containerAtomPiece,
  objectKeyHit,
  partAtomPiece,
  wholeAtomPiece,
} from './class-hits.ts'

type AnyNode = TSESTree.Node

export interface WalkContext {
  bindings: CxBindings
  helpers: string[]
  /**
   * True while reading the arguments of a `cx.raw()` call, where `cx.dynamic()` is composition.
   */
  insideRaw?: true
  sourceCode: SourceCode
}

/**
 * A template passed to `cx()`: expression-free it is one name; with slots and no static text it
 * is a pass-through of what the slots hold; with static text beside a slot it is one runtime
 * string that is never exactly an atom name as written.
 */
function atomTemplateHits(
  ctx: WalkContext,
  node: TSESTree.TemplateLiteral,
  scope: Scope.Scope,
  callee: AtomCallee,
): ClassHit[] {
  const rendered = ctx.sourceCode.getText(node as never)
  if (node.expressions.length === 0) {
    const text = node.quasis[0]!.value.cooked ?? node.quasis[0]!.value.raw
    return [wholeAtomPiece(node, text, rendered, callee)]
  }
  const hasStaticText = node.quasis.some((quasi) => quasi.value.raw.length > 0)
  if (!hasStaticText) {
    return node.expressions.flatMap((slot) => positionHits(ctx, slot, scope, callee))
  }
  return [partAtomPiece(node, rendered, callee)]
}

/**
A string literal in a class position: its pieces, or (inside `cx()`) one whole name.
 */
function stringHits(
  ctx: WalkContext,
  node: TSESTree.StringLiteral,
  callee: AtomCallee | undefined,
): ClassHit[] {
  if (callee) {
    return [wholeAtomPiece(node, node.value, ctx.sourceCode.getText(node), callee)]
  }
  return classHits(splitWhitespace(node.value, node, false, false))
}

/**
A template literal in a class position: its static pieces, then each slot as a class position.
 */
function templateHits(
  ctx: WalkContext,
  node: TSESTree.TemplateLiteral,
  scope: Scope.Scope,
  callee: AtomCallee | undefined,
): ClassHit[] {
  if (callee) return atomTemplateHits(ctx, node, scope, callee)
  return [
    ...classHits(collectTemplatePieces(node)),
    ...node.expressions.flatMap((slot) => slotHits(ctx, slot, scope)),
  ]
}

/**
 * A string `+` chain in a class position, read like a template literal: its string literals are
 * the static text, and every other operand is a slot, read as a class position of its own.
 */
function concatHits(ctx: WalkContext, node: AnyNode, scope: Scope.Scope): ClassHit[] {
  const operands = concatOperands(node)
  return [
    ...classHits(collectConcatPieces(operands)),
    ...operands
      .filter((operand) => !isStringLiteral(operand))
      .flatMap((slot) => slotHits(ctx, slot, scope)),
  ]
}

/**
 * A string `+` chain passed to `cx()`: string literals alone join into one name; with no string
 * literal it passes through what its operands hold; with a string literal beside any other
 * operand it is one runtime string that is never exactly an atom name as written.
 */
function atomConcatHits(
  ctx: WalkContext,
  node: AnyNode,
  scope: Scope.Scope,
  callee: AtomCallee,
): ClassHit[] {
  const operands = concatOperands(node)
  const rendered = ctx.sourceCode.getText(node as never)
  const literals = operands.filter((operand) => isStringLiteral(operand))
  if (literals.length === operands.length) {
    const text = literals.map((literal) => literal.value).join('')
    return [wholeAtomPiece(node, text, rendered, callee)]
  }
  if (literals.length === 0) {
    return operands.flatMap((operand) => positionHits(ctx, operand, scope, callee))
  }
  return [partAtomPiece(node, rendered, callee)]
}

/**
A helper-call argument: the class-position grammar, widened with arrays and object keys.
 */
function helperArgumentHits(ctx: WalkContext, node: AnyNode, scope: Scope.Scope): ClassHit[] {
  if (node.type === 'ArrayExpression') {
    return node.elements.flatMap((element) =>
      element && element.type !== 'SpreadElement' ? helperArgumentHits(ctx, element, scope) : [],
    )
  }
  if (node.type === 'ObjectExpression') {
    return node.properties.flatMap((property) => objectKeyHit(property))
  }
  return positionHits(ctx, node, scope, undefined)
}

/**
 * A call in a class position: Nave's `cx()` or `cx.dynamic()` (each argument one atom name),
 * `cx.raw()` (rule 2's territory, nothing here), a helper (each argument class text), or any
 * other call (opaque).
 */
function callHits(ctx: WalkContext, node: TSESTree.CallExpression, scope: Scope.Scope): ClassHit[] {
  const args = node.arguments.filter((argument) => argument.type !== 'SpreadElement')
  const resolved = resolveCxCallee(node.callee, ctx.bindings, scope)
  if (resolved === 'cx' || (resolved === 'dynamic' && !ctx.insideRaw)) {
    const callee = { node: node.callee, isDynamic: resolved === 'dynamic' }
    return args.flatMap((argument) => positionHits(ctx, argument, scope, callee))
  }
  if (resolved === 'raw' || resolved === 'dynamic' || !isHelperCall(node.callee, ctx.helpers)) {
    return []
  }
  return args.flatMap((argument) => helperArgumentHits(ctx, argument, scope))
}

/**
 * Every hit reachable from `node` through the grammar in this file's docblock. `callee` is
 * set while reading an argument of Nave's `cx()` or `cx.dynamic()` (so a literal there is one atom name) and unset
 * in a plain class position. Unwraps the single-child productions in a loop, so only the
 * genuinely branching productions recurse.
 *
 * One dispatch per grammar production; splitting it across files would scatter one grammar the
 * three calling rules must agree on.
 */
// eslint-disable-next-line complexity
function positionHits(
  ctx: WalkContext,
  node: AnyNode,
  scope: Scope.Scope,
  callee: AtomCallee | undefined,
): ClassHit[] {
  let current = node
  let currentScope = scope
  let canHop = true

  while (true) {
    if (callee?.isDynamic && isBuiltName(current)) return []
    if (isStringLiteral(current)) return stringHits(ctx, current, callee)
    if (current.type === 'TemplateLiteral') {
      return templateHits(ctx, current, currentScope, callee)
    }
    if (current.type === 'CallExpression') return callHits(ctx, current, currentScope)
    if (callee && (current.type === 'ArrayExpression' || current.type === 'ObjectExpression')) {
      return [containerAtomPiece(current, ctx.sourceCode.getText(current as never), callee)]
    }

    if (current.type === 'ConditionalExpression') {
      return [
        ...positionHits(ctx, current.consequent, currentScope, callee),
        ...positionHits(ctx, current.alternate, currentScope, callee),
      ]
    }

    if (current.type === 'LogicalExpression' && current.operator === '&&') {
      current = current.right
      continue
    }

    if (current.type === 'BinaryExpression' && current.operator === '+') {
      return callee
        ? atomConcatHits(ctx, current, currentScope, callee)
        : concatHits(ctx, current, currentScope)
    }

    if (current.type === 'LogicalExpression') {
      // '||' and '??': both sides are candidates for the value used.
      return [
        ...positionHits(ctx, current.left, currentScope, callee),
        ...positionHits(ctx, current.right, currentScope, callee),
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
A template slot (or the whole value): an `&&` directly here is its own hit.
 */
function slotHits(ctx: WalkContext, node: AnyNode, scope: Scope.Scope): ClassHit[] {
  if (node.type === 'LogicalExpression' && node.operator === '&&') {
    return [{ kind: 'slot-and', node, isWhole: false }]
  }
  return positionHits(ctx, node, scope, undefined)
}

/**
 * Every hit in a whole `className`/`class` attribute value. A value that is an inline function
 * (`(state) => ...`) is read through the values it returns, each as a class position of its own.
 */
export function collectValueHits(ctx: WalkContext, node: AnyNode, scope: Scope.Scope): ClassHit[] {
  const fn = inlineFunction(node)
  if (fn) {
    return returnedValues(fn, ctx.sourceCode.visitorKeys).flatMap((value) =>
      positionHits(ctx, value, ctx.sourceCode.getScope(value as never), undefined),
    )
  }
  if (node.type === 'LogicalExpression' && node.operator === '&&') {
    return [{ kind: 'slot-and', node, isWhole: true }]
  }
  return positionHits(ctx, node, scope, undefined)
}

/**
 * Every hit in one argument of a `cx.raw()` call, read exactly as rule 1 reads a class
 * position (an `&&` here is an argument, not a slot, so it is composition), except that a
 * `cx.dynamic()` call inside is composition too.
 */
export function collectArgumentHits(
  ctx: WalkContext,
  node: AnyNode,
  scope: Scope.Scope,
): ClassHit[] {
  return positionHits({ ...ctx, insideRaw: true }, node, scope, undefined)
}
