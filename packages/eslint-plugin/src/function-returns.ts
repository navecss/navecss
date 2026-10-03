/**
 * What an inline function returns, for a `className` that is a function of component state
 * (`className={(state) => ...}`, the form Base UI parts accept). Only the function's own
 * returns count: a nested function's return belongs to that function.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { SourceCode } from 'eslint'

import { TRANSPARENT_WRAPPER_TYPES } from './literal-pieces.ts'

type Node = TSESTree.Node
type InlineFunction = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
])

/**
 * The inline function `node` is, reading through the same single-child wrappers a class position
 * reads through, or `undefined` when it is not one.
 */
export function inlineFunction(node: Node): InlineFunction | undefined {
  let current = node
  while (TRANSPARENT_WRAPPER_TYPES.has(current.type)) {
    current = (current as TSESTree.ChainExpression).expression
  }
  return current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression'
    ? current
    : undefined
}

/**
 * Every expression `fn` returns: its body when that is an expression, otherwise the argument of
 * each `return` statement reachable without entering a nested function.
 */
export function returnedValues(fn: InlineFunction, visitorKeys: SourceCode.VisitorKeys): Node[] {
  if (fn.body.type !== 'BlockStatement') return [fn.body]
  const returned: Node[] = []
  const visit = (node: Node): void => {
    if (node.type === 'ReturnStatement') {
      if (node.argument) returned.push(node.argument)
      return
    }
    if (FUNCTION_TYPES.has(node.type)) return
    const fields = node as unknown as Record<string, unknown>
    const children = (visitorKeys[node.type] ?? []).flatMap((key) => [fields[key]].flat())
    for (const child of children) {
      if (child && typeof (child as { type?: unknown }).type === 'string') visit(child as Node)
    }
  }
  visit(fn.body)
  return returned
}
