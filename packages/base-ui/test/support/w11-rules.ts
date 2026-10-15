/**
 * Rule-text readers for the feedback and navigation stylesheet criteria: a class's rule blocks as
 * the built sheet nests them, the declarations a state ends up with, a box shorthand spread over
 * its four edges, and a length with `calc()` resolved against the built tokens.
 */
import type { AtRule, Rule } from 'postcss'

import postcss from 'postcss'

import { attributeReads, selectorNodes } from './selector.ts'
import { flatten, splitSelectorList } from './stylesheet.ts'

export const PREFIX = 'nave-base-ui-'

/**
One declaration: its property and its value, whitespace collapsed.
 */
export type Entry = readonly [property: string, value: string]

export interface RuleBlock {
  /**
  The ancestor at-rules, outermost first, as `@name params`.
   */
  readonly atRules: readonly string[]
  /**
  The rules the block sits in, itself last, outermost first, as written.
   */
  readonly path: readonly string[]
  /**
  The block's own selector list, one string per alternative.
   */
  readonly selectors: readonly string[]
  readonly entries: readonly Entry[]
}

const squash = (text: string): string => text.replaceAll(/\s+/g, ' ').trim()

const entriesOf = (container: Rule): Entry[] =>
  container.nodes.flatMap((node) => (node.type === 'decl' ? [[node.prop, squash(node.value)]] : []))

const collect = (
  container: Rule | AtRule,
  path: readonly string[],
  atRules: readonly string[],
): RuleBlock[] => {
  const own: RuleBlock[] =
    container.type === 'rule'
      ? [
          {
            atRules,
            path,
            selectors: splitSelectorList(squash(container.selector)),
            entries: entriesOf(container),
          },
        ]
      : []
  const nested = (container.nodes ?? []).flatMap((child) => {
    if (child.type === 'rule') return collect(child, [...path, squash(child.selector)], atRules)
    if (child.type === 'atrule') {
      return collect(child, path, [...atRules, `@${child.name} ${squash(child.params)}`])
    }
    return []
  })
  return [...own, ...nested]
}

/**
Every rule block of a class, in document order: each top-level rule `.cls { ... }` of the sheet
(a later plant included), then the rules and at-rules nested in it, each as its own block.
 */
export const blocksOf = (css: string, cls: string): RuleBlock[] => {
  const found: RuleBlock[] = []
  postcss.parse(css).walkRules(`.${cls}`, (rule) => {
    if (rule.parent?.type !== 'rule') found.push(...collect(rule, [`.${cls}`], []))
  })
  return found
}

/**
Every declaration of the sheet whose outermost rule is the class, whatever it sits in or however
its selector is written (a compound top-level rule `.cls:hover` is the class's too).
 */
export const ownerEntries = (css: string, cls: string): Entry[] =>
  flatten(css)
    .filter((item) => item.owner === cls)
    .map((item): Entry => [item.property, squash(item.value)])

/**
Whether the class appears in any selector of the sheet.
 */
export const isMentioned = (css: string, cls: string): boolean =>
  new RegExp(String.raw`\.${cls}(?![\w-])`).test(css)

/**
The declarations at rest: the class's own rule, outside every nested rule and at-rule.
 */
export const restEntries = (blocks: readonly RuleBlock[]): Entry[] =>
  blocks.filter((b) => b.path.length === 1 && b.atRules.length === 0).flatMap((b) => b.entries)

/**
The nested rules that sit in no at-rule: the keyed rules.
 */
export const keyedBlocks = (blocks: readonly RuleBlock[]): RuleBlock[] =>
  blocks.filter((b) => b.path.length > 1 && b.atRules.length === 0)

/**
The blocks inside an at-rule.
 */
export const guardBlocks = (blocks: readonly RuleBlock[]): RuleBlock[] =>
  blocks.filter((b) => b.atRules.length > 0)

/**
Entries as `property: value` lines, sorted so the order of declarations does not matter.
 */
export const sortedLines = (entries: readonly Entry[]): string[] =>
  entries.map(([property, value]) => `${property}: ${value}`).toSorted((a, b) => a.localeCompare(b))

/**
Every declaration of a class, whatever it sits in.
 */
export const allEntries = (blocks: readonly RuleBlock[]): Entry[] =>
  blocks.flatMap((b) => [...b.entries])

export const GUARD_QUERY = '@media (prefers-reduced-motion: reduce)'
export const GUARD_ENTRY: Entry = [
  'transition-duration',
  'calc(0 * var(--nave-motion-duration-fast))',
]

/**
Whether the block is the reduced-motion guard rule of the form `&{ transition-duration: calc(0 * ...) }`.
 */
export const isGuardRule = (block: RuleBlock): boolean =>
  block.atRules.length === 1 &&
  block.atRules[0] === GUARD_QUERY &&
  block.path.length === 2 &&
  block.selectors.length === 1 &&
  block.selectors[0] === '&' &&
  sortedLines(block.entries).join('|') === sortedLines([GUARD_ENTRY]).join('|')

/**
The sheet with a rule planted last in the component layer.
 */
export const planted = (css: string, rule: string): string =>
  `${css}\n@layer components.nave { ${rule} }`

/**
The sheet with every top-level rule of the class taken out and the given rule text planted in its
place (last, in the component layer). A sheet without the class just gains the rule.
 */
export const replaced = (css: string, cls: string, rule: string): string => {
  const root = postcss.parse(css)
  root.walkRules(`.${cls}`, (found) => {
    if (found.parent?.type !== 'rule') found.remove()
  })
  return planted(root.toString(), rule)
}

export type AttributeState = Readonly<Record<string, string>>

const isKeyedBy = (selector: string, state: AttributeState): boolean =>
  selectorNodes(selector).every(
    ({ node }) => node.type === 'nesting' || node.type === 'attribute',
  ) &&
  attributeReads(selector).every((read) =>
    read.operator === undefined ? state[read.name] !== undefined : state[read.name] === read.value,
  )

/**
Whether the block's declarations reach an element that carries the given attributes: the class's
own rule always, a rule nested once when one of its alternatives is `&` and attribute selectors
all met by the state. Anything under an at-rule or nested deeper does not apply.
 */
const isApplied = (block: RuleBlock, state: AttributeState): boolean => {
  if (block.atRules.length > 0 || block.path.length > 2) return false
  if (block.path.length === 1) return true
  return block.selectors.some((selector) => isKeyedBy(selector, state))
}

/**
The declarations a class ends up with on an element carrying the attributes, later ones winning.
 */
export const effective = (
  blocks: readonly RuleBlock[],
  state: AttributeState = {},
): Map<string, string> =>
  new Map(blocks.filter((block) => isApplied(block, state)).flatMap((block) => [...block.entries]))

/**
The same declarations as `effective`, but each one separately and in the order they apply, so a
shorthand and the longhand after it are both seen.
 */
export const effectiveOrdered = (blocks: readonly RuleBlock[], state: AttributeState): Entry[] =>
  blocks.filter((block) => isApplied(block, state)).flatMap((block) => [...block.entries])

/**
The text of one class rule as the sheet prints it: from its two leading spaces to the line before
the next class rule or the layer's closing brace. Undefined when the class has no rule.
 */
export const ruleText = (css: string, cls: string): string | undefined => {
  const all = css.split('\n')
  const start = all.findIndex((line) => line.startsWith(`  .${cls} `))
  if (start === -1) return undefined
  const after = all.slice(start + 1).findIndex((line) => /^ {2}\./.test(line) || line === '}')
  return all.slice(start, after === -1 ? undefined : start + 1 + after).join('\n')
}

/**
The names of the pseudo-classes and pseudo-elements a selector holds.
 */
export const pseudosOf = (selector: string): string[] =>
  selectorNodes(selector).flatMap(({ node }) => (node.type === 'pseudo' ? [node.value] : []))
