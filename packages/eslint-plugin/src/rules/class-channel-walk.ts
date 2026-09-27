/**
 * The walk-and-report half of rule 1 (R5, R5a, R6, R7): given the whole `className`/`class`
 * value (or a template slot within it), finds every literal piece and every nested `cx()`/
 * `cx.raw()`/helper call, and reports what R6/the atom map does not admit. Split from
 * `class-channel.ts`, which owns only the rule's registration and JSX-attribute selection.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { JSSyntaxElement, Rule, Scope } from 'eslint'

import { atomNameForClass, isAtomName } from '../atoms.ts'
import { type CxBindings, resolveCxCallee } from '../cx-binding.ts'
import { collectLiteralPieces, type LiteralPiece, resolveConstHop } from '../literal-pieces.ts'
import {
  cxAtomMessage,
  isNaveOutputLike,
  literalClassMessage,
  naveOutputMessage,
  renderDeclared,
} from '../messages.ts'
import { type CompiledAllowEntry, isDeclared, type NaveSettings } from '../settings.ts'

type Mode = 'class' | 'atom'
type AnyNode = TSESTree.Node

const TS_WRAPPER_TYPES = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression'])

/**
 *
 */
function isHelperCall(
  callee: AnyNode,
  helpers: string[],
  bindings: CxBindings,
): callee is TSESTree.Identifier {
  if (callee.type !== 'Identifier') return false
  if (helpers.includes(callee.name)) return true
  return callee.name === 'cx' && !bindings.cxNames.has(callee.name)
}

export interface CheckState {
  context: Rule.RuleContext
  bindings: CxBindings
  settings: NaveSettings
  allowEntries: CompiledAllowEntry[]
}

/**
Reports `message` at `node`, casting through ESLint's own node type.
 */
function report(state: CheckState, node: AnyNode, message: string): void {
  state.context.report({ node: node as unknown as JSSyntaxElement, message })
}

/**
Reports one literal piece, in `mode`'s admission rules (R6's declarations, or the atom map).
 */
function reportPiece(state: CheckState, piece: LiteralPiece, mode: Mode): void {
  const { node, text, truncated } = piece

  if (mode === 'atom') {
    if (!isAtomName(text))
      report(state, node, cxAtomMessage(text, renderDeclared(state.allowEntries)))
    return
  }

  if (isNaveOutputLike(text)) {
    report(state, node, naveOutputMessage(text, atomNameForClass(text)))
    return
  }

  if (!isDeclared(text, state.allowEntries, truncated)) {
    report(state, node, literalClassMessage(text, renderDeclared(state.allowEntries)))
  }
}

/**
Reports every piece in `pieces`.
 */
function reportPieces(state: CheckState, pieces: LiteralPiece[], mode: Mode): void {
  for (const piece of pieces) reportPiece(state, piece, mode)
}

/**
R5a: a bare `&&` directly as the whole value or a template slot.
 */
function reportSlotAnd(
  state: CheckState,
  node: TSESTree.LogicalExpression,
  isWhole: boolean,
): void {
  const rendered = state.context.sourceCode.getText(node as never)
  const message = isWhole
    ? `A falsy condition becomes the whole className: false/null/undefined drop the attribute and 0 renders as the class "0". Use cx.raw(${rendered}) or a ternary ending ": undefined".`
    : `A falsy condition's own value is interpolated into the class list here (false/undefined/null/0). Use cx.raw(${rendered}) or a ternary ending ": ''".`
  report(state, node, message)
}

/**
Checks each of a Nave `cx()` call's arguments against the atom map, not R6's declarations.
 */
function checkCxCallArguments(
  state: CheckState,
  args: TSESTree.CallExpressionArgument[],
  scope: Scope.Scope,
): void {
  for (const argument of args) {
    if (argument.type !== 'SpreadElement')
      reportPieces(state, collectLiteralPieces(argument, scope), 'atom')
  }
}

/**
Checks each of a helper call's arguments under the widened (array/object-key) grammar.
 */
function checkHelperCallArguments(
  state: CheckState,
  args: TSESTree.CallExpressionArgument[],
  scope: Scope.Scope,
): void {
  for (const argument of args) {
    if (argument.type !== 'SpreadElement') walkHelperArgument(state, argument, scope)
  }
}

/**
 * Dispatches a call encountered in a class-bearing position: a Nave `cx()`, `cx.raw()` (rule
 * 2's territory, passed here), a helper, or an opaque call (passed).
 */
function dispatchCall(state: CheckState, node: TSESTree.CallExpression, scope: Scope.Scope): void {
  const resolved = resolveCxCallee(node.callee, state.bindings, scope)
  if (resolved === 'cx') {
    checkCxCallArguments(state, node.arguments, scope)
  } else if (
    resolved !== 'raw' &&
    isHelperCall(node.callee, state.settings.helpers, state.bindings)
  ) {
    checkHelperCallArguments(state, node.arguments, scope)
  }
}

/**
The key of a helper's object-map argument (`{ 'is-open': open }`) is itself a literal class.
 */
function checkObjectMapKey(state: CheckState, property: TSESTree.ObjectLiteralElement): void {
  if (property.type !== 'Property' || property.computed) return
  if (property.key.type === 'Identifier') {
    reportPiece(state, { node: property.key, text: property.key.name, truncated: false }, 'class')
  } else if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    reportPiece(state, { node: property.key, text: property.key.value, truncated: false }, 'class')
  }
}

/**
Walks a helper-call argument: the class-channel grammar, widened with arrays and object keys.
 */
function walkHelperArgument(state: CheckState, node: AnyNode, scope: Scope.Scope): void {
  if (node.type === 'ArrayExpression') {
    for (const element of node.elements) {
      if (element && element.type !== 'SpreadElement') walkHelperArgument(state, element, scope)
    }
    return
  }

  if (node.type === 'ObjectExpression') {
    for (const property of node.properties) checkObjectMapKey(state, property)
    return
  }

  walkPosition(state, node, scope, 'class')
}

/**
Walks any class-bearing expression position: literal pieces, member/identifier pass-throughs, and nested calls.
 */
function walkPosition(state: CheckState, node: AnyNode, scope: Scope.Scope, mode: Mode): void {
  if (node.type === 'CallExpression') {
    dispatchCall(state, node, scope)
    return
  }

  reportPieces(state, collectLiteralPieces(node, scope), mode)

  // collectLiteralPieces stops at a nested call (it contributes no piece to the OUTER text), so
  // separately find any such call and dispatch it — without re-extracting the pieces above.
  for (const call of findNestedCalls(node, scope)) {
    dispatchCall(state, call, scope)
  }
}

/**
 * Finds every `CallExpression` reachable through the same composition grammar
 * {@link collectLiteralPieces} reads (conditionals, `&&`'s right side, `||`/`??`, string `+`, one
 * const hop, TS wrappers), without extracting any literal text — that half is already done by
 * {@link collectLiteralPieces} itself. Unwraps the single-child productions in a loop, the same
 * shape {@link collectLiteralPieces} uses, so only the genuinely branching productions recurse.
 *
 * One dispatch per grammar production, mirroring {@link collectLiteralPieces}'s own shape.
 */
// eslint-disable-next-line complexity
function findNestedCalls(
  node: AnyNode,
  scope: Scope.Scope,
  canHopIdentifier = true,
): TSESTree.CallExpression[] {
  let current = node
  let canHop = canHopIdentifier

  while (true) {
    if (current.type === 'CallExpression') return [current]

    if (current.type === 'ConditionalExpression') {
      return [
        ...findNestedCalls(current.consequent, scope, canHop),
        ...findNestedCalls(current.alternate, scope, canHop),
      ]
    }

    if (current.type === 'LogicalExpression') {
      if (current.operator === '&&') {
        current = current.right
        continue
      }
      return [
        ...findNestedCalls(current.left, scope, canHop),
        ...findNestedCalls(current.right, scope, canHop),
      ]
    }

    if (current.type === 'BinaryExpression' && current.operator === '+') {
      return [
        ...findNestedCalls(current.left, scope, canHop),
        ...findNestedCalls(current.right, scope, canHop),
      ]
    }

    if (TS_WRAPPER_TYPES.has(current.type)) {
      current = (current as TSESTree.TSAsExpression).expression
      continue
    }

    if (canHop) {
      const hop = resolveConstHop(current, scope)
      if (hop) {
        current = hop
        canHop = false
        continue
      }
    }

    return []
  }
}

/**
The whole attribute value, or a template slot's expression: R5a fires here, ahead of the walk.
 */
export function walkTopLevelPosition(
  state: CheckState,
  node: AnyNode,
  scope: Scope.Scope,
  isWhole: boolean,
): void {
  if (node.type === 'LogicalExpression' && node.operator === '&&') {
    reportSlotAnd(state, node, isWhole)
    return
  }

  if (node.type === 'TemplateLiteral') {
    reportPieces(state, collectLiteralPieces(node, scope), 'class')
    for (const slot of node.expressions) {
      walkTopLevelPosition(state, slot, scope, false)
    }
    return
  }

  walkPosition(state, node, scope, 'class')
}
