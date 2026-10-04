/**
 * Selector-level readers for the instruments: the nodes of a resolved selector with where each sits,
 * a specificity, and the attribute states a selector's last compound requires or excludes.
 */
import type { Attribute, Node, Pseudo } from 'postcss-selector-parser'

import selectorParser from 'postcss-selector-parser'

export interface SelectorNode {
  readonly node: Node
  /**
   * Names of the functional pseudo-classes the node sits inside, innermost last.
   */
  readonly inside: readonly string[]
}

const enclosing = (node: Node): string[] => {
  const names: string[] = []
  for (let parent = node.parent?.parent; parent !== undefined; parent = parent.parent?.parent) {
    if (parent.type === 'pseudo') names.unshift((parent as Pseudo).value)
  }
  return names
}

/**
 * Every node of a selector, depth first, each with the functional pseudo-classes around it.
 */
export const selectorNodes = (selector: string): SelectorNode[] => {
  const nodes: SelectorNode[] = []
  selectorParser((root) => {
    root.walk((node) => {
      if (node.type !== 'selector') nodes.push({ node, inside: enclosing(node) })
    })
  }).processSync(selector)
  return nodes
}

type Triple = readonly [number, number, number]

const ZERO: Triple = [0, 0, 0]

const BY_TYPE: Readonly<Record<string, Triple>> = {
  attribute: [0, 1, 0],
  class: [0, 1, 0],
  id: [1, 0, 0],
  tag: [0, 0, 1],
}

const add = (a: Triple, b: Triple): Triple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export const compare = (a: Triple, b: Triple): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

const largest = (candidates: Triple[]): Triple =>
  candidates.reduce<Triple>((best, next) => (compare(next, best) > 0 ? next : best), ZERO)

const pseudoSpecificity = (pseudo: Pseudo): Triple => {
  if (pseudo.value.startsWith('::')) return [0, 0, 1]
  if (pseudo.value === ':where') return ZERO
  if ([':has', ':is', ':not'].includes(pseudo.value)) {
    return largest(
      pseudo.nodes
        .filter((inner) => inner.type === 'selector')
        .map((inner) => selectorSpecificity(String(inner))),
    )
  }
  return [0, 1, 0]
}

const nodeSpecificity = (node: Node): Triple =>
  node.type === 'pseudo' ? pseudoSpecificity(node) : (BY_TYPE[node.type] ?? ZERO)

/**
 * The specificity of one resolved selector, as (ids, classes and attributes, types).
 */
export const selectorSpecificity = (selector: string): Triple => {
  let total: Triple = ZERO
  selectorParser((root) => {
    total = root.first.nodes.reduce<Triple>((sum, node) => add(sum, nodeSpecificity(node)), ZERO)
  }).processSync(selector)
  return total
}

const lastCompound = (selector: string): Node[] => {
  const compound: Node[] = []
  selectorParser((root) => {
    for (const node of root.first.nodes) {
      if (node.type === 'combinator') compound.length = 0
      else compound.push(node)
    }
  }).processSync(selector)
  return compound
}

const attributeState = (node: Attribute): string => `${node.attribute}=${node.value ?? ''}`

/**
 * The states a `:not()` rules out on its own: an argument that is a single attribute selector.
 * An argument made of several nodes (`:not([a][b])`) excludes no one attribute by itself.
 */
const excludedStates = (pseudo: Pseudo): string[] =>
  pseudo.nodes.flatMap((argument) => {
    const [only, ...rest] = argument.nodes
    return rest.length === 0 && only?.type === 'attribute' ? [attributeState(only)] : []
  })

interface Constraints {
  readonly excluded: ReadonlySet<string>
  readonly required: ReadonlySet<string>
}

/**
 * The attribute states the last compound of a selector requires, and those it excludes by `:not()`.
 */
export const attributeConstraints = (selector: string): Constraints => {
  const compound = lastCompound(selector)
  const required = compound
    .filter((node) => node.type === 'attribute')
    .map((node) => attributeState(node))
  const excluded = compound
    .filter((node) => node.type === 'pseudo' && node.value === ':not')
    .flatMap((node) => excludedStates(node as Pseudo))
  return { excluded: new Set(excluded), required: new Set(required) }
}

/**
 * Whether two resolved selectors can never match one element, by an attribute state one needs and
 * the other excludes with `:not()`.
 */
export const isMutuallyExclusive = (a: string, b: string): boolean => {
  const left = attributeConstraints(a)
  const right = attributeConstraints(b)
  return (
    left.required.values().some((state) => right.excluded.has(state)) ||
    right.required.values().some((state) => left.excluded.has(state))
  )
}
