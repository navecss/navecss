/**
 * The text of a call's arguments as a report quotes it: with every type assertion in them left
 * out, as the module reads once its types are stripped.
 */
import type { AstNode } from './vite-ast.ts'

import { assertedBy, childrenOf, nodeAt } from './vite-ast.ts'

/**
 * Where the comment that begins at `at` ends; `undefined` when none begins there.
 */
function endOfComment(code: string, at: number): number | undefined {
  if (code.startsWith('/*', at)) {
    const close = code.indexOf('*/', at + 2)
    return close === -1 ? code.length : close + 2
  }
  if (code.startsWith('//', at)) {
    const newline = code.indexOf('\n', at)
    return newline === -1 ? code.length : newline + 1
  }
  return undefined
}

/**
 * Where the code from `from` on, past any whitespace and comments, next holds something else.
 */
function skipBlanks(code: string, from: number): number {
  let at = from
  for (;;) {
    const commentEnd = endOfComment(code, at)
    if (commentEnd !== undefined) at = commentEnd
    else if (/\s/.test(code.charAt(at))) at += 1
    else return at
  }
}

/**
 * Where the code from `from` on, past any whitespace, comments and closing parentheses, next holds
 * something else, and where the last of those parentheses ends (`from` when there is none). The
 * parentheses around an expression are not part of its node.
 */
function skipClosings(code: string, from: number): { closed: number; next: number } {
  let next = skipBlanks(code, from)
  let closed = from
  while (code[next] === ')') {
    closed = next + 1
    next = skipBlanks(code, closed)
  }
  return { next, closed }
}

/**
 * The part of an assertion that a types-stripped copy leaves out: the operator and its type, but
 * not a parenthesis that belongs to the expression it wraps. `<T>x` is written before what it wraps
 * and ends at the `>` after its type; `x as T`, `x satisfies T` and `x!` are written after it and
 * begin after the last parenthesis that closes the expression.
 */
function droppedPartOf(code: string, node: AstNode, asserted: AstNode): [number, number] {
  if (node.type !== 'TSTypeAssertion') return [skipClosings(code, asserted.end).closed, node.end]
  const type = nodeAt(node, 'typeAnnotation')
  if (!type) return [node.start, asserted.start]
  return [node.start, skipClosings(code, type.end).next + 1]
}

/**
 * The text of `code` from the start of the first of `args` to the end of the last, without the
 * type assertions in them: `variant as T` is `variant`.
 */
export function textWithoutAssertions(code: string, args: readonly AstNode[]): string {
  const dropped: [number, number][] = []
  const stack = [...args]
  while (stack.length > 0) {
    const node = stack.pop()!
    const asserted = assertedBy(node)
    if (asserted) dropped.push(droppedPartOf(code, node, asserted))
    stack.push(...childrenOf(node))
  }
  dropped.sort(([first], [second]) => first - second)
  let text = ''
  let from = args[0]!.start
  for (const [start, end] of dropped) {
    text += code.slice(from, start)
    from = end
  }
  return text + code.slice(from, args.at(-1)!.end)
}
