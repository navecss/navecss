/**
 * Reading the rules of a copied CSS Module and of the package stylesheet the same way, so the two
 * can be compared: each declaration reduced to its at-rule path, selector path, property, value and
 * importance, with comments and whitespace gone. The package side is read with `components.nave`
 * as `components.consumer` and each `.nave-base-ui-<x>` as the local name of its atom.
 */
import type { AtomName } from '@navecss/core/atoms'
import type { AtRule, ChildNode, Container, Declaration, Document, Rule } from 'postcss'

import { toClassName } from '@navecss/core/atoms'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

import { atoms } from '../../../styles/atoms.ts'
import { PACKAGE_DIR, readStylesheet } from '../stylesheet.ts'
import { fileOf, type LoadedRegistry, type RegistryItem } from './load.ts'
import { styledSubpaths } from './styled-subpaths.ts'

export interface RuleEntry {
  /**
  The local name of the atom whose rule holds the declaration, or '' when no class rule does.
   */
  readonly atom: string
  readonly atRules: readonly string[]
  readonly important: boolean
  readonly property: string
  readonly selectors: readonly string[]
  readonly value: string
}

/**
The local name of an atom: its name minus `baseUi`, first letter lower-cased.
 */
export const localName = (atomName: string): string =>
  atomName.replace(/^baseUi/, '').replace(/^./, (first) => first.toLowerCase())

export const atomNames = (): string[] => Object.keys(atoms)

const classOf = (atomName: string): string => toClassName(atomName as AtomName)

const LOCAL_BY_CLASS: ReadonlyMap<string, string> = new Map(
  atomNames().map((name) => [classOf(name), localName(name)]),
)

const CLASS_TOKEN = /nave-base-ui-[a-z0-9-]+/g

/**
 * The atoms an item's parts use, in the stylesheet's order: those whose class a generated module
 * names. A class the module names that no atom has is an error, not a silent omission.
 */
export const itemAtoms = (subpath: string): string[] => {
  const generated = readFileSync(
    path.join(PACKAGE_DIR, 'src', subpath, 'parts.generated.ts'),
    'utf8',
  )
  const named = new Set(generated.match(CLASS_TOKEN))
  const unknown = [...named].filter((name) => !LOCAL_BY_CLASS.has(name))
  if (unknown.length > 0)
    throw new Error(`${subpath} names classes no atom has: ${unknown.join(', ')}`)
  return atomNames().filter((name) => named.has(classOf(name)))
}

const collapse = (text: string): string => text.replaceAll(/\s+/g, ' ').trim()

const withoutPaddingInParens = (text: string): string =>
  text.replaceAll(/\(\s+/g, '(').replaceAll(/\s+\)/g, ')')

/**
 * A selector with its layout undone: runs of whitespace are one space, none sits inside brackets
 * or parentheses, and a comma or combinator has the spacing Prettier gives it.
 */
export const normalizeSelector = (selector: string): string =>
  withoutPaddingInParens(collapse(selector))
    .replaceAll(/\s*,\s*/g, ', ')
    .replaceAll(/\s*([+>~])\s*/g, ' $1 ')

const renameClasses = (selector: string): string =>
  selector.replaceAll(CLASS_TOKEN, (name) => LOCAL_BY_CLASS.get(name) ?? name)

const readAsConsumer = (atRule: string): string =>
  atRule === '@layer components.nave' ? '@layer components.consumer' : atRule

const ancestorsOf = (node: ChildNode): Container[] => {
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

const atomOfSelector = (selector: string | undefined): string => {
  const match = /^\.([\w-]+)$/.exec(selector ?? '')
  return match?.[1] ?? ''
}

const entryOf = (node: Declaration, isPackage: boolean): RuleEntry => {
  const chain = ancestorsOf(node)
  const selectors = chain
    .filter((item) => isRule(item))
    .map((item) => normalizeSelector(item.selector))
    .map((selector) => (isPackage ? renameClasses(selector) : selector))
  const atRules = chain
    .filter((item) => isAtRule(item))
    .map((item) => collapse(`@${item.name} ${item.params}`))
    .map((name) => (isPackage ? readAsConsumer(name) : name))
  return {
    atom: atomOfSelector(selectors[0]),
    atRules,
    important: node.important,
    property: node.prop,
    selectors,
    value: withoutPaddingInParens(collapse(node.value)),
  }
}

const entriesOf = (css: string, isPackage: boolean): RuleEntry[] => {
  const found: RuleEntry[] = []
  postcss.parse(css).walkDecls((node) => {
    found.push(entryOf(node, isPackage))
  })
  return found
}

/**
The declarations of a copied module, reduced.
 */
export const moduleEntries = (css: string): RuleEntry[] => entriesOf(css, false)

/**
The declarations of the package stylesheet, reduced and read as a copy would hold them.
 */
export const packageEntries = (): RuleEntry[] => entriesOf(readStylesheet(), true)

/**
The package's reduced declarations cut to the rules of the given atoms, in the stylesheet's order.
 */
export const packageEntriesFor = (atomNamesOfItem: readonly string[]): RuleEntry[] => {
  const wanted = new Set(atomNamesOfItem.map((name) => localName(name)))
  return packageEntries().filter((entry) => wanted.has(entry.atom))
}

export const formatEntry = (entry: RuleEntry): string =>
  `${entry.atRules.join(' > ')} | ${entry.selectors.join(' > ')} | ${entry.property}: ${entry.value}${entry.important ? ' !important' : ''}`

const describe = (entry: RuleEntry | undefined): string =>
  entry === undefined ? 'absent' : formatEntry(entry)

/**
 * What differs between an expected and an actual list, as one problem naming the module and the
 * atom at the first difference, or nothing when they are equal, order included.
 */
export const compareEntries = (
  label: string,
  expected: readonly RuleEntry[],
  actual: readonly RuleEntry[],
): string[] => {
  const length = Math.max(expected.length, actual.length)
  for (let index = 0; index < length; index += 1) {
    const want = expected[index]
    const got = actual[index]
    if (describe(want) !== describe(got)) {
      return [
        `${label}: atom ${want?.atom ?? got?.atom ?? ''}: declaration ${index} is ${describe(got)}, expected ${describe(want)}`,
      ]
    }
  }
  return []
}

/**
 * The subpath an item serves, read from its name.
 */
export const subpathOf = (item: RegistryItem): string => item.name.replace(/^base-ui-/, '')

export const moduleBase = (subpath: string): string => `nave-${subpath}.module.css`

export interface ItemModule {
  readonly atomNames: readonly string[]
  readonly content: string
  readonly item: RegistryItem
  readonly label: string
  readonly subpath: string
}

/**
 * Every styled subpath's item and module text, from the manifest and generated modules. An item
 * the registry lacks is a problem to report, so it is returned apart.
 */
export const modulesOf = (
  registry: LoadedRegistry,
): { found: ItemModule[]; problems: string[] } => {
  const found: ItemModule[] = []
  const problems: string[] = []
  for (const subpath of styledSubpaths()) {
    const item = registry.items.get(`base-ui-${subpath}`)
    if (item === undefined) {
      problems.push(`base-ui-${subpath}: no item`)
      continue
    }
    try {
      const content = fileOf(item, moduleBase(subpath))
      found.push({
        atomNames: itemAtoms(subpath),
        content,
        item,
        label: moduleBase(subpath),
        subpath,
      })
    } catch {
      problems.push(`${item.name}: no file ${moduleBase(subpath)}`)
    }
  }
  return { found, problems }
}

/**
 * A copy of a registry in which one item's module has other text. The item it names must exist.
 */
export const withModule = (
  registry: LoadedRegistry,
  subpath: string,
  rewrite: (css: string) => string,
): LoadedRegistry => {
  const item = registry.items.get(`base-ui-${subpath}`)
  const file = item?.files.find((candidate) => candidate.target.endsWith(moduleBase(subpath)))
  if (file?.content === undefined) throw new Error(`base-ui-${subpath} has no module to rewrite`)
  file.content = rewrite(file.content)
  return registry
}

export const byCodeUnit = (a: string, b: string): number => {
  if (a === b) return 0
  return a < b ? -1 : 1
}
