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
 * The result of `parts`, each of which must be readable: their union, one entry for each value
 * and node, so a name read twice (`c ? a : a`) adds its values once however deep the chain.
 */
function unionOf(parts: readonly Resolved[]): Resolved {
  if (parts.includes(undefined)) return undefined
  const seen = new Map<AstNode, Set<string>>()
  const isNew = (possible: Possible): boolean => {
    const values = seen.get(possible.node) ?? new Set<string>()
    seen.set(possible.node, values)
    const before = values.size
    values.add(possible.value)
    return values.size > before
  }
  return parts.flatMap((part) => part!.filter((possible) => isNew(possible)))
}

/**
 * How one node resolves: the nodes whose results it needs, in order, and what it makes of them.
 */
interface Plan {
  readonly deps: readonly (AstNode | undefined)[]
  readonly combine: (done: readonly Resolved[]) => Resolved
  /**
   * Called with the result once it is known, for a name that was being resolved.
   */
  readonly finish?: (result: Resolved) => void
}

const first = (done: readonly Resolved[]): Resolved => done[0]
const leaf = (result: Resolved): Plan => ({ deps: [], combine: () => result })

/**
 * The plan for a name: what its sole declaration's initialiser holds. A name whose resolution is
 * already known, or under way (a cycle), needs nothing more.
 */
function planOfName(node: AstNode, context: Context): Plan {
  const reference = context.analysis.referenceOf(node)
  if (!reference?.binding) return leaf(stringAt(node, 'name') === 'undefined' ? [] : undefined)
  const binding = soleInitialiserBinding(reference.binding)
  if (!binding) return leaf(undefined)
  if (context.resolved.has(binding)) return leaf(context.resolved.get(binding))
  if (context.resolving.has(binding)) return leaf(undefined)
  context.resolving.add(binding)
  return {
    deps: [binding.init],
    combine: first,
    finish(result) {
      context.resolving.delete(binding)
      context.resolved.set(binding, result)
    },
  }
}

/**
 * The plan for `a && X`, `a || X` and `a ?? X`: `a && X` is `X` or something `cx()` filters out;
 * the others are either side. A literal left operand can decide the call alone, and then the
 * other side is never read.
 */
function planOfLogical(node: AstNode): Plan {
  const left = nodeAt(node, 'left')
  const right = nodeAt(node, 'right')
  const operand = operandOf(left)
  if (node.operator === '&&') {
    return operand?.isFalsy ? leaf([]) : { deps: [right], combine: first }
  }
  const isDecided = node.operator === '||' ? operand?.isFalsy : operand?.isNullish
  if (isDecided === false) return { deps: [left], combine: first }
  return { deps: [left, right], combine: unionOf }
}

/**
 * The plan for `node`: a string, a literal or name `cx()` filters out, or an expression over
 * other nodes.
 */
function planOf(node: AstNode, context: Context): Plan {
  const text = staticStringOf(node)
  if (text !== undefined) return leaf(text === '' ? [] : [{ value: text, node }])
  switch (node.type) {
    case 'ConditionalExpression': {
      return {
        deps: [nodeAt(node, 'consequent'), nodeAt(node, 'alternate')],
        combine: unionOf,
      }
    }
    case 'Identifier': {
      return planOfName(node, context)
    }
    case 'Literal': {
      return leaf(literalValue(node))
    }
    case 'LogicalExpression': {
      return planOfLogical(node)
    }
    case 'MemberExpression': {
      return leaf(setupValue(node, context))
    }
    case 'ParenthesizedExpression': {
      return { deps: [nodeAt(node, 'expression')], combine: first }
    }
    case 'UnaryExpression': {
      return leaf(unaryValue(node))
    }
    default: {
      return leaf(undefined)
    }
  }
}

interface Frame {
  readonly plan: Plan
  readonly done: Resolved[]
}

/**
 * The strings `root` can evaluate to that `cx()` would not filter out, or `undefined` when the
 * build cannot tell. The expression is walked with a stack of its own, so the nesting of the
 * expression (a chain of a few thousand `||`, a name bound to a name bound to a name) is no
 * limit of the call stack.
 */
function possibles(root: AstNode | undefined, context: Context): Resolved {
  if (!root) return undefined
  const stack: Frame[] = [{ plan: planOf(root, context), done: [] }]
  let result: Resolved
  while (stack.length > 0) {
    const top = stack.at(-1)!
    const next = top.plan.deps[top.done.length]
    if (top.done.length < top.plan.deps.length) {
      if (next) stack.push({ plan: planOf(next, context), done: [] })
      else top.done.push(undefined)
      continue
    }
    result = top.plan.combine(top.done)
    top.plan.finish?.(result)
    stack.pop()
    stack.at(-1)?.done.push(result)
  }
  return result
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
