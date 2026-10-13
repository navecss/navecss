/**
 * What a README may carry in each signature state: the sentences of w9-sentences.ts, each with the
 * state it belongs to, and the check of a README text against a state.
 */
import type { Draft } from './draft-states.ts'
import type { Literal, NamedLiteral, SignatureState } from './w9-sentences.ts'

import {
  EARLIER_FORMS,
  EARLIER_REDUCED_MOTION,
  EARLIER_TEMPLATE,
  PARENT_REDUCED_MOTION,
  SENTENCE_1_ACTIVE_OPTION,
  SENTENCE_2_CONTEXT_MENU_RINGS,
  SENTENCE_3_PREVIEW_CARD,
  SENTENCE_4_FORMS,
  SENTENCE_4_LIST_RULE,
  SENTENCE_4_TEMPLATE,
  SENTENCE_5_MENUBAR_BARE_POPUP,
  SENTENCE_6_COMBOBOX_FIELD,
  SENTENCE_7_DIALOG_BACKDROP,
} from './w9-sentences.ts'

const isSigned = (state: SignatureState, draft: Draft): boolean => !state.unsigned.includes(draft)

/**
The code of a state's reduced-motion form: S or u for the popups' fade, the tooltip's fade and the
backdrop's fade.
 */
export const sentence4Code = (state: SignatureState): string =>
  (['popup-fade', 'tooltip-fade', 'scrim'] as const)
    .map((draft) => (isSigned(state, draft) ? 'S' : 'u'))
    .join('')

const joinList = (items: readonly string[]): string =>
  items.length === 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`

/**
Sentence 4 for a state, built from the template and the list rule rather than looked up.
 */
export const composeSentence4 = (state: SignatureState): string => {
  const { always, backdrop, popups, tooltip } = SENTENCE_4_LIST_RULE
  const items = [
    ...(isSigned(state, 'popup-fade') ? [popups] : []),
    ...(isSigned(state, 'tooltip-fade') ? [tooltip] : []),
    ...(isSigned(state, 'scrim') ? [backdrop] : []),
    ...always,
  ]
  return SENTENCE_4_TEMPLATE.text.replace('{LIST}', () => joinList(items))
}

const named = (name: string, literal: Literal): NamedLiteral => ({ ...literal, name })

/**
Every sentence this package's README may carry, with the state it is carried in: `present` is a
predicate over the state.
 */
interface Rule {
  readonly literal: NamedLiteral
  readonly present: (state: SignatureState) => boolean
}

const SENTENCE_4_RULES: readonly Rule[] = Object.entries(SENTENCE_4_FORMS).map(([code, form]) => ({
  literal: named(`sentence 4, ${code.split('').join(' ')}`, form),
  present: (state) => sentence4Code(state) === code,
}))

const RULES: readonly Rule[] = [
  {
    literal: named('sentence 1, the active option', SENTENCE_1_ACTIVE_OPTION),
    present: (state) => isSigned(state, 'combobox'),
  },
  {
    literal: named("sentence 2, Context Menu's right-click rings", SENTENCE_2_CONTEXT_MENU_RINGS),
    present: () => true,
  },
  { literal: named('sentence 3, Preview Card', SENTENCE_3_PREVIEW_CARD), present: () => true },
  ...SENTENCE_4_RULES,
  {
    literal: named('sentence 5, the bare popup in Menubar', SENTENCE_5_MENUBAR_BARE_POPUP),
    present: () => true,
  },
  {
    literal: named('sentence 6, the Combobox field', SENTENCE_6_COMBOBOX_FIELD),
    present: (state) => isSigned(state, 'combobox'),
  },
  {
    literal: named('sentence 7, Dialog.Backdrop only for modal', SENTENCE_7_DIALOG_BACKDROP),
    present: (state) => isSigned(state, 'scrim') && state.scope === 'ii',
  },
]

/**
The superseded texts: never in the combined package's README, in any state.
 */
export const SUPERSEDED: readonly NamedLiteral[] = [
  named("the parent's reduced-motion sentence", PARENT_REDUCED_MOTION),
  named('the earlier reduced-motion text', EARLIER_REDUCED_MOTION),
  ...Object.entries(EARLIER_FORMS).map(([code, form]) =>
    named(`the earlier form ${code.split('').join(' ')}`, form),
  ),
]

/**
Every literal the README can be held to, for the table of lengths and hashes.
 */
export const ALL_LITERALS: readonly NamedLiteral[] = [
  ...RULES.map(({ literal }) => literal),
  named('sentence 4 template', SENTENCE_4_TEMPLATE),
  ...SUPERSEDED,
  named('earlier template', EARLIER_TEMPLATE),
]

/**
The sentences a README in this state contains, by their names.
 */
export const sentencesPresentIn = (state: SignatureState): readonly NamedLiteral[] =>
  RULES.filter(({ present }) => present(state)).map(({ literal }) => literal)

/**
The sentences a README in this state does not contain: the other states' and the superseded texts.
 */
export const sentencesAbsentFrom = (state: SignatureState): readonly NamedLiteral[] => [
  ...RULES.filter(({ present }) => !present(state)).map(({ literal }) => literal),
  ...SUPERSEDED,
]

/**
What is wrong with a README for a state: each sentence it lacks that the state calls for, and each it
carries that the state does not.
 */
export const sentenceProblems = (readme: string, state: SignatureState): string[] => [
  ...sentencesPresentIn(state)
    .filter(({ text }) => !readme.includes(text))
    .map(({ name }) => `missing: ${name}`),
  ...sentencesAbsentFrom(state)
    .filter(({ text }) => readme.includes(text))
    .map(({ name }) => `unexpected: ${name}`),
]

/**
The eight states the reduced-motion form depends on.
 */
export const REDUCED_MOTION_STATES: readonly SignatureState[] = [false, true].flatMap((popups) =>
  [false, true].flatMap((tooltip) =>
    [false, true].map((backdrop) => ({
      scope: 'i' as const,
      unsigned: [
        ...(popups ? [] : (['popup-fade'] as const)),
        ...(tooltip ? [] : (['tooltip-fade'] as const)),
        ...(backdrop ? [] : (['scrim'] as const)),
      ],
    })),
  ),
)
