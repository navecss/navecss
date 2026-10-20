import type { AttributeState, PaintPart, PaintSubpath } from './browser-paths.ts'
import type { LoadedRegistry } from './load.ts'

/**
 * What the paint criterion needs to know about each styled part, read from the roster and the built
 * stylesheet: which atoms it takes, whether one carries the focus ring or a reduced-motion block,
 * and the attribute states and pseudo-elements the atoms' rules select.
 */
import { styledParts } from '../../../scripts/wrappers/roster.ts'
import { topName } from '../../../scripts/wrappers/subpaths.ts'
import { focusRingAtoms } from '../../../styles/atoms.ts'
import { flattenRules, readStylesheet } from '../stylesheet.ts'
import { styledSubpaths } from './styled-subpaths.ts'

type Rules = ReturnType<typeof flattenRules>

/**
The class an atom's rule is written for: `baseUiDialogPopup` is `nave-base-ui-dialog-popup`.
 */
const classOf = (atom: string): string =>
  `nave-base-ui-${atom
    .replace(/^baseUi/, '')
    .replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    .replace(/^-/, '')}`

const ATTRIBUTE = /^\[([\w-]+)(?:="([^"]*)")?\]/

/**
The attributes a selector tail is made of, when it is attributes and nothing else.
 */
const attributesOf = (tail: string): AttributeState[] | undefined => {
  const found: AttributeState[] = []
  let rest = tail
  while (rest !== '') {
    const match = ATTRIBUTE.exec(rest)
    if (match === null) return undefined
    found.push({ name: match[1]!, value: match[2] ?? '' })
    rest = rest.slice(match[0].length)
  }
  return found.length === 0 ? undefined : found
}

interface AtomFacts {
  readonly isGuarded: boolean
  readonly pseudoElements: Set<string>
  readonly states: Map<string, AttributeState[]>
}

const isGuard = (atRules: readonly string[]): boolean =>
  atRules.some((atRule) => atRule.includes('prefers-reduced-motion'))

const selectorTails = (selectors: readonly string[], className: string): string[] =>
  selectors
    .filter((selector) => selector.startsWith(className))
    .map((s) => s.slice(className.length))

const factsOf = (atom: string, rules: Rules): AtomFacts => {
  const owner = classOf(atom)
  const own = rules.filter((rule) => rule.owner === owner)
  const facts: AtomFacts = {
    isGuarded: own.some(({ atRules }) => isGuard(atRules)),
    pseudoElements: new Set(),
    states: new Map(),
  }
  const tails = own
    .filter(({ atRules }) => !isGuard(atRules))
    .flatMap(({ selectors }) => selectorTails(selectors, `.${owner}`))
  for (const tail of tails) {
    if (/^::[a-z-]+$/.test(tail)) facts.pseudoElements.add(tail)
    const attributes = attributesOf(tail)
    if (attributes !== undefined) facts.states.set(JSON.stringify(attributes), attributes)
  }
  return facts
}

const partOf = (key: string, atoms: readonly string[], rules: Rules): PaintPart => {
  const facts = atoms.map((atom) => factsOf(atom, rules))
  const states = new Map(facts.flatMap((fact) => [...fact.states]))
  return {
    atoms,
    isFocusable: atoms.some((atom) => focusRingAtoms.includes(atom)),
    isGuarded: facts.some((fact) => fact.isGuarded),
    key,
    pseudoElements: [...new Set(facts.flatMap((fact) => [...fact.pseudoElements]))],
    states: states.values().toArray(),
  }
}

/**
Every styled subpath, read from the manifest and the generated modules, with the parts the roster
styles for it and the folder its copy was written to (absent when the registry has no item for it).
 */
export const paintPlan = (registry: LoadedRegistry): PaintSubpath[] => {
  const rules = flattenRules(readStylesheet())
  return styledSubpaths().map((subpath) => ({
    copyFolder: registry.items.has(`base-ui-${subpath}`) ? `base-ui-${subpath}` : undefined,
    parts: Object.entries(styledParts)
      .filter(([key]) => key.split('.', 1)[0] === topName(subpath))
      .map(([key, part]) => partOf(key, part.atoms, rules)),
    subpath,
  }))
}
