/**
 * The strings an expression can be when every value it can take is a string, found the way
 * `cx()`'s arguments are (a literal, a template literal with no substitutions, `?:`, `||` and
 * `??` over those, a name bound once to one) with one difference: only a string counts. A
 * concatenation prints `false`, `null`, `undefined` and a number as text, so an operand that can
 * take one, `cond && X` included, or one that does not resolve, has no known strings.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, staticStringOf } from './vite-ast.ts'
import { soleInitialiserBinding } from './vite-cx-args.ts'

/**
 * The union of the strings of `nodes`, or `undefined` when any of them has none known.
 */
function unionOf(
  nodes: readonly (AstNode | undefined)[],
  analysis: ScopeAnalysis,
  resolving: ReadonlySet<AstNode>,
): string[] | undefined {
  const all: string[] = []
  for (const node of nodes) {
    const found = valuesOf(node, analysis, resolving)
    if (!found) return undefined
    all.push(...found)
  }
  return all
}

/**
 * The strings the name `node` can be: those of the initialiser of its sole declaration.
 */
function nameValues(
  node: AstNode,
  analysis: ScopeAnalysis,
  resolving: ReadonlySet<AstNode>,
): string[] | undefined {
  const binding = soleInitialiserBinding(analysis.referenceOf(node)?.binding)
  const init = binding?.init
  if (!init || resolving.has(init)) return undefined
  return valuesOf(init, analysis, new Set([...resolving, init]))
}

/**
 * The strings `node` can evaluate to, or `undefined` when it can be anything but a string or
 * when the build cannot tell.
 */
function valuesOf(
  node: AstNode | undefined,
  analysis: ScopeAnalysis,
  resolving: ReadonlySet<AstNode>,
): string[] | undefined {
  let current = node
  while (current?.type === 'ParenthesizedExpression') current = nodeAt(current, 'expression')
  if (!current) return undefined
  const text = staticStringOf(current)
  if (text !== undefined) return [text]
  return compositeValues(current, analysis, resolving)
}

/**
 * The strings of an expression that is not a string literal, as far as one can be told.
 */
function compositeValues(
  node: AstNode,
  analysis: ScopeAnalysis,
  resolving: ReadonlySet<AstNode>,
): string[] | undefined {
  switch (node.type) {
    case 'ConditionalExpression': {
      return unionOf([nodeAt(node, 'consequent'), nodeAt(node, 'alternate')], analysis, resolving)
    }
    case 'Identifier': {
      return nameValues(node, analysis, resolving)
    }
    case 'LogicalExpression': {
      if (node.operator === '&&') return undefined
      return unionOf([nodeAt(node, 'left'), nodeAt(node, 'right')], analysis, resolving)
    }
    default: {
      return undefined
    }
  }
}

/**
 * The strings `node` can be, when every value it can take is one.
 */
export function stringValues(
  node: AstNode | undefined,
  analysis: ScopeAnalysis,
): string[] | undefined {
  return valuesOf(node, analysis, new Set())
}
