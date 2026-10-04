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

type Values = string[] | undefined

/**
 * How one node resolves: the nodes whose strings it needs, in order, which of them it asks for
 * once the earlier ones are known, and what it makes of them.
 */
interface Plan {
  readonly deps: (done: readonly Values[]) => readonly (AstNode | undefined)[]
  readonly combine: (done: readonly Values[]) => Values
}

const none = (): readonly AstNode[] => []
const leaf = (values: Values): Plan => ({ deps: none, combine: () => values })

/**
 * The union of `parts`, each value once, or `undefined` when any part has no known strings.
 */
function unionOf(parts: readonly Values[]): Values {
  if (parts.includes(undefined)) return undefined
  return [...new Set((parts as readonly string[][]).flat())]
}

/**
 * The plan for `left || right` and `left ?? right`. A known string is never nullish, and it is
 * falsy only when empty, so the right side is read only for the values of the left it does not
 * decide: for `??` none, for `||` the empty string.
 */
function planOfFallback(node: AstNode): Plan {
  const left = nodeAt(node, 'left')
  const right = nodeAt(node, 'right')
  const isOr = node.operator === '||'
  return {
    deps: (done) => {
      if (done.length === 0) return [left]
      const known = done[0]
      return known && isOr && known.includes('') ? [left, right] : [left]
    },
    combine: (done) => {
      const [known, other] = done
      if (!known || !isOr || !known.includes('')) return known
      return other && unionOf([known.filter((value) => value !== ''), other])
    },
  }
}

/**
 * The plan for a name: those of the initialiser of its sole declaration.
 */
function planOfName(node: AstNode, analysis: ScopeAnalysis): Plan {
  const init = soleInitialiserBinding(analysis.referenceOf(node)?.binding)?.init
  if (!init) return leaf(undefined)
  return { deps: () => [init], combine: ([only]) => only }
}

/**
 * The plan for `node`: a string, or an expression over other nodes; `undefined` values for
 * anything that can be something else.
 */
function planOf(node: AstNode, analysis: ScopeAnalysis): Plan {
  const text = staticStringOf(node)
  if (text !== undefined) return leaf([text])
  switch (node.type) {
    case 'ConditionalExpression': {
      const parts = [nodeAt(node, 'consequent'), nodeAt(node, 'alternate')]
      return { deps: () => parts, combine: unionOf }
    }
    case 'Identifier': {
      return planOfName(node, analysis)
    }
    case 'LogicalExpression': {
      return node.operator === '&&' ? leaf(undefined) : planOfFallback(node)
    }
    case 'ParenthesizedExpression': {
      const inner = nodeAt(node, 'expression')
      return { deps: () => [inner], combine: ([only]) => only }
    }
    default: {
      return leaf(undefined)
    }
  }
}

interface Frame {
  readonly node: AstNode
  readonly plan: Plan
  readonly done: Values[]
}

/**
 * The strings `root` can be, when every value it can take is one. The expression is walked with a
 * stack of its own, and each node is resolved once, so a long chain of names, or of names that
 * each read the one before twice (`const b = c ? a : a`), costs one step for each declaration.
 */
export function stringValues(
  root: AstNode | undefined,
  analysis: ScopeAnalysis,
): string[] | undefined {
  if (!root) return undefined
  const memo = new Map<AstNode, Values>()
  const active = new Set<AstNode>([root])
  const stack: Frame[] = [{ node: root, plan: planOf(root, analysis), done: [] }]
  let result: Values
  while (stack.length > 0) {
    const top = stack.at(-1)!
    const deps = top.plan.deps(top.done)
    if (top.done.length < deps.length) {
      const child = deps[top.done.length]
      if (!child) top.done.push(undefined)
      else if (memo.has(child)) top.done.push(memo.get(child))
      else if (active.has(child)) top.done.push(undefined)
      else {
        active.add(child)
        stack.push({ node: child, plan: planOf(child, analysis), done: [] })
      }
      continue
    }
    result = top.plan.combine(top.done)
    memo.set(top.node, result)
    active.delete(top.node)
    stack.pop()
    stack.at(-1)?.done.push(result)
  }
  return result
}
