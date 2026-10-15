/**
 * The signature states of the four drafts feedback adds, and the facts about the unplaced branch that
 * live outside the stylesheet.
 */

export const DRAFTS_FEEDBACK = [
  'toast-placement',
  'toast-fade',
  'toast-limit',
  'navigation-menu-fade',
] as const

export type DraftFeedback = (typeof DRAFTS_FEEDBACK)[number]

/**
A signature state: the drafts that are not signed, and the two facts about the unplaced branch that
live outside the stylesheet. `unplaced alternative` (the scrim's premise) is signed in that branch unless said
otherwise, and S-A waits for its remedy row, which a state must say is posted.
 */
export interface StateFeedback {
  readonly remedyRowPosted?: boolean
  readonly unsigned: readonly DraftFeedback[]
  readonly unplacedAlternativeSigned?: boolean
}

/**
The shipping state: every draft signed.
 */
export const SHIPPING_FEEDBACK: StateFeedback = { unsigned: [] }

export const isSignedFeedback = (state: StateFeedback, draft: DraftFeedback): boolean =>
  !state.unsigned.includes(draft)

/**
Every combination of unsigned drafts, smallest first: 16 states.
 */
export const allStatesFeedback = (): StateFeedback[] => {
  const unsigned: DraftFeedback[][] = [[]]
  for (const draft of DRAFTS_FEEDBACK) {
    unsigned.push(...unsigned.map((state) => [...state, draft]))
  }
  return unsigned.toSorted((a, b) => a.length - b.length).map((list) => ({ unsigned: list }))
}

export const stateKeyFeedback = (state: StateFeedback): string => state.unsigned.join('+') || 'none'
