/**
 * What an argument of a direct `cx()` call can be, decided from the module alone: a finite set of
 * strings, or unreadable. A string literal, a template literal with no substitutions, `null`,
 * `undefined`, `false` (and the `!1` and `void 0` a minifier prints for those two), `cond && X`,
 * `cond ? X : Y`, `X || Y`, `X ?? Y`, and a name bound by a declaration whose initialiser
 * resolves and which nothing else in the module writes.
 */
import type { AstNode } from './vite-ast.ts'
import type { Binding, ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, staticStringOf, stringAt } from './vite-ast.ts'
import { isSetupParameter, type SetupExposures, setupMemberName } from './vite-setup-member.ts'

/**
 * One string an argument can be, with the node that spells it (where a mistake in it is reported).
 */
export interface Possible {
  readonly value: string
  readonly node: AstNode
}

type Resolved = Possible[] | undefined

interface Context {
  readonly analysis: ScopeAnalysis
  readonly resolving: Set<Binding>
  /**
   * What each binding already resolved to, so a chain of constants is followed once however
   * many calls read its end.
   */
  readonly resolved: Map<Binding, Resolved>
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
 * `!1` and `void 0`: how a minifier prints `false` and `undefined`, both filtered out by `cx()`.
 */
function unaryValue(node: AstNode): Possible[] | undefined {
  const argument = nodeAt(node, 'argument')
  const isNumber = (value: number): boolean =>
    argument?.type === 'Literal' && argument.value === value
  const isFalse = node.operator === '!' && isNumber(1)
  const isUndefined = node.operator === 'void' && isNumber(0)
  return isFalse || isUndefined ? [] : undefined
}

/**
 * The binding that a name stands for the sole initialiser of: a `const`, or a `let` or `var`
 * nothing else writes. `undefined` for any other binding.
 */
export function soleInitialiserBinding(binding: Binding | undefined): Binding | undefined {
  const isPlain = binding && ['const', 'let', 'var'].includes(binding.kind)
  return isPlain && binding.init && binding.writes === 0 ? binding : undefined
}

/**
 * The binding the identifier `init` names, when a declaration's initialiser is just another name.
 */
function aliasedBinding(init: AstNode, context: Context): Binding | undefined {
  return soleInitialiserBinding(context.analysis.referenceOf(init)?.binding)
}

/**
 * Where a declaration's initialiser leads: to another name (`alias`), or to a result.
 */
function stepOf(
  init: AstNode,
  context: Context,
): { readonly alias: Binding | undefined; readonly result: Resolved } {
  if (init.type !== 'Identifier') return { alias: undefined, result: possibles(init, context) }
  if (context.analysis.referenceOf(init)?.binding) {
    return { alias: aliasedBinding(init, context), result: undefined }
  }
  return { alias: undefined, result: stringAt(init, 'name') === 'undefined' ? [] : undefined }
}

/**
 * A name: `undefined` when nothing declares it, else what its sole declaration holds. A name
 * bound to another name (`const b = a`) is followed in a loop, not by recursion, so a chain of any
 * length resolves, once however many calls read its end.
 */
function identifierValue(node: AstNode, context: Context): Possible[] | undefined {
  const reference = context.analysis.referenceOf(node)
  if (!reference?.binding) return stringAt(node, 'name') === 'undefined' ? [] : undefined
  const chain: Binding[] = []
  let result: Resolved
  let binding = soleInitialiserBinding(reference.binding)
  while (binding) {
    if (context.resolved.has(binding)) {
      result = context.resolved.get(binding)
      break
    }
    if (context.resolving.has(binding)) break
    chain.push(binding)
    context.resolving.add(binding)
    const step = stepOf(binding.init!, context)
    result = step.result
    binding = step.alias
  }
  for (const link of chain) {
    context.resolving.delete(link)
    context.resolved.set(link, result)
  }
  return result
}

/**
 * What a literal operand decides about `&&`, `||` and `??`: whether it is falsy, and whether it is
 * nullish. `undefined` for anything that is not a literal.
 */
function operandOf(
  node: AstNode | undefined,
): { isFalsy: boolean; isNullish: boolean } | undefined {
  if (node?.type !== 'Literal') return undefined
  const { value } = node
  return { isFalsy: !value, isNullish: value === null }
}

/**
 * `a && X` is `X` or something `cx()` filters out; `a || X` and `a ?? X` are either side. A literal
 * left operand can decide the call alone, and then the other side is never read.
 */
function logicalValue(node: AstNode, context: Context): Possible[] | undefined {
  const left = nodeAt(node, 'left')
  const right = nodeAt(node, 'right')
  const operand = operandOf(left)
  if (node.operator === '&&') return operand?.isFalsy ? [] : possibles(right, context)
  const isDecided = node.operator === '||' ? operand?.isFalsy : operand?.isNullish
  return isDecided === false ? possibles(left, context) : unionOf([left, right], context)
}

/**
 * `$setup.v`, where the component's script exposes `v` bound to a string.
 */
function setupValue(node: AstNode, context: Context): Possible[] | undefined {
  const object = nodeAt(node, 'object')
  if (!object || !isSetupParameter(context.analysis, object)) return undefined
  const name = setupMemberName(node)
  const exposure = name === undefined ? undefined : context.setup?.get(name)
  if (exposure?.kind !== 'values') return undefined
  return exposure.values.filter((value) => value !== '').map((value) => ({ value, node }))
}

const COMPOSITES: Readonly<
  Record<string, (node: AstNode, context: Context) => Possible[] | undefined>
> = {
  Literal: (node) => literalValue(node),
  UnaryExpression: (node) => unaryValue(node),
  Identifier: identifierValue,
  LogicalExpression: logicalValue,
  ConditionalExpression: (node, context) =>
    unionOf([nodeAt(node, 'consequent'), nodeAt(node, 'alternate')], context),
  ParenthesizedExpression: (node, context) => possibles(nodeAt(node, 'expression'), context),
  MemberExpression: setupValue,
}

const RESOLVED = new WeakMap<ScopeAnalysis, Map<Binding, Resolved>>()

/**
 * What the bindings of `analysis` resolved to so far. A module's own bindings read the same
 * whoever asks; one that reads a component's setup return is not kept, since that differs.
 */
function resolvedFor(
  analysis: ScopeAnalysis,
  setup: SetupExposures | undefined,
): Map<Binding, Resolved> {
  if (setup) return new Map()
  const found = RESOLVED.get(analysis) ?? new Map<Binding, Resolved>()
  RESOLVED.set(analysis, found)
  return found
}

/**
 * What the argument `node` of a `cx()` call can be, or `undefined` when the build cannot tell.
 */
export function resolveArgument(
  node: AstNode,
  analysis: ScopeAnalysis,
  setup?: SetupExposures,
): Possible[] | undefined {
  const resolved = resolvedFor(analysis, setup)
  return possibles(node, { analysis, resolving: new Set(), resolved, setup })
}
