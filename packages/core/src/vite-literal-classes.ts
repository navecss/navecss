/**
 * Raw `nave-*` classes in a module: the ones written whole, which the build emits, and the ones
 * built from pieces, which it refuses (`'nave-' + tone` ships unstyled, and is the shortest path
 * past `cx()`'s own checks).
 */
import type { AstNode } from './vite-ast.ts'
import type { Problem } from './vite-problems.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { atomClassMap } from './atoms.ts'
import { childrenOf, nodeAt, nodesAt, pushAll } from './vite-ast.ts'
import { type After, type EndMemo, isEndingTheClass } from './vite-class-endings.ts'
import {
  isIdentChar,
  isPlus,
  type Piece,
  type PieceMemo,
  rightmostPiece,
} from './vite-class-pieces.ts'

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
 * Whether `node` is a template literal with a piece that ends in `nave-` followed by what can
 * continue the identifier: the substitutions and pieces after it, and what follows the template
 * in the `+` chain it belongs to, are read as one sequence.
 */
function isBreakingOut(
  node: AstNode,
  analysis: ScopeAnalysis,
  ending: { readonly after: After; readonly memo: EndMemo },
): boolean {
  if (node.type !== 'TemplateLiteral') return false
  const quasis = nodesAt(node, 'quasis')
  const substitutions = nodesAt(node, 'expressions')
  return quasis.slice(0, -1).some((quasi, index) => {
    const cooked = (quasi.value as { cooked?: string } | undefined)?.cooked
    if (cooked === undefined || !isEndingInNavePrefix(cooked)) return false
    const following = substitutions.slice(index).flatMap((substitution, offset) => {
      const next = quasis[index + 1 + offset]
      const text = (next?.value as { cooked?: string } | undefined)?.cooked
      return [substitution, ...(next ? [text ?? next] : [])]
    })
    return !isEndingTheClass(following, ending.after, analysis, ending.memo)
  })
}

/**
 * The piece that ends in `nave-` at the left of a `+`, when `node` is such a concatenation, and
 * what follows its right operand in the chain is `after`.
 */
function concatenatedPiece(
  node: AstNode,
  memo: PieceMemo,
  analysis: ScopeAnalysis,
  ending: { readonly after: After; readonly memo: EndMemo },
): Piece | undefined {
  if (!isPlus(node)) return undefined
  const piece = rightmostPiece(nodeAt(node, 'left'), memo)
  if (piece?.head !== 'nave-') return undefined
  const right = nodeAt(node, 'right')
  return isEndingTheClass(right ? [right] : [], ending.after, analysis, ending.memo)
    ? undefined
    : piece
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

const PARENTHESES_KEPT =
  "readModule reads a syntax tree with no node for a pair of parentheses, as Vite's parser returns it. This tree keeps one (a ParenthesizedExpression): parse with the parentheses dropped, for example oxc-parser with preserveParens: false."

/**
 * The one pass over the whole tree that `readModule` makes before it reads anything, whichever key
 * holds a node. It refuses a tree that keeps a node for a pair of parentheses, which would read a
 * class built from pieces as whole, with a `TypeError`; and it gathers the atoms whose class a
 * string written with escapes spells once decoded (`'nave-\x66lex'`), which the text scan cannot
 * see because it reads the source as written. One pass does both, so the refusal adds no walk.
 */
export function refuseParenthesesAndFindEscapedAtoms(program: AstNode): Set<string> {
  const found = new Set<string>()
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'ParenthesizedExpression') throw new TypeError(PARENTHESES_KEPT)
    const text = escapedText(node)
    if (text?.raw.includes('\\')) {
      for (const atom of atomsWrittenIn(text.decoded)) found.add(atom)
    }
    pushAll(stack, childrenOf(node))
  }
  return found
}

const SENTENCE =
  'a Nave class built from pieces is invisible to the build, so its atom would not ship.'

/**
 * Every Nave class built from pieces in `program`, one problem per expression.
 */
export function concatenationProblems(
  program: AstNode,
  code: string,
  analysis: ScopeAnalysis,
): Problem[] {
  const problems: Problem[] = []
  const memo: PieceMemo = { edges: new Map(), rightmost: new Map() }
  const ends: EndMemo = new Map()
  const stack: { after: After; node: AstNode }[] = [{ node: program, after: undefined }]
  while (stack.length > 0) {
    const { node, after } = stack.pop()!
    const offset =
      concatenatedPiece(node, memo, analysis, { after, memo: ends })?.node.start ??
      (isBreakingOut(node, analysis, { after, memo: ends }) ? node.start : -1)
    if (offset !== -1) {
      problems.push({
        kind: 'concatenation',
        offset,
        construct: code.slice(node.start, node.end),
        text: SENTENCE,
      })
    }
    pushAll(stack, childrenWithAfter(node, after))
  }
  return problems.toSorted((a, b) => a.offset - b.offset)
}

/**
 * The children of `node`, each with what follows it in the chain of `+` it belongs to: the left
 * operand of a `+` is followed by the right one and what follows the `+`; a parenthesized
 * expression passes on what follows it; every other child starts a sequence of its own.
 */
function childrenWithAfter(node: AstNode, after: After): { after: After; node: AstNode }[] {
  const isOperands = node.type === 'BinaryExpression' && node.operator === '+'
  if (isOperands) {
    const left = nodeAt(node, 'left')
    const right = nodeAt(node, 'right')
    return [
      ...(left ? [{ node: left, after: right ? { node: right, next: after } : after }] : []),
      ...(right ? [{ node: right, after }] : []),
    ]
  }
  const isWrapper = node.type === 'ParenthesizedExpression'
  return childrenOf(node).map((child) => ({ node: child, after: isWrapper ? after : undefined }))
}
