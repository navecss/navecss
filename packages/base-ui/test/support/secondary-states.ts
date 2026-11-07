/**
 * What the secondary action states criteria read: the four keys byte for byte as the spec gives
 * them, the key lists the two atoms had before the keys existed, and readers for the nested state
 * rules of one class of the built stylesheet.
 */
import type { Declaration, Root, Rule } from 'postcss'

import postcss from 'postcss'

import { selectorNodes } from './selector.ts'

export const BUTTON = 'nave-base-ui-button'
export const TOGGLE = 'nave-base-ui-toggle'

const NOT_DISABLED = ':not(:disabled, [aria-disabled="true"])'
const NOT_VARIANT = ':not([data-nave-variant="primary"], [data-nave-variant="ghost"])'

export const HOVER_VALUE = 'var(--nave-color-action-secondary-hover)'
export const ACTIVE_VALUE = 'var(--nave-color-action-secondary-active)'

/**
The two Button keys of the spec's R6, hover before active.
 */
export const BUTTON_KEYS = [
  `&${NOT_VARIANT}:hover${NOT_DISABLED}`,
  `&${NOT_VARIANT}:active${NOT_DISABLED}`,
] as const

/**
The two Toggle keys of the spec's R7, hover before active.
 */
export const TOGGLE_KEYS = [`&:hover${NOT_DISABLED}`, `&:active${NOT_DISABLED}`] as const

/**
The keys `baseUiButton` had, in order, before the secondary states: ends with the ghost open key.
 */
export const BUTTON_KEYS_BEFORE = [
  '&[data-nave-size="sm"]',
  '&[data-nave-variant="primary"]',
  `&[data-nave-variant="primary"]:hover${NOT_DISABLED}`,
  `&[data-nave-variant="primary"]:active${NOT_DISABLED}`,
  '&:disabled, &[aria-disabled="true"]',
  '&[data-nave-variant="ghost"]',
  `&[data-nave-variant="ghost"]:hover${NOT_DISABLED}`,
  `&[data-nave-variant="ghost"]:active${NOT_DISABLED}`,
  `&[data-nave-variant="ghost"][aria-expanded="true"]${NOT_DISABLED}`,
] as const

/**
The keys `baseUiToggle` had, in order, before the secondary states: ends with the disabled key.
 */
export const TOGGLE_KEYS_BEFORE = [
  '&[data-nave-size="sm"]',
  '&[aria-pressed="true"]::after',
  '&:disabled, &[aria-disabled="true"]',
] as const

/**
The nested rules of a class in a stylesheet, in order, the class rule's own declarations left out.
 */
export const nestedRules = (css: string, className: string): Rule[] => {
  const root: Root = postcss.parse(css)
  let found: Rule[] = []
  root.walkRules(`.${className}`, (rule) => {
    found = rule.nodes.filter((node): node is Rule => node.type === 'rule')
  })
  return found
}

/**
The selectors of the nested rules of a class that are not the two `focusRing` entries closing it.
 */
export const stateKeysOf = (css: string, className: string): string[] =>
  nestedRules(css, className)
    .map((rule) => rule.selector)
    .filter((selector) => selector !== '&' && selector !== '&:focus-visible')

export const declarationsOf = (rule: Rule): Declaration[] =>
  rule.nodes.filter((node): node is Declaration => node.type === 'decl')

/**
Whether a selector has `:hover` or `:active` outside any `:not()`.
 */
export const hasUserAction = (selector: string): boolean =>
  selectorNodes(selector).some(
    ({ node, inside }) =>
      node.type === 'pseudo' &&
      (node.value === ':hover' || node.value === ':active') &&
      !inside.includes(':not'),
  )

/**
The user-action pseudo-classes a selector has outside any `:not()`, in order.
 */
export const userActions = (selector: string): string[] =>
  selectorNodes(selector).flatMap(({ node, inside }) =>
    node.type === 'pseudo' &&
    (node.value === ':hover' || node.value === ':active') &&
    !inside.includes(':not')
      ? [node.value]
      : [],
  )

/**
The four keys of both classes of a stylesheet, as `[class, selector, rule]`.
 */
export const secondaryStateRules = (css: string): [string, string, Rule][] =>
  [BUTTON, TOGGLE].flatMap((className) =>
    nestedRules(css, className)
      .filter((rule) => hasUserAction(rule.selector))
      .map((rule): [string, string, Rule] => [className, rule.selector, rule]),
  )

/**
What is wrong with a list of keys against the list it must be: the keys missing, the keys that
should not be there, and the first position at which the order differs, each naming the key.
 */
export const keyListProblems = (
  actual: readonly string[],
  expected: readonly string[],
): string[] => {
  const problems = [
    ...expected.filter((key) => !actual.includes(key)).map((key) => `missing: ${key}`),
    ...actual.filter((key) => !expected.includes(key)).map((key) => `extra: ${key}`),
  ]
  const at = expected.findIndex((key, index) => actual[index] !== key)
  return at !== -1 && problems.length === 0
    ? [`out of order at ${at}: ${actual[at] ?? '(end)'} where ${expected[at] ?? '(end)'}`]
    : problems
}
