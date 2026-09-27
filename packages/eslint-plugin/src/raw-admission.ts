/**
 * Shared by rule 2 (the reason requirement) and the counting rule: whether an argument of
 * `cx.raw()` carries literal class text rule 1 would otherwise report — undeclared, or a "Nave
 * outputs this" literal. Both rules must agree on what counts as an escape.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope } from 'eslint'

import { collectLiteralPieces } from './literal-pieces.ts'
import { isNaveOutputLike } from './messages.ts'
import { type CompiledAllowEntry, isDeclared } from './settings.ts'

/**
True when `argument` carries a literal piece rule 1 would report anywhere else.
 */
export function requiresReason(
  argument: TSESTree.Node,
  scope: Scope.Scope,
  allowEntries: CompiledAllowEntry[],
): boolean {
  for (const piece of collectLiteralPieces(argument, scope)) {
    if (isNaveOutputLike(piece.text)) return true
    if (!isDeclared(piece.text, allowEntries, piece.truncated)) return true
  }
  return false
}

/**
True when any of `call`'s arguments requires a reason.
 */
export function requiresReasonForCall(
  call: TSESTree.CallExpression,
  scope: Scope.Scope,
  allowEntries: CompiledAllowEntry[],
): boolean {
  return call.arguments.some(
    (argument) =>
      argument.type !== 'SpreadElement' && requiresReason(argument, scope, allowEntries),
  )
}
