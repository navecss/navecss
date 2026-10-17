/**
 * What the copies must carry of the package's focus ring and reduced-motion guard, and the strings
 * that must not claim more: the ring's longhands with their fallbacks, the guard's declarations as
 * the stylesheet has them, and no accessibility word in a registry string.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

import type { LoadedRegistry, RegistryItem } from './load.ts'

import { focusRingAtoms } from '../../../styles/atoms.ts'
import { PACKAGE_DIR } from '../stylesheet.ts'
import { FORBIDDEN } from '../w12-feedback-rules.ts'
import { cleared } from './cleared.ts'
import {
  compareEntries,
  type ItemModule,
  localName,
  moduleEntries,
  modulesOf,
  packageEntries,
  type RuleEntry,
} from './css-rules.ts'

const RING_SELECTOR = '&:focus-visible'
const REDUCED_MOTION = /^@media \(prefers-reduced-motion: ?reduce\)$/
const VAR_WITH_FALLBACK = /^var\(--[\w-]+, ?\S.*\)$/

const isRing = (entry: RuleEntry): boolean =>
  entry.selectors.length === 2 && entry.selectors[1] === RING_SELECTOR

const isGuard = (entry: RuleEntry): boolean =>
  entry.atRules.some((name) => REDUCED_MOTION.test(name))

/**
 * The atoms whose rule in the built stylesheet carries a reduced-motion block, by local name.
 */
export const guardedAtoms = (): Set<string> =>
  new Set(
    packageEntries()
      .filter((entry) => isGuard(entry))
      .map((entry) => entry.atom),
  )

export const focusableLocals = (): string[] => focusRingAtoms.map((name) => localName(name))

const ringProblemsOfAtom = (
  label: string,
  entries: readonly RuleEntry[],
  atom: string,
): string[] => {
  const ring = entries.filter((entry) => entry.atom === atom && isRing(entry))
  const property = (name: string): RuleEntry | undefined =>
    ring.find((entry) => entry.property === name)
  const where = `${label}: atom ${atom}`
  if (ring.length === 0) return [`${where} has no nested ${RING_SELECTOR} rule`]
  const problems = ['outline-style', 'outline-width', 'outline-color']
    .filter((name) => property(name) === undefined)
    .map((name) => `${where}: the ring has no ${name} longhand`)
  for (const name of ['outline-width', 'outline-color']) {
    const entry = property(name)
    if (entry !== undefined && !VAR_WITH_FALLBACK.test(entry.value)) {
      problems.push(`${where}: ${name} is ${entry.value}, not a var() with a fallback`)
    }
  }
  if (property('outline') !== undefined)
    problems.push(`${where}: the ring uses the outline shorthand`)
  return problems
}

/**
 * The ring problems of the named atoms in a list of reduced declarations.
 */
export const ringProblems = (
  label: string,
  entries: readonly RuleEntry[],
  atoms: readonly string[],
): string[] => atoms.flatMap((atom) => ringProblemsOfAtom(label, entries, atom))

const guardEntries = (entries: readonly RuleEntry[], atom: string): RuleEntry[] =>
  entries.filter((entry) => entry.atom === atom && isGuard(entry))

const guardProblems = (module: ItemModule, guarded: ReadonlySet<string>): string[] => {
  const atoms = module.atomNames.map((name) => localName(name)).filter((atom) => guarded.has(atom))
  const entries = moduleEntries(module.content)
  const source = packageEntries()
  return atoms.flatMap((atom) => {
    const expected = guardEntries(source, atom)
    const label = `${module.label}: guard of ${atom}`
    return expected.length === 0
      ? [`${label}: the package has none`]
      : compareEntries(label, expected, guardEntries(entries, atom))
  })
}

const moduleRingAtoms = (module: ItemModule): string[] =>
  module.atomNames.filter((name) => focusRingAtoms.includes(name)).map((name) => localName(name))

/**
 * The ring and guard problems of every module of a registry.
 */
export const paintProblems = (registry: LoadedRegistry): string[] => {
  const { found, problems } = modulesOf(registry)
  const guarded = guardedAtoms()
  return [
    ...problems,
    ...found.flatMap((module) => [
      ...ringProblems(module.label, moduleEntries(module.content), moduleRingAtoms(module)),
      ...guardProblems(module, guarded),
    ]),
  ]
}

/**
 * How many focusable and guarded atoms the items use between them: what a count is credited with.
 */
export const paintCounts = (registry: LoadedRegistry): { focusable: number; guarded: number } => {
  const { found } = modulesOf(registry)
  const guarded = guardedAtoms()
  return {
    focusable: found.reduce((sum, module) => sum + moduleRingAtoms(module).length, 0),
    guarded: found.reduce(
      (sum, module) => sum + module.atomNames.filter((name) => guarded.has(localName(name))).length,
      0,
    ),
  }
}

const ACCESSIBILITY_LINES = ['accessib', 'a11y', 'WCAG', String.raw`\bARIA\b`, 'keyboard']

/**
 * The accessibility words the criterion lists, as the tripwire list's own regular expressions
 * (compiled with the `i` flag), and the README's `FORBIDDEN`.
 */
export const accessibilityWords = (): RegExp[] => {
  const lines = cleared('W-list').split('\n')
  const picked = ACCESSIBILITY_LINES.map((source) => {
    const line = lines.find((candidate) => candidate === source)
    if (line === undefined) throw new Error(`the tripwire list has no line ${source}`)
    return new RegExp(line, 'i')
  })
  return [...picked, ...FORBIDDEN]
}

export interface Described {
  readonly text: string
  readonly where: string
}

const leaves = (value: unknown, where: string): Described[] => {
  if (typeof value === 'string') return [{ text: value, where }]
  if (Array.isArray(value))
    return value.flatMap((entry, index) => leaves(entry, `${where}[${index}]`))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) => leaves(entry, `${where}.${key}`))
  }
  return []
}

const itemStrings = (item: RegistryItem): Described[] => [
  { text: item.title, where: `${item.name}.title` },
  { text: item.description, where: `${item.name}.description` },
  { text: item.docs, where: `${item.name}.docs` },
  ...leaves(item.meta ?? {}, `${item.name}.meta`),
]

const CLI_SOURCE = path.join(PACKAGE_DIR, '../cli/src/index.ts')

/**
 * The strings the criterion names besides the items': the CLI's own file and its cleared lines,
 * and the README section's text outside the layer sentence.
 */
export const otherStrings = (): Described[] => {
  const layerSentence = cleared('S-b')
  const section = cleared('S-noform')
  if (!section.includes(layerSentence))
    throw new Error('S-noform does not carry the layer sentence')
  return [
    { text: readFileSync(CLI_SOURCE, 'utf8'), where: 'packages/cli/src/index.ts' },
    { text: cleared('C-doc'), where: 'C-doc' },
    { text: cleared('C-notyet'), where: 'C-notyet' },
    { text: cleared('C-add-help'), where: 'C-add-help' },
    { text: section.replace(layerSentence, ''), where: 'S-noform outside S-b' },
  ]
}

export const wordHits = (strings: readonly Described[]): string[] => {
  const words = accessibilityWords()
  return strings.flatMap((entry) =>
    words.filter((word) => word.test(entry.text)).map((word) => `${entry.where} matches ${word}`),
  )
}

/**
 * Every accessibility-word hit in the items' strings and the other strings.
 */
export const stringProblems = (registry: LoadedRegistry): string[] =>
  wordHits([...registry.items.values().flatMap((item) => itemStrings(item)), ...otherStrings()])

const editFirstRing = (css: string, edit: (ring: postcss.Rule) => void): string => {
  const root = postcss.parse(css)
  let isEdited = false
  root.walkRules(RING_SELECTOR, (rule) => {
    if (isEdited) return
    edit(rule)
    isEdited = true
  })
  if (!isEdited) throw new Error('the module has no ring to edit')
  return root.toString()
}

/**
 * The module with its first ring's outline width stripped of its fallback.
 */
export const withRingWidthWithoutFallback = (css: string): string =>
  editFirstRing(css, (ring) => {
    ring.walkDecls('outline-width', (declaration) => {
      declaration.value = 'var(--nave-border-width-focus)'
    })
  })

/**
 * The module with the `outline` shorthand added to its first ring.
 */
export const withOutlineShorthandInRing = (css: string): string =>
  editFirstRing(css, (ring) => {
    ring.append({ prop: 'outline', value: '2px solid currentColor' })
  })
