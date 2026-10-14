/**
 * The signature states of the four drafts #789 adds, and the facts about the unplaced branch that
 * live outside the stylesheet.
 */

export const DRAFTS_789 = [
  'toast-placement',
  'toast-fade',
  'toast-limit',
  'navigation-menu-fade',
] as const

export type Draft789 = (typeof DRAFTS_789)[number]

/**
A signature state: the drafts that are not signed, and the two facts about the unplaced branch that
live outside the stylesheet. `wi8q` (the scrim's premise) is signed in that branch unless said
otherwise, and S-A waits for its DEVREL remedy row, which a state must say is posted.
 */
export interface State789 {
  readonly remedyRowPosted?: boolean
  readonly unsigned: readonly Draft789[]
  readonly wi8qSigned?: boolean
}

/**
The shipping state: every draft signed.
 */
export const SHIPPING_789: State789 = { unsigned: [] }

export const isSigned789 = (state: State789, draft: Draft789): boolean => !state.unsigned.includes(draft)

/**
Every combination of unsigned drafts, smallest first: 16 states.
 */
export const allStates789 = (): State789[] => {
  const unsigned: Draft789[][] = [[]]
  for (const draft of DRAFTS_789) {
    unsigned.push(...unsigned.map((state) => [...state, draft]))
  }
  return unsigned.toSorted((a, b) => a.length - b.length).map((list) => ({ unsigned: list }))
}

export const stateKey789 = (state: State789): string => state.unsigned.join('+') || 'none'
