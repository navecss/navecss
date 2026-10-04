/**
 * The string an expression ends in, as far as a `nave-` prefix is concerned: a `+` chain of
 * string literals read from its right edge, joined across adjacent literals, in one pass over a
 * chain of any length. Used to find a Nave class built from pieces.
 */
import type { AstNode } from './vite-ast.ts'

import { nodeAt, nodesAt, staticStringOf } from './vite-ast.ts'

/**
 * Whether `char` can occur in a CSS identifier.
 */
export function isIdentChar(char: string | undefined): boolean {
  if (char === undefined) return false
  return /[\w-]/.test(char) || char.codePointAt(0)! >= 0x80
}

/**
 * The string at the end of an expression, as far as a `nave-` prefix is concerned: only the
 * identifier the text ends in matters, and only its first five characters.
 */
export interface Piece {
  /**
   * Where a problem is reported: the first literal of the run of adjacent literals the piece ends.
   */
  readonly node: AstNode
  /**
   * The first five characters of the identifier the text ends in (`nave-` is exactly five).
   */
  readonly head: string
  /**
   * Whether that identifier starts at the very beginning of the text, so text joined before it
   * continues the identifier.
   */
  readonly isOpen: boolean
}

/**
 * What an expression's right edge and its pieces were already found to be, so a long chain of
 * concatenations is read once however many operators it holds.
 */
export interface PieceMemo {
  readonly edges: Map<AstNode, Piece | undefined>
  readonly rightmost: Map<AstNode, Piece | undefined>
}

/**
 * The piece a string of `text` ends in.
 */
function pieceOfText(node: AstNode, text: string): Piece {
  let start = text.length
  while (start > 0 && isIdentChar(text[start - 1])) start -= 1
  return { node, head: text.slice(start, start + 5), isOpen: start === 0 }
}

/**
 * The piece a string literal, or the last piece of a template literal, is; `undefined` for any
 * other node.
 */
function leafPiece(node: AstNode): Piece | undefined {
  const whole = staticStringOf(node)
  if (whole !== undefined) return pieceOfText(node, whole)
  if (node.type !== 'TemplateLiteral') return undefined
  const cooked = (nodesAt(node, 'quasis').at(-1)?.value as { cooked?: string } | undefined)?.cooked
  return cooked === undefined ? undefined : pieceOfText(node, cooked)
}

/**
 * Whether `node` is a binary `+`.
 */
export function isPlus(node: AstNode | undefined): node is AstNode {
  return node?.type === 'BinaryExpression' && node.operator === '+'
}

/**
 * The string at the right edge of `start`, when it ends in one: what is concatenated next.
 */
function edgePiece(start: AstNode | undefined, memo: PieceMemo): Piece | undefined {
  const path: AstNode[] = []
  let node = start
  while (isPlus(node) && !memo.edges.has(node)) {
    path.push(node)
    node = nodeAt(node, 'right')
  }
  let found: Piece | undefined
  if (node !== undefined) found = memo.edges.has(node) ? memo.edges.get(node) : leafPiece(node)
  for (const visited of path) memo.edges.set(visited, found)
  return found
}

/**
 * The piece `last` makes with the `before` it directly follows: the identifier they end in runs
 * back through `before` when `last` is nothing but identifier characters.
 */
function joinPieces(before: Piece, last: Piece): Piece {
  if (!last.isOpen) return { node: before.node, head: last.head, isOpen: false }
  return {
    node: before.node,
    head: (before.head + last.head).slice(0, 5),
    isOpen: before.isOpen,
  }
}

/**
 * The piece the `+` `link` ends in, given the piece its left operand ends in (`before`) and the
 * one at its right edge (`last`): the two joined when `last` is the right operand itself.
 */
function pieceOfPlus(
  link: AstNode,
  before: Piece | undefined,
  last: Piece | undefined,
): Piece | undefined {
  if (last === undefined) return undefined
  const isAdjacent = before !== undefined && nodeAt(link, 'right') === last.node
  return isAdjacent ? joinPieces(before, last) : last
}

/**
 * The string `start` ends in, joined with the adjacent string literals before it in a `+` chain,
 * so a prefix split across literals (`'na' + 've-'`) reads as one. The piece's node is the first
 * literal of the run, where the problem is reported. A left-leaning chain is followed along its
 * spine, innermost first, never by recursion.
 */
export function rightmostPiece(start: AstNode | undefined, memo: PieceMemo): Piece | undefined {
  const spine: AstNode[] = []
  let node = start
  while (isPlus(node) && !memo.rightmost.has(node)) {
    spine.push(node)
    node = nodeAt(node, 'left')
  }
  let before: Piece | undefined
  if (node !== undefined) {
    before = memo.rightmost.has(node) ? memo.rightmost.get(node) : edgePiece(node, memo)
  }
  for (const link of spine.toReversed()) {
    before = pieceOfPlus(link, before, edgePiece(link, memo))
    memo.rightmost.set(link, before)
  }
  return before
}
