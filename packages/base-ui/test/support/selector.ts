/**
 * Selector-level readers for the instruments: the nodes of a resolved selector with where each sits,
 * a specificity, and the states a selector requires of the control it lands on.
 */
import type { Node, Pseudo, Selector } from 'postcss-selector-parser'

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

/**
 * The nodes after the last combinator: the compound the declaration lands on. A key on an ancestor
 * compound says nothing about the element itself.
 */
const subjectCompound = (nodes: readonly Node[]): readonly Node[] =>
  nodes.slice(nodes.findLastIndex((node) => node.type === 'combinator') + 1)

const requiresInvalidNodes = (nodes: readonly Node[]): boolean =>
  subjectCompound(nodes).some(
    (node) =>
      isInvalidAttribute(node) ||
      (node.type === 'pseudo' &&
        node.value === ':has' &&
        node.nodes.length > 0 &&
        node.nodes.every((argument) => isInvalidChildArgument(argument))),
  )

/**
 * Whether every alternative of a selector list requires the control to be invalid: its own
 * compound has `[aria-invalid=true]`, or `:has(> [aria-invalid=true])` with every argument that way. An
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

const isGroupInvalidNodes = (nodes: readonly Node[]): boolean => {
  const compound = subjectCompound(nodes)
  const hasInvalid = compound.some(
    (node) => node.type === 'attribute' && node.attribute === 'data-invalid',
  )
  const isDisabledExcluded = compound.some(
    (node) =>
      node.type === 'pseudo' &&
      node.value === ':not' &&
      node.nodes.some(
        (argument) =>
          argument.nodes.length === 1 &&
          argument.first?.type === 'attribute' &&
          argument.first.attribute === 'data-disabled',
      ),
  )
  return hasInvalid && isDisabledExcluded
}

/**
 * Whether every alternative of a selector list requires a field group to be invalid and not
 * disabled: `[data-invalid]` with `:not([data-disabled])` in its own compound. The group reports
 * invalid beside `aria-invalid` only while it is not disabled.
 */
export const requiresInvalidGroup = (list: string): boolean => {
  let isKeyed = false
  selectorParser((root) => {
    isKeyed =
      root.nodes.length > 0 && root.nodes.every((branch) => isGroupInvalidNodes(branch.nodes))
  }).processSync(list)
  return isKeyed
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
