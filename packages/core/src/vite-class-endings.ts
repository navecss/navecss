/**
 * Whether the class a piece of text begins is whole in what the build reads. What follows a
 * piece that ends in `nave-` is read as one sequence, left to right: the operands of a `+` chain
 * (nested chains flattened, however the parentheses fall), or the substitutions and pieces of a
 * template. A string that begins with a character that cannot continue a CSS identifier ends the
 * class; an empty one ends it only if what comes after it does; anything else, or what does not
 * resolve, may continue it.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { nodeAt } from './vite-ast.ts'
import { isIdentChar } from './vite-class-pieces.ts'
import { stringValues } from './vite-string-values.ts'

/**
 * What comes after a `+` in a chain: the operands to its right that the chain goes on with.
 */
export type After = { readonly next: After; readonly node: AstNode } | undefined

/**
 * Whether a string value leaves the class on its left whole: it begins with a character that
 * cannot continue a CSS identifier (a backslash can, as an escape).
 */
function isEndingValue(value: string): boolean {
  return !(isIdentChar(value[0]) || value.startsWith('\\'))
}

/**
 * The two operands `element` joins, when it is a `+` (parentheses around it or not).
 */
function operandsOf(element: AstNode | string): [AstNode, AstNode] | undefined {
  if (typeof element === 'string') return undefined
  const inner = unwrap(element)
  if (inner.type !== 'BinaryExpression' || inner.operator !== '+') return undefined
  const left = nodeAt(inner, 'left')
  const right = nodeAt(inner, 'right')
  return left && right ? [left, right] : undefined
}

/**
 * The elements of the sequence `first`, then `rest`, with each `+` replaced by the operands it
 * joins, left to right, however the parentheses fall.
 * @yields {AstNode | string} each element in order.
 */
function* sequenceOf(
  first: readonly (AstNode | string)[],
  rest: After,
): Generator<AstNode | string> {
  const pending = first.toReversed()
  let later = rest
  for (;;) {
    let element = pending.pop()
    if (element === undefined && later) {
      element = later.node
      later = later.next
    }
    if (element === undefined) return
    const operands = operandsOf(element)
    if (operands) pending.push(operands[1], operands[0])
    else yield element
  }
}

/**
 * What a sequence of elements decides about the class on its left: `true` or `false` when an
 * element settles it, `undefined` when every element is empty and the answer lies further on.
 */
function verdictOf(
  elements: Iterable<AstNode | string>,
  analysis: ScopeAnalysis,
): boolean | undefined {
  for (const element of elements) {
    const values = typeof element === 'string' ? [element] : stringValues(element, analysis)
    if (!values?.every((value) => value === '' || isEndingValue(value))) return false
    if (!values.includes('')) return true
  }
  return undefined
}

/**
 * What was already found about the ends of a chain's suffixes, by the link that starts each, so a
 * long chain is read once however many of its links ask.
 */
export type EndMemo = Map<NonNullable<After>, boolean>

/**
 * Whether the links from `start` on end the class: the first link that settles it decides, and
 * every link before it that passed through an empty value decides the same. Walked in a loop, and
 * remembered for each link on the way.
 */
function isEndingAfter(start: After, analysis: ScopeAnalysis, memo: EndMemo): boolean {
  const walked: NonNullable<After>[] = []
  let link = start
  let verdict: boolean | undefined
  while (verdict === undefined) {
    if (!link) {
      verdict = true
    } else if (memo.has(link)) {
      verdict = memo.get(link)
    } else {
      walked.push(link)
      verdict = verdictOf(sequenceOf([link.node], undefined), analysis)
      link = link.next
    }
  }
  for (const walkedLink of walked) memo.set(walkedLink, verdict)
  return verdict
}

/**
 * Whether the class on the left is whole in what the build reads, given what follows it, read as
 * one sequence from left to right: `first`, then `rest`. Each element must be a string every
 * value of which begins with a character that cannot continue the identifier, or is empty while
 * what comes after it ends the class too (an empty value ends it only if nothing follows, or the
 * next element does). An element that can be anything else, or that does not resolve, may
 * continue the identifier.
 */
export function isEndingTheClass(
  first: readonly (AstNode | string)[],
  rest: After,
  analysis: ScopeAnalysis,
  memo: EndMemo,
): boolean {
  return verdictOf(sequenceOf(first, undefined), analysis) ?? isEndingAfter(rest, analysis, memo)
}

/**
 * `node` without the parentheses around it.
 */
function unwrap(node: AstNode): AstNode {
  let current = node
  while (current.type === 'ParenthesizedExpression')
    current = nodeAt(current, 'expression') ?? current
  return current
}
