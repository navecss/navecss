/**
 * What Table P's rows are made of: the class names, the signature drafts a class or a row waits on,
 * and the row builders. Kept apart from the table so the feedback and navigation rows can be
 * written in a file of their own.
 */
import type { Draft } from './draft-states.ts'

export const BASE = 'nave-base-ui-'

/**
The four signature drafts of the feedback and navigation work: placement and stacking of the
toast viewport, the toast fade, the hidden limited toasts and the Navigation Menu fade-in. An
unsigned draft takes its class out of Table P, and the rest of the table stays.
 */
export const FEEDBACK_DRAFTS = [
  'toast-placement',
  'toast-fade',
  'toast-limit',
  'navigation-menu-fade',
] as const

export type FeedbackDraft = (typeof FEEDBACK_DRAFTS)[number]

/**
Any signature draft of the package: the six of the overlay completion and the four above.
 */
export type AnyDraft = Draft | FeedbackDraft

/**
 * Where the scrim class goes when `scrim` is signed: at scope (i) on `AlertDialog.Backdrop` alone,
 * at scope (ii) on `Dialog.Backdrop` too.
 */
export type BackdropScope = 'i' | 'ii'

export interface ClassEntry {
  readonly name: string
  /**
  The draft that has to be signed for the class to ship; absent when it always ships.
   */
  readonly draft?: AnyDraft
}

export interface Row {
  readonly parts: readonly string[]
  readonly classes: readonly ClassEntry[]
  /**
  The draft that has to be signed for the row to exist at all.
   */
  readonly draft?: AnyDraft
  readonly scope?: BackdropScope
}

export const always = (name: string): ClassEntry => ({ name: `${BASE}${name}` })

export const signedWith = (draft: AnyDraft, name: string): ClassEntry => ({
  name: `${BASE}${name}`,
  draft,
})

export const row = (parts: readonly string[], ...classes: readonly ClassEntry[]): Row => ({
  parts,
  classes,
})

export const rowWith = (
  draft: AnyDraft,
  parts: readonly string[],
  ...classes: readonly ClassEntry[]
): Row => ({
  parts,
  classes,
  draft,
})
