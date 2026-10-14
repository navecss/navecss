/**
 * The text of a call's arguments as a report quotes it: with every type assertion in them left
 * out, as the module reads once its types are stripped.
 */
import type { AstNode } from './vite-ast.ts'

import { assertedBy, childrenOf } from './vite-ast.ts'

/**
 * The part of an assertion that a types-stripped copy leaves out: `<T>x` is written before what it
 * wraps, `x as T`, `x satisfies T` and `x!` after it.
 */
function droppedPartOf(node: AstNode, asserted: AstNode): [number, number] {
  return node.type === 'TSTypeAssertion' ? [node.start, asserted.start] : [asserted.end, node.end]
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
    if (asserted) dropped.push(droppedPartOf(node, asserted))
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
