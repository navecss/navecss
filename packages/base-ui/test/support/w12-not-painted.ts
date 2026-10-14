/**
 * The phrases the not-painted list gains in the combined package's README, by signature state.
 */
import type { State789 } from './w12-states.ts'

import { isSigned789 } from './w12-states.ts'

export interface PhraseRule {
  readonly listed: (state: State789) => boolean
  readonly phrase: string
}

/**
The phrases the not-painted list gains, composed by #787's rule: one is always there, one with the
toast fade unsigned, and exactly one of the last two, by the Navigation Menu fade.
 */
export const NOT_PAINTED_789: readonly PhraseRule[] = [
  { listed: () => true, phrase: 'toasts form a plain list' },
  { listed: (state) => !isSigned789(state, 'toast-fade'), phrase: 'no motion on toasts' },
  {
    listed: (state) => isSigned789(state, 'navigation-menu-fade'),
    phrase: 'no motion when the Navigation Menu panel closes',
  },
  {
    listed: (state) => !isSigned789(state, 'navigation-menu-fade'),
    phrase: 'no motion on the Navigation Menu panel',
  },
]

const flat = (text: string): string => text.replaceAll(/\s+/g, ' ')

/**
The phrases a text carries, in the order of the rule.
 */
export const phrasesIn = (prose: string): string[] =>
  NOT_PAINTED_789.filter(({ phrase }) =>
    flat(prose).toLowerCase().includes(phrase.toLowerCase()),
  ).map(({ phrase }) => phrase)

/**
The phrases the list holds in a state.
 */
export const phrasesFor = (state: State789): string[] =>
  NOT_PAINTED_789.filter(({ listed }) => listed(state)).map(({ phrase }) => phrase)

