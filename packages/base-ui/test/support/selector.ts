/**
 * Selector-level readers for the instruments: the nodes of a resolved selector with where each sits,
 * a specificity, and the attribute states a selector's last compound requires or excludes.
 */
import type { Attribute, Node, Pseudo, Selector } from 'postcss-selector-parser'

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

/**
 * One attribute selector of a resolved selector, as the parser reads it: the name, the operator,
 * the value without its quotes, and the functional pseudo-classes around it.
 */
export interface AttributeRead {
  readonly name: string
  readonly operator: string | undefined
  readonly value: string | undefined
  readonly inside: readonly string[]
}

/**
 * Every attribute selector of a selector, whatever its quoting, with where it sits.
 */
export const attributeReads = (selector: string): AttributeRead[] =>
  selectorNodes(selector).flatMap(({ node, inside }) =>
    node.type === 'attribute'
      ? [{ name: node.attribute, operator: node.operator, value: node.value, inside }]
      : [],
  )

/**
 * Whether an attribute selector sits where it requires the state: not inside a `:not()`, which
 * excludes it.
 */
const isRequired = (read: AttributeRead): boolean => !read.inside.includes(':not')

/**
 * Whether a selector requires `[name=value]`, quoted or not, and not only as the argument of `:not()`.
 */
export const requiresAttributeValue = (selector: string, name: string, value: string): boolean =>
  attributeReads(selector).some(
    (read) =>
      isRequired(read) && read.name === name && read.operator === '=' && read.value === value,
  )

/**
 * Whether a selector requires the attribute to be present (`[name]` or `[name=""]`), and not only as
 * the argument of `:not()`.
 */
export const requiresAttributePresence = (selector: string, name: string): boolean =>
  attributeReads(selector).some(
    (read) =>
      isRequired(read) &&
      read.name === name &&
      (read.operator === undefined || (read.operator === '=' && read.value === '')),
  )

/**
 * Whether a selector requires a disabled state: `[aria-disabled=true]`, `[data-disabled]` or
 * `:disabled`, in any quoting, and not only inside a `:not()`.
 */
export const requiresDisabled = (selector: string): boolean =>
  requiresAttributeValue(selector, 'aria-disabled', 'true') ||
  requiresAttributePresence(selector, 'data-disabled') ||
  selectorNodes(selector).some(
    ({ node, inside }) =>
      node.type === 'pseudo' && node.value === ':disabled' && !inside.includes(':not'),
  )

const isInvalidAttribute = (node: Node): boolean =>
  node.type === 'attribute' &&
  node.attribute === 'aria-invalid' &&
  node.operator === '=' &&
  node.value === 'true'

/**
 * Whether a `:has()` argument is `> <compound>` with the invalid state in that compound: an invalid
 * direct child, and nothing wider.
 */
const isInvalidChildArgument = (argument: Selector): boolean => {
  const [first, ...rest] = argument.nodes
  if (first?.type !== 'combinator' || first.value !== '>') return false
  const end = rest.findIndex((node) => node.type === 'combinator')
  return (end === -1 ? rest : rest.slice(0, end)).some((node) => isInvalidAttribute(node))
}

const requiresInvalidNodes = (nodes: readonly Node[]): boolean =>
  nodes.some(
    (node) =>
      isInvalidAttribute(node) ||
      (node.type === 'pseudo' &&
        node.value === ':has' &&
        node.nodes.length > 0 &&
        node.nodes.every((argument) => isInvalidChildArgument(argument))),
  )

/**
 * Whether every alternative of a selector list requires the control to be invalid: itself
 * `[aria-invalid=true]`, or `:has(> [aria-invalid=true])` with every argument that way. An
 * attribute inside `:not()` excludes the state, and one alternative without the key is enough to
 * let the paint reach a valid control.
 */
export const requiresInvalid = (list: string): boolean => {
  let isKeyed = false
  selectorParser((root) => {
    isKeyed =
      root.nodes.length > 0 && root.nodes.every((branch) => requiresInvalidNodes(branch.nodes))
  }).processSync(list)
  return isKeyed
}

/**
 * Whether a selector requires `[aria-invalid=true]` anywhere, `:has()` arguments included, and not
 * only inside `:not()`: where the invalid rule sits in the cascade, whatever else it is isKeyed on.
 */
export const requiresInvalidState = (selector: string): boolean =>
  requiresAttributeValue(selector, 'aria-invalid', 'true')

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
