/**
 * Reading the built stylesheet the way the instruments need it: every declaration with the
 * at-rules and rules it sits in, and every rule's selectors with `&` resolved to the class that
 * owns them.
 */
import type { AtRule, ChildNode, Container, Declaration, Document, Rule } from 'postcss'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

export const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
The file `@navecss/base-ui/styles.css` resolves to.
 */
export const STYLESHEET_PATH = path.join(PACKAGE_DIR, 'dist/styles.css')

/**
The built stylesheet's text.
 */
export const readStylesheet = (): string => readFileSync(STYLESHEET_PATH, 'utf8')

export interface FlatDeclaration {
  /**
  The ancestor at-rules, outermost first, as `@name params`.
   */
  readonly atRules: readonly string[]
  /**
  The ancestor rules' own selectors, outermost first, unresolved.
   */
  readonly selectors: readonly string[]
  /**
  The class of the outermost rule, without the dot.
   */
  readonly owner: string
  readonly property: string
  readonly value: string
  readonly node: Declaration
}

const ownClass = (selector: string): string => /^\.([\w-]+)/.exec(selector)?.[1] ?? ''

/**
The containers a node sits in, outermost first, the root left out.
 */
const ancestors = (node: ChildNode): Container[] => {
  const chain: Container[] = []
  let parent: Container | Document | undefined = node.parent
  while (parent !== undefined && (parent.type === 'rule' || parent.type === 'atrule')) {
    chain.push(parent)
    parent = parent.parent
  }
  return chain.toReversed()
}

const isRule = (node: Container): node is Rule => node.type === 'rule'
const isAtRule = (node: Container): node is AtRule => node.type === 'atrule'

/**
Every declaration of a stylesheet, in document order.
 */
export const flatten = (css: string): FlatDeclaration[] => {
  const found: FlatDeclaration[] = []
  postcss.parse(css).walkDecls((node) => {
    const chain = ancestors(node)
    const selectors = chain.filter((item) => isRule(item)).map((item) => item.selector)
    found.push({
      atRules: chain.filter((item) => isAtRule(item)).map((item) => `@${item.name} ${item.params}`),
      selectors,
      owner: ownClass(selectors[0] ?? ''),
      property: node.prop,
      value: node.value,
      node,
    })
  })
  return found
}

/**
 * Splits a selector list at its top-level commas, so `&:disabled, &[aria-disabled="true"]` is two
 * selectors and `:not(:disabled, [x])` is one.
 */
export const splitSelectorList = (list: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (const [index, char] of [...list].entries()) {
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(list.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(list.slice(start).trim())
  return parts
}

/**
The selectors a rule matches by, with every `&` replaced by the rule it nests in.
 */
export const resolveSelectors = (rule: Rule): string[] => {
  const parentRule = ancestorRule(rule)
  const parents = parentRule === undefined ? [undefined] : resolveSelectors(parentRule)
  return splitSelectorList(rule.selector).flatMap((own) =>
    parents.map((parent) => (parent === undefined ? own : own.replaceAll('&', () => parent))),
  )
}

const ancestorRule = (rule: Rule): Rule | undefined =>
  ancestors(rule).findLast((item) => isRule(item))

export interface FlatRule {
  readonly atRules: readonly string[]
  readonly owner: string
  readonly rule: Rule
  /**
  Every selector the rule matches by, `&` resolved.
   */
  readonly selectors: readonly string[]
}

/**
Every rule of a stylesheet that is not just the `@layer` wrapper, in document order.
 */
export const flattenRules = (css: string): FlatRule[] => {
  const found: FlatRule[] = []
  postcss.parse(css).walkRules((rule) => {
    const chain = ancestors(rule)
    const outermost = [...chain, rule].find((item) => isRule(item))
    found.push({
      atRules: chain.filter((item) => isAtRule(item)).map((item) => `@${item.name} ${item.params}`),
      owner: ownClass(outermost?.type === 'rule' ? outermost.selector : ''),
      rule,
      selectors: resolveSelectors(rule),
    })
  })
  return found
}

/**
The ordered list AC-03 compares: (at-rule path, selector path, property, value).
 */
export const orderedList = (css: string): string[] =>
  flatten(css).map(
    (item) =>
      `${item.atRules.join(' > ')} | ${item.selectors.join(' > ')} | ${item.property}: ${item.value}`,
  )

/**
 * The classes a stylesheet styles, each taken from the outermost rule that owns it.
 */
export const classesOf = (css: string): Set<string> =>
  new Set(flattenRules(css).map((item) => item.owner))
