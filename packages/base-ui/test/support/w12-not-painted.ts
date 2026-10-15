/**
 * The phrases the not-painted list gains in the combined package's README, by signature state.
 */
import type { StateFeedback } from './w12-states.ts'

import { isSignedFeedback } from './w12-states.ts'

export interface PhraseRule {
  readonly listed: (state: StateFeedback) => boolean
  readonly phrase: string
}

/**
The phrases the not-painted list gains, composed by the overlay release's rule: one is always there, one with the
toast fade unsigned, and exactly one of the last two, by the Navigation Menu fade.
 */
export const NOT_PAINTED_FEEDBACK: readonly PhraseRule[] = [
  { listed: () => true, phrase: 'toasts form a plain list' },
  { listed: (state) => !isSignedFeedback(state, 'toast-fade'), phrase: 'no motion on toasts' },
  {
    listed: (state) => isSignedFeedback(state, 'navigation-menu-fade'),
    phrase: 'no motion when the Navigation Menu panel closes',
  },
  {
    listed: (state) => !isSignedFeedback(state, 'navigation-menu-fade'),
    phrase: 'no motion on the Navigation Menu panel',
  },
]

const flat = (text: string): string => text.replaceAll(/\s+/g, ' ')

/**
The phrases a text carries, in the order of the rule.
 */
export const phrasesIn = (prose: string): string[] =>
  NOT_PAINTED_FEEDBACK.filter(({ phrase }) =>
    flat(prose).toLowerCase().includes(phrase.toLowerCase()),
  ).map(({ phrase }) => phrase)

/**
The phrases the list holds in a state.
 */
export const phrasesFor = (state: StateFeedback): string[] =>
  NOT_PAINTED_FEEDBACK.filter(({ listed }) => listed(state)).map(({ phrase }) => phrase)
