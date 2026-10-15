/**
 * Flattens the `@layer atomic` blocks of a stylesheet to one entry per selector member, with every
 * nested selector resolved against its parent and the at-rules it sits in, so two layers can be
 * compared rule for rule whether a rule is nested or written out.
 */
import type { AtRule, ChildNode, Container } from 'postcss'

import { atomClassMap } from '@navecss/core/atoms'
import postcss from 'postcss'

export interface FlatEntry {
  /**
   * The enclosing media, container and supports at-rules, outermost first.
   */
  readonly atRules: readonly string[]
  /**
   * The declarations the entry carries, as `property: value`, in source order.
   */
  readonly declarations: readonly string[]
  /**
   * One selector member, any nested selector resolved against its parent.
   */
  readonly selector: string
}

export interface LayerComparison {
  /**
   * Entries the reference has for an emitted atom that the trimmed layer lacks.
   */
  readonly missing: readonly string[]
  /**
   * Entries of the trimmed layer that belong to an atom outside the emitted set.
   */
  readonly outside: readonly string[]
  /**
   * Entries of the trimmed layer the reference does not have, as written.
   */
  readonly unexpected: readonly string[]
}

const GROUPING_AT_RULES = new Set(['container', 'media', 'supports'])

const CLASS_TO_ATOM = new Map(Object.entries(atomClassMap).map(([name, text]) => [text, name]))

/**
 * The text with every run of whitespace collapsed to one space.
 */
function squash(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim()
}

/**
 * The members of a selector list, split on the commas outside parentheses and brackets.
 */
function membersOf(selector: string): string[] {
  const members: string[] = []
  let depth = 0
  let start = 0
  for (const [index, character] of [...selector].entries()) {
    if ('(['.includes(character)) depth += 1
    else if (')]'.includes(character)) depth -= 1
    else if (character === ',' && depth === 0) {
      members.push(selector.slice(start, index))
      start = index + 1
    }
  }
  members.push(selector.slice(start))
  return members.map((member) => squash(member)).filter((member) => member !== '')
}

/**
 * The members of `selector` resolved against the members of the rule it is nested in.
 */
function resolveAgainst(parents: readonly string[], selector: string): string[] {
  const members = membersOf(selector)
  if (parents.length === 0) return members
  return parents.flatMap((parent) =>
    members.map((member) =>
      member.includes('&') ? member.split('&').join(parent) : `${parent} ${member}`,
    ),
  )
}

/**
 * Adds the entries of a container's own declarations, then walks its nested rules and at-rules.
 */
function walk(
  container: Container,
  parents: readonly string[],
  atRules: readonly string[],
  into: FlatEntry[],
): void {
  const declarations = (container.nodes ?? [])
    .filter((node) => node.type === 'decl')
    .map((node) => squash(`${node.prop}: ${node.value}`))
  if (declarations.length > 0) {
    for (const selector of parents) into.push({ atRules, declarations, selector })
  }
  const children = container.nodes ?? []
  for (const child of children) walkChild(child, parents, atRules, into)
}

/**
 * Walks one child: a rule resolves its selector, a grouping at-rule adds itself to the chain.
 */
function walkChild(
  child: ChildNode,
  parents: readonly string[],
  atRules: readonly string[],
  into: FlatEntry[],
): void {
  if (child.type === 'rule') {
    walk(child, resolveAgainst(parents, child.selector), atRules, into)
  } else if (child.type === 'atrule' && GROUPING_AT_RULES.has(child.name)) {
    walk(child, parents, [...atRules, squash(`@${child.name} ${child.params}`)], into)
  }
}

/**
 * Whether the at-rule is a block `@layer atomic { ... }`.
 */
function isAtomicBlock(rule: AtRule): boolean {
  return rule.name === 'layer' && rule.params.trim() === 'atomic' && rule.nodes !== undefined
}

/**
 * Every entry of every `@layer atomic` block of `css`, sorted by key.
 */
export function flattenAtomic(css: string): FlatEntry[] {
  const entries: FlatEntry[] = []
  postcss.parse(css).walkAtRules('layer', (rule) => {
    if (isAtomicBlock(rule)) walk(rule, [], [], entries)
  })
  return entries.toSorted((a, b) => entryKey(a).localeCompare(entryKey(b)))
}

/**
 * A string naming an entry by its at-rules, its selector and its declarations.
 */
export function entryKey(entry: FlatEntry): string {
  return `${entry.atRules.join(' ')} | ${entry.selector} | ${entry.declarations.join('; ')}`
}

/**
 * The built-in atoms whose class a selector names, by atom name.
 */
export function atomsNamedBy(selector: string): string[] {
  const classes = selector
    .matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)
    .map((match) => match[1]!)
    .toArray()
  const names = classes.map((name) => CLASS_TO_ATOM.get(name))
  return [...new Set(names.filter((name): name is string => name !== undefined))]
}

/**
 * Compares a trimmed layer with the reference layer for an emitted set: every reference entry of
 * an emitted atom must be in the trimmed layer, and the trimmed layer must hold no entry of any
 * other atom, nor any entry the reference lacks.
 */
export function compareLayers(
  trimmed: string,
  reference: string,
  emitted: readonly string[],
): LayerComparison {
  const wanted = new Set(emitted)
  const have = flattenAtomic(trimmed)
  const full = flattenAtomic(reference)
  const trimmedKeys = new Set(have.map((entry) => entryKey(entry)))
  const fullKeys = new Set(full.map((entry) => entryKey(entry)))
  const ofEmitted = full.filter((entry) =>
    atomsNamedBy(entry.selector).some((atom) => wanted.has(atom)),
  )
  return {
    missing: ofEmitted.map((entry) => entryKey(entry)).filter((key) => !trimmedKeys.has(key)),
    outside: have
      .filter((entry) => atomsNamedBy(entry.selector).some((atom) => !wanted.has(atom)))
      .map((entry) => entryKey(entry)),
    unexpected: [...trimmedKeys.difference(fullKeys)],
  }
}

/**
 * The entries whose selector names the atom, by atom name.
 */
export function entriesOf(entries: readonly FlatEntry[], atom: string): FlatEntry[] {
  return entries.filter((entry) => atomsNamedBy(entry.selector).includes(atom))
}
