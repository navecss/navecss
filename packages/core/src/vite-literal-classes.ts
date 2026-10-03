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
import {
  isIdentChar,
  isPlus,
  type Piece,
  type PieceMemo,
  rightmostPiece,
} from './vite-class-pieces.ts'
import { stringValues } from './vite-string-values.ts'

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
 * Whether what `operand` can be only ends an identifier: every value is a string that is empty or
 * starts with a character that cannot continue a CSS identifier (a backslash can, as an escape).
 * The class on its left is then whole in what the build reads. An operand that can be anything
 * else, or that does not resolve, may continue the identifier.
 */
function isEndingTheClass(operand: AstNode | undefined, analysis: ScopeAnalysis): boolean {
  const values = stringValues(operand, analysis)
  if (!values) return false
  return values.every((value) => value === '' || !(isIdentChar(value[0]) || value.startsWith('\\')))
}

/**
 * Whether `node` is a template literal with a piece that ends in `nave-` followed by a
 * substitution that can continue the identifier.
 */
function isBreakingOut(node: AstNode, analysis: ScopeAnalysis): boolean {
  if (node.type !== 'TemplateLiteral') return false
  const quasis = nodesAt(node, 'quasis')
  const substitutions = nodesAt(node, 'expressions')
  return quasis.slice(0, -1).some((quasi, index) => {
    const cooked = (quasi.value as { cooked?: string } | undefined)?.cooked
    return (
      cooked !== undefined &&
      isEndingInNavePrefix(cooked) &&
      !isEndingTheClass(substitutions[index], analysis)
    )
  })
}

/**
 * The piece that ends in `nave-` at the left of a `+`, when `node` is such a concatenation.
 */
function concatenatedPiece(
  node: AstNode,
  memo: PieceMemo,
  analysis: ScopeAnalysis,
): Piece | undefined {
  if (!isPlus(node)) return undefined
  const piece = rightmostPiece(nodeAt(node, 'left'), memo)
  if (piece?.head !== 'nave-') return undefined
  return isEndingTheClass(nodeAt(node, 'right'), analysis) ? undefined : piece
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
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const offset =
      concatenatedPiece(node, memo, analysis)?.node.start ??
      (isBreakingOut(node, analysis) ? node.start : -1)
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
