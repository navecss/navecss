/**
 * What an argument of a direct `cx()` call can be, decided from the module alone: a finite set of
 * strings, or unreadable. A string literal, a template literal with no substitutions, `null`,
 * `undefined`, `false`, `cond && X`, `cond ? X : Y`, `X || Y`, `X ?? Y`, and a name bound by a
 * declaration whose initialiser resolves and which nothing else in the module writes.
 */
import type { AstNode } from './vite-ast.ts'
import type { Binding, ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, staticStringOf, stringAt } from './vite-ast.ts'
import { type SetupExposures, setupMemberName } from './vite-setup-member.ts'

/**
 * One string an argument can be, with the node that spells it (where a mistake in it is reported).
 */
export interface Possible {
  readonly value: string
  readonly node: AstNode
}

interface Context {
  readonly analysis: ScopeAnalysis
  readonly resolving: Set<Binding>
  /**
   * What a compiled Vue component's script exposes to its template, when `$setup` is in scope.
   */
  readonly setup?: SetupExposures | undefined
}

/**
 * The strings `node` can evaluate to that `cx()` would not filter out, or `undefined` when the
 * build cannot tell.
 */
function possibles(node: AstNode | undefined, context: Context): Possible[] | undefined {
  if (!node) return undefined
  const text = staticStringOf(node)
  if (text !== undefined) return text === '' ? [] : [{ value: text, node }]
  return COMPOSITES[node.type]?.(node, context) ?? undefined
}

/**
 * The union of the resolutions of `nodes`, or `undefined` when any of them is unreadable.
 */
function unionOf(
  nodes: readonly (AstNode | undefined)[],
  context: Context,
): Possible[] | undefined {
  const all: Possible[] = []
  for (const node of nodes) {
    const found = possibles(node, context)
    if (!found) return undefined
    all.push(...found)
  }
  return all
}

/**
 * A literal that is no string: only the values `cx()` filters out are readable.
 */
function literalValue(node: AstNode): Possible[] | undefined {
  const value = node.value
  if (value === null && node.raw === 'null') return []
  return value === false ? [] : undefined
}

/**
 * A name: `undefined` when nothing declares it, else what its sole declaration holds.
 */
function identifierValue(node: AstNode, context: Context): Possible[] | undefined {
  const reference = context.analysis.referenceOf(node)
  const binding = reference?.binding
  if (!binding) return stringAt(node, 'name') === 'undefined' ? [] : undefined
  const isPlain = ['const', 'let', 'var'].includes(binding.kind)
  if (!isPlain || !binding.init || binding.writes > 0 || context.resolving.has(binding)) {
    return undefined
  }
  context.resolving.add(binding)
  try {
    return possibles(binding.init, context)
  } finally {
    context.resolving.delete(binding)
  }
}

/**
 * `a && X` is `X` or something `cx()` filters out; `a || X` and `a ?? X` are either side.
 */
function logicalValue(node: AstNode, context: Context): Possible[] | undefined {
  const right = nodeAt(node, 'right')
  if (node.operator === '&&') return possibles(right, context)
  return unionOf([nodeAt(node, 'left'), right], context)
}

/**
 * `$setup.v`, where the component's script exposes `v` bound to a string.
 */
function setupValue(node: AstNode, context: Context): Possible[] | undefined {
  const name = setupMemberName(node)
  const exposure = name === undefined ? undefined : context.setup?.get(name)
  if (exposure?.kind !== 'values') return undefined
  return exposure.values.filter((value) => value !== '').map((value) => ({ value, node }))
}

const COMPOSITES: Readonly<
  Record<string, (node: AstNode, context: Context) => Possible[] | undefined>
> = {
  Literal: (node) => literalValue(node),
  Identifier: identifierValue,
  LogicalExpression: logicalValue,
  ConditionalExpression: (node, context) =>
    unionOf([nodeAt(node, 'consequent'), nodeAt(node, 'alternate')], context),
  ParenthesizedExpression: (node, context) => possibles(nodeAt(node, 'expression'), context),
  MemberExpression: setupValue,
}

/**
 * What the argument `node` of a `cx()` call can be, or `undefined` when the build cannot tell.
 */
export function resolveArgument(
  node: AstNode,
  analysis: ScopeAnalysis,
  setup?: SetupExposures,
): Possible[] | undefined {
  return possibles(node, { analysis, resolving: new Set(), setup })
}
