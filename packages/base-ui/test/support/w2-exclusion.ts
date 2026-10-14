/**
 * Whether two resolved selectors can never match one element, and the generated box a selector
 * paints on: the reading the disjointness instrument needs beyond what the other instruments do.
 */
import type { Attribute, Node, Pseudo } from 'postcss-selector-parser'

import selectorParser from 'postcss-selector-parser'

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

/**
 * The generated box a selector's declarations land on: the pseudo-element ending the selector, or
 * `element` when it ends in none.
 */
export const generatedBox = (selector: string): string =>
  lastCompound(selector).find((node) => node.type === 'pseudo' && node.value.startsWith('::'))
    ?.value ?? 'element'

const attributeState = (node: Attribute): string => `${node.attribute}=${node.value ?? ''}`

/**
 * The state a single node names, if it names one: an attribute selector, or a pseudo-class with no
 * arguments such as `:disabled`.
 */
const stateOf = (node: Node): string | undefined => {
  if (node.type === 'attribute') return attributeState(node)
  const isPlainPseudoClass =
    node.type === 'pseudo' && !node.value.startsWith('::') && node.nodes.length === 0
  return isPlainPseudoClass ? node.value : undefined
}

/**
 * The states a `:not()` rules out on its own: each argument of the list that is a single attribute
 * selector or a single pseudo-class, `:not(A, B)` being `:not(A)` and `:not(B)`. An argument made of
 * several nodes (`:not([a][b])`) excludes no one state by itself.
 */
const excludedStates = (pseudo: Pseudo): string[] =>
  pseudo.nodes.flatMap((argument) => {
    const [only, ...rest] = argument.nodes
    const state = only === undefined ? undefined : stateOf(only)
    return state !== undefined && rest.length === 0 ? [state] : []
  })

interface Constraints {
  readonly excluded: ReadonlySet<string>
  readonly required: ReadonlySet<string>
  /**
   * The value each attribute is required to equal, by `[name=value]`.
   */
  readonly equals: ReadonlyMap<string, string>
}

/**
 * The states the last compound of a selector requires, those it excludes by `:not()`, and the
 * value it requires of each attribute.
 */
export const attributeConstraints = (selector: string): Constraints => {
  const compound = lastCompound(selector)
  const required = compound.flatMap((node) => {
    const state = stateOf(node)
    return state === undefined ? [] : [state]
  })
  const excluded = compound
    .filter((node) => node.type === 'pseudo' && node.value === ':not')
    .flatMap((node) => excludedStates(node as Pseudo))
  const equals = new Map(
    compound
      .filter((node): node is Attribute => node.type === 'attribute')
      .filter((node) => node.operator === '=' && node.value !== undefined)
      .map((node): [string, string] => [node.attribute, node.value ?? '']),
  )
  return { excluded: new Set(excluded), required: new Set(required), equals }
}

/**
 * Whether two resolved selectors can never match one element: a state one needs and the other
 * excludes with `:not()`, or two different values required of one attribute.
 */
export const isMutuallyExclusive = (a: string, b: string): boolean => {
  const left = attributeConstraints(a)
  const right = attributeConstraints(b)
  const isExcluded =
    left.required.values().some((state) => right.excluded.has(state)) ||
    right.required.values().some((state) => left.excluded.has(state))
  const isDifferentValue = left.equals
    .entries()
    .some(([name, value]) => right.equals.has(name) && right.equals.get(name) !== value)
  return isExcluded || isDifferentValue
}
