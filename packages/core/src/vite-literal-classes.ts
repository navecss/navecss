/**
 * Raw `nave-*` classes in a module: the ones written whole, which the build emits, and the ones
 * built from pieces, which it refuses (`'nave-' + tone` ships unstyled, and is the shortest path
 * past `cx()`'s own checks).
 */
import type { AstNode } from './vite-ast.ts'
import type { Problem } from './vite-problems.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { atomClassMap } from './atoms.ts'
import { childrenOf, nodeAt, nodesAt } from './vite-ast.ts'
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
    stack.push(...childrenWithAfter(node, after))
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
