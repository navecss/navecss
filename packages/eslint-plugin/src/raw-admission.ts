/**
 * What rule 1 reports, asked as a question: shared by rule 1 itself, by rule 2 (whether a
 * `cx.raw()` call needs a reason) and by the counting rule (whether it counts), so all three
 * agree on what is an escape.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { Scope } from 'eslint'

import { isAtomName } from './atoms.ts'
import { isNaveOutputLike } from './messages.ts'
import {
  type AtomPieceFinding,
  type ClassPieceFinding,
  collectArgumentFindings,
  type WalkContext,
} from './rules/class-channel-walk.ts'
import { type CompiledAllowEntry, isDeclared } from './settings.ts'

/**
 * True when rule 1 reports `piece`: a `nave-` literal always (Nave's classes are output, not
 * input); a `cx()` argument unless it is one atom name, whole; any other piece unless declared.
 */
export function isReportedPiece(
  piece: AtomPieceFinding | ClassPieceFinding,
  allowEntries: CompiledAllowEntry[],
): boolean {
  if (isNaveOutputLike(piece.text)) return true
  if (piece.kind === 'atom') return !(piece.isWhole && isAtomName(piece.text))
  return !isDeclared(piece.text, allowEntries, piece.truncated)
}

/**
 * The literal pieces rule 1 would report in the arguments of a `cx.raw()` call, read as rule 1
 * reads them anywhere else (a helper or Nave `cx()` call inside is read through its arguments).
 * Empty when the call is composition.
 */
export function reportablePiecesInCall(
  ctx: WalkContext,
  call: TSESTree.CallExpression,
  scope: Scope.Scope,
  allowEntries: CompiledAllowEntry[],
): (AtomPieceFinding | ClassPieceFinding)[] {
  return call.arguments
    .filter((argument) => argument.type !== 'SpreadElement')
    .flatMap((argument) => collectArgumentFindings(ctx, argument, scope))
    .filter(
      (finding): finding is AtomPieceFinding | ClassPieceFinding =>
        finding.kind !== 'slot-and' && isReportedPiece(finding, allowEntries),
    )
}
