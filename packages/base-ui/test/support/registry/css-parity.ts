/**
 * The rule-parity check over the registry's CSS Modules, and the three edits a control plants in a
 * module: one value changed, one nested rule dropped, two atoms' rules swapped.
 */
import type { Container, Document, Root, Rule } from 'postcss'

import postcss from 'postcss'

import type { LoadedRegistry } from './load.ts'

import {
  compareEntries,
  type ItemModule,
  localName,
  moduleEntries,
  modulesOf,
  packageEntriesFor,
} from './css-rules.ts'

const CLASS_ONLY = /^\.[A-Za-z][\w-]*$/

const hasRuleAncestor = (rule: Rule): boolean => {
  let parent: Container | Document | undefined = rule.parent
  while (parent !== undefined) {
    if (parent.type === 'rule') return true
    parent = parent.parent
  }
  return false
}

const outermostRules = (root: Root): Rule[] => {
  const found: Rule[] = []
  root.walkRules((rule) => {
    if (!hasRuleAncestor(rule)) found.push(rule)
  })
  return found
}

const allSelectors = (css: string): string[] => {
  const found: string[] = []
  postcss.parse(css).walkRules((rule) => {
    found.push(rule.selector)
  })
  return found
}

const strayRules = (module: ItemModule): string[] => {
  const allowed = new Set(module.atomNames.map((name) => `.${localName(name)}`))
  return outermostRules(postcss.parse(module.content))
    .map((rule) => rule.selector)
    .filter((selector) => !CLASS_ONLY.test(selector) || !allowed.has(selector))
    .map(
      (selector) =>
        `${module.label}: a rule for ${selector}, which is not an atom of ${module.item.name}`,
    )
}

const selectorProblems = (module: ItemModule): string[] =>
  allSelectors(module.content)
    .filter((selector) => selector.includes('nave-base-ui-'))
    .map((selector) => `${module.label}: selector ${selector} still names the package's class`)

const moduleProblems = (module: ItemModule): string[] => {
  const expected = packageEntriesFor(module.atomNames)
  if (expected.length === 0) return [`${module.label}: the package has no rules for its atoms`]
  return [
    ...compareEntries(module.label, expected, moduleEntries(module.content)),
    ...selectorProblems(module),
    ...strayRules(module),
  ]
}

/**
 * Every problem rule parity finds: a module whose declarations, after the class rename and the
 * layer name are undone, differ from the package's rules for the item's atoms, in content or in
 * order; a selector that still names the package's class; a rule for an atom the item does not use.
 */
export const ruleParityProblems = (registry: LoadedRegistry): string[] => {
  const { found, problems } = modulesOf(registry)
  return [...problems, ...found.flatMap((module) => moduleProblems(module))]
}

const withRoot = (css: string, edit: (root: Root) => void): string => {
  const root = postcss.parse(css)
  edit(root)
  return root.toString()
}

const rulesByLocalName = (root: Root): Map<string, Rule> =>
  new Map(outermostRules(root).map((rule) => [rule.selector.replace(/^\./, ''), rule]))

/**
 * Changes the value of the first plain declaration of the named atom's rule, to a value it does
 * not already have.
 */
export const changeAValue = (css: string, atom: string): string =>
  withRoot(css, (root) => {
    const declaration = rulesByLocalName(root)
      .get(atom)
      ?.nodes.find((node) => node.type === 'decl')
    if (declaration?.type !== 'decl') throw new Error(`${atom} has no declaration to change`)
    declaration.value = declaration.value === 'unset' ? 'revert' : 'unset'
  })

/**
 * Drops the first state rule nested in the named atom's rule that has declarations of its own.
 */
export const dropANestedRule = (css: string, atom: string): string =>
  withRoot(css, (root) => {
    const nested = rulesByLocalName(root)
      .get(atom)
      ?.nodes.find(
        (node) => node.type === 'rule' && node.nodes.some((child) => child.type === 'decl'),
      )
    if (nested === undefined) throw new Error(`${atom} has no nested rule to drop`)
    nested.remove()
  })

/**
 * Swaps the places of two atoms' rules.
 */
export const swapTwoAtoms = (css: string, first: string, second: string): string =>
  withRoot(css, (root) => {
    const rules = rulesByLocalName(root)
    const one = rules.get(first)
    const two = rules.get(second)
    if (one === undefined || two === undefined) throw new Error(`no rules for ${first}, ${second}`)
    const oneCopy = one.clone()
    const twoCopy = two.clone()
    one.replaceWith(twoCopy)
    two.replaceWith(oneCopy)
  })

/**
 * The atoms of a module in file order, by local name.
 */
export const atomsInModule = (css: string): string[] =>
  outermostRules(postcss.parse(css)).map((rule) => rule.selector.replace(/^\./, ''))

/**
 * The first atom of a module whose rule has a plain declaration, and the first with a nested
 * state rule that declares something: what a control edits.
 */
const nameOf = (rule: Rule | undefined): string | undefined => rule?.selector.replace(/^\./, '')

export const controlTargets = (
  css: string,
): { nested: string | undefined; plain: string | undefined } => {
  const rules = outermostRules(postcss.parse(css))
  return {
    nested: nameOf(
      rules.find((rule) =>
        rule.nodes.some(
          (node) => node.type === 'rule' && node.nodes.some((child) => child.type === 'decl'),
        ),
      ),
    ),
    plain: nameOf(rules.find((rule) => rule.nodes.some((node) => node.type === 'decl'))),
  }
}
