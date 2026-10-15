/**
 * What the combined package's README may carry in each signature state of the four drafts feedback
 * adds: the items of `w12-feedback-sentences.ts`, each with the state it belongs to, the
 * reduced-motion sentence composed by its rule, the phrases the not-painted list gains, and the
 * check of a README text against a state. The overlay release's drafts are signed in every state
 * here: the combined package's README is written for them signed, and their other states are
 * `w9-*`'s.
 */
import type { Literal, NamedLiteral } from './w9-sentences.ts'
import type { StateFeedback } from './w12-states.ts'

import { PARENT_REDUCED_MOTION, SENTENCE_4_FORMS } from './w9-sentences.ts'
import * as S from './w12-feedback-sentences.ts'
import { composeReducedMotion, LIVE_CODES, RM_TABLE, signedOfCode } from './w12-reduced-motion.ts'
import { isSignedFeedback } from './w12-states.ts'

/**
The words AC-base-ui-bridge-47 forbids in the README outside its cleared copy.
 */
export const FORBIDDEN: readonly RegExp[] = [
  /accessib/i,
  /a11y/i,
  /WCAG/i,
  /success criterion/i,
  /\bSC \d/i,
  /conform/i,
  /screen reader/i,
  /focus ring/i,
  /reduced motion/i,
  /reduced-motion/i,
  /prefers-reduced/i,
]

export type Author = 'reader' | 'cleared'

export interface ItemRule {
  /**
  Whose item it is: the reader items, or the cleared sentences.
   */
  readonly author: Author
  /**
  How a README holds the item. Most are held as text; the table rows are held cell by cell.
   */
  readonly holds?: (readme: string, text: string) => boolean
  readonly literal: NamedLiteral
  readonly present: (state: StateFeedback) => boolean
}

const named = (name: string, literal: Literal): NamedLiteral => ({ ...literal, name })

const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim().replaceAll(/\s+/g, ' '))

const tableRowsOf = (text: string): string[][] =>
  text
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) => cellsOf(line))

/**
Whether a README has every row of a table fragment, compared by cells, so Prettier's padding
does not matter.
 */
export const hasTableRows = (readme: string, fragment: string): boolean => {
  const have = new Set(tableRowsOf(readme).map((cells) => cells.join('\u{0}')))
  return tableRowsOf(fragment).every((cells) => have.has(cells.join('\u{0}')))
}

const reader = (
  name: string,
  literal: Literal,
  present: ItemRule['present'] = () => true,
  holds?: ItemRule['holds'],
): ItemRule => ({
  author: 'reader',
  ...(holds !== undefined && { holds }),
  literal: named(name, literal),
  present,
})

const cleared = (
  name: string,
  literal: Literal,
  present: ItemRule['present'] = () => true,
): ItemRule => ({ author: 'cleared', literal: named(name, literal), present })

const isPlacementUnsigned = (state: StateFeedback): boolean =>
  !isSignedFeedback(state, 'toast-placement')

const isUnplacedWithScrimReturn = (state: StateFeedback): boolean =>
  isPlacementUnsigned(state) && state.unplacedAlternativeSigned !== false

export const ITEM_RULES: readonly ItemRule[] = [
  reader('D1, Toast setup', S.D1_TOAST_SETUP),
  reader('D1b, the manager in a client module', S.D1B_MANAGER_IN_A_CLIENT_MODULE),
  reader('D3, the stylesheet sentence', S.D3_STYLESHEET_SENTENCE, (state) =>
    isSignedFeedback(state, 'toast-placement'),
  ),
  reader("D6, Toast.Title's element", S.D6_TOAST_TITLE_ELEMENT),
  reader('D7, Navigation Menu structure', S.D7_NAVIGATION_MENU_STRUCTURE),
  reader('D7b, the icon', S.D7B_NAVIGATION_MENU_ICON),
  reader('D8, panel size', S.D8_NAVIGATION_MENU_SIZE),
  reader('D10, Scroll Area', S.D10_SCROLL_AREA),
  reader('D11, Meter and Progress', S.D11_METER_AND_PROGRESS),
  reader('D12, Avatar', S.D12_AVATAR),
  reader('D13a, variants: the new parts', S.D13A_VARIANTS),
  reader('D13b, what is styled: three rows', S.D13B_WHAT_IS_STYLED_ROWS, () => true, hasTableRows),
  cleared('T1, F6 into the toasts', S.T1_F6_INTO_THE_TOASTS),
  cleared('T2, toast timer', S.T2_TOAST_TIMER),
  cleared('T3, types alike', S.T3_TYPES_ALIKE),
  cleared('RM, reduced motion, toasts in', S.RM_TOASTS_IN, (state) =>
    isSignedFeedback(state, 'toast-fade'),
  ),
  cleared(
    'RM, reduced motion, toasts out',
    S.RM_TOASTS_OUT,
    (state) => !isSignedFeedback(state, 'toast-fade'),
  ),
  cleared('I, limited toasts hidden', S.I_LIMITED_TOASTS_HIDDEN, (state) =>
    isSignedFeedback(state, 'toast-limit'),
  ),
  cleared(
    'S-L, limited toasts visible, inert',
    S.S_L_LIMITED_TOASTS_VISIBLE,
    (state) => !isSignedFeedback(state, 'toast-limit'),
  ),
  cleared('S-P3, placement and stacking', S.S_P3_PLACEMENT_AND_STACKING, (state) =>
    isSignedFeedback(state, 'toast-placement'),
  ),
  cleared('S-Pp2, popup from a toast, remedy', S.S_PP2_POPUP_FROM_A_TOAST, (state) =>
    isSignedFeedback(state, 'toast-placement'),
  ),
  cleared('S-U, toast area unplaced', S.S_U_TOAST_AREA_UNPLACED, isUnplacedWithScrimReturn),
  cleared(
    'S-A, anchored not stacked',
    S.S_A_ANCHORED_NOT_STACKED,
    (state) => isUnplacedWithScrimReturn(state) && state.remedyRowPosted === true,
  ),
  cleared('S-T, popup in a timed toast', S.S_T_POPUP_IN_A_TIMED_TOAST),
  cleared('S-S, swipe', S.S_S_SWIPE),
  cleared('S-C, current page', S.S_C_CURRENT_PAGE),
  cleared('S-I, indeterminate Progress', S.S_I_INDETERMINATE_PROGRESS),
  cleared('S-M, Meter and Progress roles', S.S_M_METER_AND_PROGRESS_ROLES),
  cleared('S-Av, Avatar alt', S.S_AV_AVATAR_ALT),
  cleared('S-N, Navigation Menu list', S.S_N_NAVIGATION_MENU_LIST),
  cleared('S-SA, Scroll Area viewport', S.S_SA_SCROLL_AREA_VIEWPORT),
  cleared('S-K, keepMounted scrollbar', S.S_K_KEEP_MOUNTED_SCROLLBAR),
  cleared('S-D, disabled trigger', S.S_D_DISABLED_TRIGGER),
  // The stylesheet paragraph keeps the shipped sentence exactly when the placement is unsigned.
  {
    author: 'reader',
    literal: named('the shipped stylesheet sentence', S.SHIPPED_STYLESHEET_SENTENCE),
    present: isPlacementUnsigned,
  },
]

/**
The reader items' withdrawn texts: never in the README of the combined package, in any state.
 */
export const WITHDRAWN_reader: readonly NamedLiteral[] = [
  named('D2', S.D2_ANCHORED_PROVIDER),
  named('D5', S.D5_SWIPE),
  named('D9', S.D9_CURRENT_PAGE),
  named('D14', S.D14_KEEP_MOUNTED),
  named('the earlier D11', S.D11_EARLIER),
  named('the earlier D12', S.D12_EARLIER),
  named('the earlier D13c', S.D13C_EARLIER),
  named('D13c with its draft labels', S.D13C_NOT_PAINTED_PHRASES),
]

/**
The cleared sentences' withdrawn and superseded texts, the overlay release's reduced-motion forms among them.
 */
export const WITHDRAWN_cleared: readonly NamedLiteral[] = [
  named("S-K's earlier form (16px gutter)", S.S_K_EARLIER),
  named('the 308 B placement sentence', S.S_P_PLACEMENT_308),
  named('the 95 B popup limitation', S.S_PP1_POPUP_LIMITATION),
  named("first-fade's 413 B reduced-motion form", S.FIRST_FADE_FORM_413),
  named("first-placement's 212 B placement sentence", S.FIRST_PLACEMENT_212),
  named("the parent's reduced-motion sentence", PARENT_REDUCED_MOTION),
  ...Object.entries(SENTENCE_4_FORMS).map(([code, form]) =>
    named(`the overlay release's reduced-motion form ${code.split('').join(' ')}`, form),
  ),
]

/**
The fourteen forms of the reduced-motion sentence no README carries: every state of the table but
the two live ones, composed by the rule.
 */
export const NON_LIVE_REDUCED_MOTION: readonly NamedLiteral[] = RM_TABLE.filter(
  ({ code }) => !(LIVE_CODES as readonly string[]).includes(code),
).map(({ bytes, code, prefix }) => ({
  bytes,
  name: `the reduced-motion form ${code.split('').join(' ')}`,
  prefix,
  text: composeReducedMotion(signedOfCode(code)),
}))

/**
Every item a README is held to in a state, present.
 */
export const itemsPresent = (state: StateFeedback): readonly ItemRule[] =>
  ITEM_RULES.filter(({ present }) => present(state))

/**
Every text a README in a state must not carry: the items of the other states and the withdrawn texts.
 */
export const textsAbsent = (state: StateFeedback, author?: Author): readonly NamedLiteral[] => [
  ...ITEM_RULES.filter(
    (rule) => !rule.present(state) && (author === undefined || rule.author === author),
  ).map(({ literal }) => literal),
  ...(author === 'cleared' ? [] : WITHDRAWN_reader),
  ...(author === 'reader' ? [] : [...WITHDRAWN_cleared, ...NON_LIVE_REDUCED_MOTION]),
]

const isHeld = ({ holds, literal }: ItemRule, readme: string): boolean =>
  holds === undefined ? readme.includes(literal.text) : holds(readme, literal.text)

/**
What is wrong with a README for a state: each item the state calls for that it lacks, and each text
it carries that the state does not allow.
 */
export const problemsFeedback = (
  readme: string,
  state: StateFeedback,
  author?: Author,
): string[] => [
  ...itemsPresent(state)
    .filter((rule) => (author === undefined || rule.author === author) && !isHeld(rule, readme))
    .map(({ literal }) => `missing: ${literal.name}`),
  ...textsAbsent(state, author)
    .filter(({ text }) => readme.includes(text))
    .map(({ name }) => `unexpected: ${name}`),
]

/**
Every literal the README can be held to, for the table of lengths and hashes.
 */
export const ALL_LITERALS_FEEDBACK: readonly NamedLiteral[] = [
  ...ITEM_RULES.map(({ literal }) => literal),
  ...WITHDRAWN_reader,
  ...WITHDRAWN_cleared,
  ...NON_LIVE_REDUCED_MOTION,
]

const replaceOnce = (text: string, from: string, to: string): string => text.replace(from, () => to)

/**
The shipped README with the substitutions that turn it into the README of another state: D3 becomes
the shipped sentence in place, the 463 B form the 445 B form, I the sentence S-L, and S-P3 and S-Pp2
give way to S-U and S-A where the state calls for them. The phrases of the not-painted list are
checked apart (`phrasesFor`).
 */
export const readmeInState = (shipped: string, state: StateFeedback): string => {
  let text = shipped
  if (!isSignedFeedback(state, 'toast-placement')) {
    text = replaceOnce(text, S.D3_STYLESHEET_SENTENCE.text, S.SHIPPED_STYLESHEET_SENTENCE.text)
    text = replaceOnce(text, S.S_PP2_POPUP_FROM_A_TOAST.text, '')
    const unplaced = [
      ...(isUnplacedWithScrimReturn(state) ? [S.S_U_TOAST_AREA_UNPLACED.text] : []),
      ...(isUnplacedWithScrimReturn(state) && state.remedyRowPosted === true
        ? [S.S_A_ANCHORED_NOT_STACKED.text]
        : []),
    ].join('\n\n')
    text = replaceOnce(text, S.S_P3_PLACEMENT_AND_STACKING.text, unplaced)
  }
  if (!isSignedFeedback(state, 'toast-fade')) {
    text = replaceOnce(text, S.RM_TOASTS_IN.text, S.RM_TOASTS_OUT.text)
  }
  if (!isSignedFeedback(state, 'toast-limit')) {
    text = replaceOnce(text, S.I_LIMITED_TOASTS_HIDDEN.text, S.S_L_LIMITED_TOASTS_VISIBLE.text)
  }
  return text
}

/**
The sentences of a state that were cleared, for the scan that removes them.
 */
export const clearedFor = (state: StateFeedback): string[] =>
  itemsPresent(state)
    .filter(({ author }) => author === 'cleared')
    .map(({ literal }) => literal.text)
