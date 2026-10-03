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

interface Piece {
  readonly node: AstNode
  readonly text: string
}

/**
 * The string at the right edge of `node`, when `node` ends in one: what is concatenated next.
 */
function rightmostPiece(start: AstNode | undefined): Piece | undefined {
  let node = start
  while (node?.type === 'BinaryExpression' && node.operator === '+') node = nodeAt(node, 'right')
  if (!node) return undefined
  const whole = staticStringOf(node)
  if (whole !== undefined) return { node, text: whole }
  if (node.type !== 'TemplateLiteral') return undefined
  const cooked = (nodesAt(node, 'quasis').at(-1)?.value as { cooked?: string } | undefined)?.cooked
  return cooked === undefined ? undefined : { node, text: cooked }
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
function concatenatedPiece(node: AstNode): Piece | undefined {
  if (node.type !== 'BinaryExpression' || node.operator !== '+') return undefined
  const piece = rightmostPiece(nodeAt(node, 'left'))
  return piece && isEndingInNavePrefix(piece.text) ? piece : undefined
}

const SENTENCE =
  'a Nave class built from pieces is invisible to the build, so its atom would not ship.'

/**
 * Every Nave class built from pieces in `program`, one problem per expression.
 */
export function concatenationProblems(program: AstNode, code: string): Problem[] {
  const problems: Problem[] = []
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const offset = concatenatedPiece(node)?.node.start ?? (isBreakingOut(node) ? node.start : -1)
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
