/**
 * The stylesheet of every signature state, derived by taking text out of the all-signed one: a
 * draft that is unsigned removes its own rules and nothing else. The derivation is textual on
 * purpose, so it shares no code with the build it is compared with.
 */
import { createHash } from 'node:crypto'

import { isFocusRingDeclaration } from './focus.ts'
import { flatten } from './stylesheet.ts'

/**
The six signature drafts. An unsigned draft takes its classes, and the rows that need them, out of the stylesheet and Table P.
 */
export const DRAFTS = ['pdy1', '2uuv', 'abv1', 'qok6', 'd8l7', 'qglc'] as const

export type Draft = (typeof DRAFTS)[number]

/**
 * The classes each draft owns: the ones a stylesheet and a rendered part carry only while the
 * draft is signed.
 */
export const DRAFT_CLASSES: Readonly<Record<Draft, readonly string[]>> = {
  pdy1: [
    'active-option',
    'input-group',
    'combobox-trigger',
    'chips',
    'chip',
    'chip-remove',
    'list-empty',
  ].map((name) => `nave-base-ui-${name}`),
  '2uuv': ['nave-base-ui-item-highlight'],
  abv1: [],
  qok6: ['nave-base-ui-popup-motion', 'nave-base-ui-popup-fade'],
  d8l7: ['nave-base-ui-tooltip-motion'],
  qglc: ['nave-base-ui-backdrop'],
}

const RULE_START = /^ {2}\.(nave-base-ui-[\w-]+) /

/**
 * The line of `nave-base-ui-button` that sets the open ghost trigger, from its leading `}` to its
 * newline. Unsigned `abv1` takes it out.
 */
export const OPEN_GHOST_KEY = '    } &[data-nave-variant="ghost"][aria-expanded="true"]'

const GHOST_KEY = '    } &[data-nave-variant="ghost"]'

/**
 * The two new classes that always ship (they sit on parts that were already styled).
 */
const ALWAYS_NEW = ['tab-indicator-motion', 'arrow-inline'].map((name) => `nave-base-ui-${name}`)

/**
 * The 14 classes this work adds to the stylesheet.
 */
export const NEW_CLASSES: readonly string[] = [
  ...Object.values(DRAFT_CLASSES).flat(),
  ...ALWAYS_NEW,
]

/**
 * Every combination of unsigned drafts, smallest first: 64 states.
 */
export const allStates = (): Draft[][] => {
  const states: Draft[][] = [[]]
  for (const draft of DRAFTS) states.push(...states.map((state) => [...state, draft]))
  return states.toSorted((a, b) => a.length - b.length)
}

/**
 * A state's name: the unsigned drafts, in the order the drafts are listed, joined by `+`; `none`
 * when nothing is unsigned.
 */
export const stateKey = (unsigned: readonly Draft[]): string =>
  DRAFTS.filter((draft) => unsigned.includes(draft)).join('+') || 'none'

/**
 * A stylesheet without the rule blocks of the named classes. A block runs from the line that
 * opens its class to the line before the next class or the closing brace of the layer.
 */
export const withoutRules = (css: string, classes: readonly string[]): string => {
  let isSkipping = false
  return css
    .split('\n')
    .filter((line) => {
      const opened = RULE_START.exec(line)
      if (opened !== null) isSkipping = classes.includes(opened[1] ?? '')
      else if (line === '}') isSkipping = false
      return !isSkipping
    })
    .join('\n')
}

const withoutLinesStartingWith = (css: string, prefix: string): string =>
  css
    .split('\n')
    .filter((line) => !line.startsWith(prefix))
    .join('\n')

/**
 * The all-signed stylesheet with the open ghost key out: what unsigned `abv1` leaves.
 */
export const withoutOpenGhost = (css: string): string =>
  withoutLinesStartingWith(css, OPEN_GHOST_KEY)

/**
 * The stylesheet of a state, from the all-signed one.
 */
export const deriveState = (allSigned: string, unsigned: readonly Draft[]): string => {
  const rules = withoutRules(
    allSigned,
    unsigned.flatMap((draft) => DRAFT_CLASSES[draft]),
  )
  return unsigned.includes('abv1') ? withoutOpenGhost(rules) : rules
}

/**
 * The stylesheet of the parent contract, from the all-signed one: the new rules out and the button
 * back to its rule without the ghost keys.
 */
export const parentStylesheet = (allSigned: string): string =>
  withoutLinesStartingWith(withoutRules(allSigned, NEW_CLASSES), GHOST_KEY)

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/**
 * The class selectors that open a rule block, in order.
 */
export const ruleClasses = (css: string): string[] =>
  css
    .split('\n')
    .map((line) => RULE_START.exec(line)?.[1])
    .filter((name) => name !== undefined)

const withoutFocusRing = (css: string): string[] =>
  flatten(css)
    .filter((item) => !isFocusRingDeclaration(item))
    .map(
      (item) =>
        `${item.atRules.join(' > ')} | ${item.selectors.join(' > ')} | ${item.property}: ${item.value}`,
    )

/**
 * Where two stylesheets leave each other once focusRing is set aside, as the first differing
 * (at-rule path, selector path, property, value) of each; undefined when the ordered lists are
 * equal.
 */
export const listDifference = (built: string, expected: string): string | undefined => {
  const mine = withoutFocusRing(built)
  const wanted = withoutFocusRing(expected)
  const at = mine.findIndex((entry, index) => entry !== wanted[index])
  if (at === -1 && mine.length === wanted.length) return undefined
  const index = at === -1 ? mine.length : at
  return `entry ${index} of ${mine.length} against ${wanted.length}: built ${mine[index] ?? 'nothing'}, expected ${wanted[index] ?? 'nothing'}`
}
