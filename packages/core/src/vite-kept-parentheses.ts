/**
 * The reader takes the tree Vite's parser returns, which keeps no node for a pair of parentheses.
 * A tree that keeps them would read a class built from pieces as whole, so `readModule` refuses it
 * before it reads anything.
 */
import type { AstNode } from './vite-ast.ts'

import { childrenOf } from './vite-ast.ts'

const PARENTHESES_KEPT =
  "readModule reads a syntax tree with no node for a pair of parentheses, as Vite's parser returns it. This tree keeps one (a ParenthesizedExpression): parse with the parentheses dropped, for example oxc-parser with preserveParens: false."

/**
 * Throws a `TypeError` when any node of `program`, whichever key holds it, is a parenthesised
 * expression.
 */
export function refuseKeptParentheses(program: AstNode): void {
  const stack = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'ParenthesizedExpression') throw new TypeError(PARENTHESES_KEPT)
    stack.push(...childrenOf(node))
  }
}
