/**
 * What the class-channel grammar (`class-channel-walk.ts`) yields for each construct it reads,
 * and how each is built: a literal piece read as class text, an argument of Nave's `cx()` that
 * must be one atom name, and an `&&` placed directly in a class position.
 */
import type { TSESTree } from '@typescript-eslint/types'

import { isStringLiteral, type LiteralPiece } from '../literal-pieces.ts'

type AnyNode = TSESTree.Node

/**
A literal piece read as class text, admitted only by the consumer's declarations.
 */
export interface ClassPieceHit extends LiteralPiece {
  kind: 'class'
}

/**
 * The call an atom argument belongs to: the callee node, and whether it is `cx.dynamic` (which
 * takes one name) rather than `cx` (which maps each argument whole).
 */
export interface AtomCallee {
  isDynamic: boolean
  node: AnyNode
}

/**
 * One argument of Nave's `cx()` or `cx.dynamic()`, which must be an atom name as a whole. `rendered` is the
 * argument as the message quotes it; `isWhole` is false for static text beside a `${}` slot,
 * which can never be exactly one atom name; `isContainer` is true for an array or object literal,
 * which `cx()` turns into one string rather than reading as atom names.
 */
export interface AtomPieceHit extends LiteralPiece {
  callee: AnyNode
  /**
   * True for a literal name of `cx.dynamic()` that sits beside a value chosen at run time.
   */
  isBeside: boolean
  isContainer: boolean
  isDynamic: boolean
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

/**
 * An argument after the first of Nave's `cx.dynamic()`, which takes one name: reported whatever
 * it holds, its contents unread.
 */
export interface DynamicExtraHit {
  callee: AnyNode
  kind: 'dynamic-extra'
  node: AnyNode
  rendered: string
}

/**
 * A name built at run time inside `cx.dynamic()` that no atom name fits the static text of.
 */
export interface DynamicBuiltHit {
  callee: AnyNode
  kind: 'dynamic-built'
  node: AnyNode
  rendered: string
}

/**
 * The first non-spread argument of Nave's `cx.dynamic()` when only spreads come before it:
 * whether it is the name depends on what the spread holds, so it is reported whatever it holds
 * and its contents are not read.
 */
export interface DynamicSpreadHit {
  callee: AnyNode
  kind: 'dynamic-spread'
  node: AnyNode
  rendered: string
}

export type ClassHit =
  AtomPieceHit | ClassPieceHit | DynamicBuiltHit | DynamicExtraHit | DynamicSpreadHit | SlotAndHit

/**
Literal pieces read as class text.
 */
export const classHits = (pieces: LiteralPiece[]): ClassHit[] =>
  pieces.map((piece) => ({ ...piece, kind: 'class' }))

/**
A string literal or expression-free template as one whole `cx()` or `cx.dynamic()` argument.
 */
export function wholeAtomPiece(
  node: AnyNode,
  text: string,
  rendered: string,
  callee: AtomCallee,
): AtomPieceHit {
  return {
    kind: 'atom',
    node,
    text,
    rendered,
    callee: callee.node,
    isDynamic: callee.isDynamic,
    isBeside: false,
    isContainer: false,
    isWhole: true,
    truncated: false,
  }
}

/**
A template with static text beside a slot as a `cx()` argument: never exactly one atom name.
 */
export function partAtomPiece(node: AnyNode, rendered: string, callee: AtomCallee): AtomPieceHit {
  return {
    kind: 'atom',
    node,
    text: rendered,
    rendered,
    callee: callee.node,
    isDynamic: callee.isDynamic,
    isBeside: false,
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
  callee: AtomCallee,
): AtomPieceHit {
  return {
    kind: 'atom',
    node,
    text: rendered,
    rendered,
    callee: callee.node,
    isDynamic: callee.isDynamic,
    isBeside: false,
    isContainer: true,
    isWhole: false,
    truncated: false,
  }
}

/**
The key of a helper's object-map argument (`{ 'is-open': open }`) is itself a literal class.
 */
export function objectKeyHit(property: TSESTree.ObjectLiteralElement): ClassHit[] {
  if (property.type !== 'Property' || property.computed) return []
  if (property.key.type === 'Identifier') {
    return [{ kind: 'class', node: property.key, text: property.key.name, truncated: false }]
  }
  if (isStringLiteral(property.key)) {
    return [{ kind: 'class', node: property.key, text: property.key.value, truncated: false }]
  }
  return []
}
