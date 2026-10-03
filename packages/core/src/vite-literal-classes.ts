/**
 * Raw `nave-*` classes in a module: the ones written whole, which the build emits, and the ones
 * built from pieces, which it refuses (`'nave-' + tone` ships unstyled, and is the shortest path
 * past `cx()`'s own checks).
 */
import type { AstNode } from './vite-ast.ts'
import type { Problem } from './vite-problems.ts'

import { atomClassMap } from './atoms.ts'
import { childrenOf, nodeAt, nodesAt, staticStringOf } from './vite-ast.ts'

const ATOM_OF_CLASS: ReadonlyMap<string, string> = new Map(
  Object.entries(atomClassMap).map(([atom, className]) => [className, atom]),
)

/**
 * The built-in atom whose class is `className`, if there is one.
 */
export function atomOfClass(className: string): string | undefined {
  return ATOM_OF_CLASS.get(className)
}

/**
 * Whether `char` can occur in a CSS identifier.
 */
function isIdentChar(char: string | undefined): boolean {
  if (char === undefined) return false
  return /[\w-]/.test(char) || char.codePointAt(0)! >= 0x80
}

/**
 * Whether the text before `index` leaves a `nave-` there at an identifier boundary: nothing
 * before it, a character that cannot occur in an identifier, or an escape such as the `\n` of
 * `'a\nnave-no-wrap'` as a minifier prints it (which can only over-include).
 */
function isBoundary(code: string, index: number): boolean {
  if (index === 0 || !isIdentChar(code[index - 1])) return true
  return code[index - 2] === '\\' && /[bfnrtv0]/.test(code[index - 1]!)
}

/**
 * The identifier that starts at `index`.
 */
function identifierAt(code: string, index: number): string {
  let end = index
  while (isIdentChar(code[end])) end += 1
  return code.slice(index, end)
}

/**
 * The atoms whose class is written whole in `code`, on identifier boundaries: not whitespace, so
 * the `class="nave-hidden">h` a Svelte component compiles to is read.
 */
export function atomsWrittenIn(code: string): Set<string> {
  const found = new Set<string>()
  let index = code.indexOf('nave-')
  while (index !== -1) {
    if (isBoundary(code, index)) {
      const atom = ATOM_OF_CLASS.get(identifierAt(code, index))
      if (atom) found.add(atom)
    }
    index = code.indexOf('nave-', index + 5)
  }
  return found
}

/**
 * Whether `text` ends in a CSS identifier beginning `nave-`: `--nave-` and `data-nave-` do not,
 * since the identifier they end in begins earlier.
 */
function isEndingInNavePrefix(text: string): boolean {
  let start = text.length
  while (start > 0 && isIdentChar(text[start - 1])) start -= 1
  return text.slice(start).startsWith('nave-')
}

/**
 * The string at the end of an expression, as far as a `nave-` prefix is concerned: only the
 * identifier the text ends in matters, and only its first five characters.
 */
interface Piece {
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
interface PieceMemo {
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
function isPlus(node: AstNode | undefined): node is AstNode {
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
function rightmostPiece(start: AstNode | undefined, memo: PieceMemo): Piece | undefined {
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

/**
 * Whether `node` is a template literal piece followed by a substitution that ends in `nave-`.
 */
function isBreakingOut(node: AstNode): boolean {
  if (node.type !== 'TemplateLiteral') return false
  const quasis = nodesAt(node, 'quasis')
  return quasis.slice(0, -1).some((quasi) => {
    const cooked = (quasi.value as { cooked?: string } | undefined)?.cooked
    return cooked !== undefined && isEndingInNavePrefix(cooked)
  })
}

/**
 * The piece that ends in `nave-` at the left of a `+`, when `node` is such a concatenation.
 */
function concatenatedPiece(node: AstNode, memo: PieceMemo): Piece | undefined {
  if (!isPlus(node)) return undefined
  const piece = rightmostPiece(nodeAt(node, 'left'), memo)
  return piece?.head === 'nave-' ? piece : undefined
}

/**
 * The raw and the decoded text of a string literal or a template piece written with an escape, or
 * `undefined` for any other node.
 */
function escapedText(node: AstNode): { decoded: string; raw: string } | undefined {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return { raw: String(node.raw), decoded: node.value }
  }
  if (node.type !== 'TemplateElement') return undefined
  const { raw, cooked } = node.value as { cooked?: string; raw?: string }
  if (!cooked || !raw?.includes('\\')) return undefined
  return { raw, decoded: cooked }
}

/**
 * The atoms whose class a string written with escapes spells once decoded (`'nave-\x66lex'`):
 * the text scan reads the source as written, so it cannot see these.
 */
export function atomsInEscapedStrings(program: AstNode): Set<string> {
  const found = new Set<string>()
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const text = escapedText(node)
    if (text?.raw.includes('\\')) {
      for (const atom of atomsWrittenIn(text.decoded)) found.add(atom)
    }
    stack.push(...childrenOf(node))
  }
  return found
}

const SENTENCE =
  'a Nave class built from pieces is invisible to the build, so its atom would not ship.'

/**
 * Every Nave class built from pieces in `program`, one problem per expression.
 */
export function concatenationProblems(program: AstNode, code: string): Problem[] {
  const problems: Problem[] = []
  const memo: PieceMemo = { edges: new Map(), rightmost: new Map() }
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const offset =
      concatenatedPiece(node, memo)?.node.start ?? (isBreakingOut(node) ? node.start : -1)
    if (offset !== -1) {
      problems.push({
        kind: 'concatenation',
        offset,
        construct: code.slice(node.start, node.end),
        text: SENTENCE,
      })
    }
    stack.push(...childrenOf(node))
  }
  return problems.toSorted((a, b) => a.offset - b.offset)
}
