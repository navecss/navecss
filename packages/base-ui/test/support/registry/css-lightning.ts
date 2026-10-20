/**
 * Lightning CSS's CSS Modules transform over a copied module, and what must survive it: every
 * `:focus-visible` rule, every reduced-motion guard and every `outline` declaration of the source,
 * inside `@layer components.consumer`, and Nave's seven layers registered in Nave's order. Lightning
 * CSS renames the module's classes and may reorder or rewrite other declarations, so the parts that
 * are compared are the ones the criterion names.
 */
import type { Root } from 'postcss'

import { transform } from 'lightningcss'
import postcss from 'postcss'

import { byCodeUnit, formatEntry, moduleEntries, type RuleEntry } from './css-rules.ts'
import { orderStatement } from './css-shape.ts'

const CONSUMER = '@layer components.consumer'
const GUARD = /^\(prefers-reduced-motion: ?reduce\)$/

export interface Transformed {
  readonly css: string
  readonly exports: Readonly<Record<string, { readonly name: string }>>
}

/**
 * Lightning CSS prints `::before` as `:before`, the same pseudo-element with the same specificity.
 */
const withDoubleColonPseudoElements = (css: string): string =>
  css.replaceAll(/(?<!:):(before|after|first-line|first-letter)\b/g, '::$1')

/**
 * The module through Lightning CSS's CSS Modules transform, with the hashed class names given back
 * their local names so selectors can be compared.
 */
export const transformModule = (label: string, text: string): Transformed => {
  const result = transform({ code: Buffer.from(text), cssModules: true, filename: label })
  const exported = result.exports ?? {}
  let css = result.code.toString()
  for (const [local, { name }] of Object.entries(exported)) {
    css = css.replaceAll(new RegExp(String.raw`\.${name}(?![\w-])`, 'g'), () => `.${local}`)
  }
  return { css: withDoubleColonPseudoElements(css), exports: exported }
}

const guardRules = (root: Root): number => {
  let count = 0
  root.walkAtRules('media', (rule) => {
    if (GUARD.test(rule.params)) count += 1
  })
  return count
}

const focusRules = (root: Root): number => {
  let count = 0
  root.walkRules((rule) => {
    if (rule.selector.includes(':focus-visible')) count += 1
  })
  return count
}

export interface Counts {
  readonly focusRules: number
  readonly guards: number
  readonly outlines: number
}

/**
 * The counts the criterion compares, for a module's text or Lightning CSS's output.
 */
export const countsOf = (css: string): Counts => {
  const root = postcss.parse(css)
  let outlines = 0
  root.walkDecls(/^outline/, () => {
    outlines += 1
  })
  return { focusRules: focusRules(root), guards: guardRules(root), outlines }
}

const isFocus = (entry: RuleEntry): boolean =>
  entry.selectors.some((selector) => selector.includes(':focus-visible'))
const isOutline = (entry: RuleEntry): boolean => entry.property.startsWith('outline')
const isGuard = (entry: RuleEntry): boolean =>
  entry.atRules.some((name) => name.includes('prefers-reduced-motion'))

const asLines = (entries: readonly RuleEntry[]): string[] =>
  entries.map((entry) => formatEntry(entry)).toSorted(byCodeUnit)

const asGuardLines = (entries: readonly RuleEntry[]): string[] =>
  entries.map((entry) => `${entry.atom} | ${entry.property}: ${entry.value}`).toSorted(byCodeUnit)

const sameLines = (label: string, what: string, source: string[], output: string[]): string[] => {
  const lacking = source.find((line) => !output.includes(line))
  if (lacking !== undefined)
    return [`${label}: ${what} of the source is not in the output: ${lacking}`]
  const extra = output.find((line) => !source.includes(line))
  if (extra !== undefined) return [`${label}: ${what} in the output is not in the source: ${extra}`]
  return source.length === output.length ? [] : [`${label}: ${what} differ in number`]
}

const countProblems = (label: string, source: Counts, output: Counts): string[] =>
  (['focusRules', 'guards', 'outlines'] as const)
    .filter((key) => source[key] !== output[key])
    .map((key) => `${label}: ${source[key]} ${key} in the source, ${output[key]} in the output`)

const placementProblems = (label: string, entries: readonly RuleEntry[]): string[] =>
  entries
    .filter((entry) => entry.atRules[0] !== CONSUMER)
    .map((entry) => `${label}: ${entry.property} of ${entry.atom} is outside ${CONSUMER}`)

const layerNames = (css: string): string[] => {
  const names: string[] = []
  postcss.parse(css).walkAtRules('layer', (rule) => {
    const registered = rule.params.split(',').map((part) => part.trim())
    for (const name of registered) {
      if (name !== '' && !names.includes(name)) names.push(name)
    }
  })
  return names
}

const layerProblems = (label: string, output: string): string[] => {
  const expected = orderStatement()
    .replace(/^@layer /, '')
    .replace(/;$/, '')
    .split(', ')
  const found = layerNames(output)
  return found.join(', ') === expected.join(', ')
    ? []
    : [
        `${label}: the output registers layers as ${found.join(', ')}, expected ${expected.join(', ')}`,
      ]
}

/**
 * What the transform lost or changed of the source's focus rules, guards, outline declarations and
 * layer order.
 */
export const lightningProblems = (label: string, source: string, output: Transformed): string[] => {
  const sourceEntries = moduleEntries(source)
  const outputEntries = moduleEntries(output.css)
  return [
    ...countProblems(label, countsOf(source), countsOf(output.css)),
    ...sameLines(
      label,
      'focus rules',
      asLines(sourceEntries.filter((entry) => isFocus(entry))),
      asLines(outputEntries.filter((entry) => isFocus(entry))),
    ),
    ...sameLines(
      label,
      'outline declarations',
      asLines(sourceEntries.filter((entry) => isOutline(entry))),
      asLines(outputEntries.filter((entry) => isOutline(entry))),
    ),
    ...sameLines(
      label,
      'guard declarations',
      asGuardLines(sourceEntries.filter((entry) => isGuard(entry))),
      asGuardLines(outputEntries.filter((entry) => isGuard(entry))),
    ),
    ...placementProblems(
      label,
      outputEntries.filter((entry) => isFocus(entry) || isOutline(entry) || isGuard(entry)),
    ),
    ...layerProblems(label, output.css),
  ]
}

/**
 * The module with its first reduced-motion guard removed.
 */
export const withoutAGuard = (text: string): string => {
  const root = postcss.parse(text)
  let isRemoved = false
  root.walkAtRules('media', (rule) => {
    if (isRemoved || !GUARD.test(rule.params)) {
      return
    }

    rule.remove()
    isRemoved = true
  })
  if (!isRemoved) throw new Error('the module has no guard to remove')
  return root.toString()
}
