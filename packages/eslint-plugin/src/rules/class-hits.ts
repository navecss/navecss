/**
 * What the class-channel grammar (`class-channel-walk.ts`) yields for each construct it reads,
 * and how each is built: a literal piece read as class text, an argument of Nave's `cx()` that
 * must be one atom name, and an `&&` placed directly in a class position.
 */
import type { TSESTree } from '@typescript-eslint/types'

import type { LiteralPiece } from '../literal-pieces.ts'

type AnyNode = TSESTree.Node

/**
A literal piece read as class text, admitted only by the consumer's declarations.
 */
export interface ClassPieceHit extends LiteralPiece {
  kind: 'class'
}

/**
 * One argument of Nave's `cx()`, which must be an atom name as a whole. `rendered` is the
 * argument as the message quotes it; `isWhole` is false for static text beside a `${}` slot,
 * which can never be exactly one atom name; `isContainer` is true for an array or object literal,
 * which `cx()` turns into one string rather than reading as atom names.
 */
export interface AtomPieceHit extends LiteralPiece {
  callee: AnyNode
  isContainer: boolean
  isWhole: boolean
  kind: 'atom'
  rendered: string
}

/**
An `&&` directly in a class position: the whole value, or a template slot.
 */
interface SlotAndHit {
  isWhole: boolean
  kind: 'slot-and'
  node: TSESTree.LogicalExpression
}

export type ClassHit = AtomPieceHit | ClassPieceHit | SlotAndHit

/**
Literal pieces read as class text.
 */
export const classHits = (pieces: LiteralPiece[]): ClassHit[] =>
  pieces.map((piece) => ({ ...piece, kind: 'class' }))

/**
A string literal or expression-free template as one whole `cx()` argument.
 */
export function wholeAtomPiece(
  node: AnyNode,
  text: string,
  rendered: string,
  callee: AnyNode,
): AtomPieceHit {
  return {
    kind: 'atom',
    node,
    text,
    rendered,
    callee,
    isContainer: false,
    isWhole: true,
    truncated: false,
  }
}

/**
A template with static text beside a slot as a `cx()` argument: never exactly one atom name.
 */
export function partAtomPiece(node: AnyNode, rendered: string, callee: AnyNode): AtomPieceHit {
  return {
    kind: 'atom',
    node,
    text: rendered,
    rendered,
    callee,
    isContainer: false,
    isWhole: false,
    truncated: false,
  }
}

/**
An array or object literal as a `cx()` argument, quoted as written.
 */
export function containerAtomPiece(
  node: TSESTree.ArrayExpression | TSESTree.ObjectExpression,
  rendered: string,
  callee: AnyNode,
): AtomPieceHit {
  return {
    kind: 'atom',
    node,
    text: rendered,
    rendered,
    callee,
    isContainer: true,
    isWhole: false,
    truncated: false,
  }
}
