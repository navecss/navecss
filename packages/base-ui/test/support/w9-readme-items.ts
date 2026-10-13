/**
 * The README items a reader-facing check needs beyond the fixed sentences: the sentences of the
 * prose, the list of what the package does not paint (which shrinks with what ships), and the
 * examples a README shows for one component.
 */
import type { SignatureState } from './w9-sentences.ts'

import { type Fence, fencesOf } from './readme.ts'

/**
The sentences of a text, on one line each.
 */
export const sentencesOf = (text: string): string[] =>
  text
    .replaceAll(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())

/**
Whether one sentence of the text matches every pattern.
 */
export const hasSentenceWith = (text: string, patterns: readonly RegExp[]): boolean =>
  sentencesOf(text).some((sentence) => patterns.every((pattern) => pattern.test(sentence)))

const isSigned = (state: SignatureState, draft: SignatureState['unsigned'][number]): boolean =>
  !state.unsigned.includes(draft)

export interface NotPaintedItem {
  /**
  The item as a reader meets it.
   */
  readonly name: string
  /**
  Whether the item is listed in the state.
   */
  readonly listed: (state: SignatureState) => boolean
  /**
  How the item reads in the README, over prose on one line.
   */
  readonly pattern: RegExp
}

/**
The list of what the package does not paint: each item and the condition that lists it. The first
five are the ones that depend on the signature; the last three are listed whatever is signed.
 */
export const NOT_PAINTED: readonly NotPaintedItem[] = [
  {
    listed: (state) => !isSigned(state, 'highlight-fill'),
    name: 'no highlight on the hovered or arrowed item',
    pattern: /\bno highlight on the hovered or arrowed item\b/i,
  },
  {
    listed: (state) => !isSigned(state, 'scrim') || state.scope === 'i',
    name: 'no backdrop colour behind a Dialog',
    pattern: /\bno backdrop colou?r behind a dialog\b/i,
  },
  {
    listed: (state) => !isSigned(state, 'scrim'),
    name: 'no backdrop colour behind an Alert Dialog',
    pattern: /\bno backdrop colou?r behind an alert dialog\b/i,
  },
  {
    listed: (state) => !isSigned(state, 'popup-fade'),
    name: 'no motion on popups',
    pattern: /\bno motion on popups\b/i,
  },
  {
    listed: (state) => !isSigned(state, 'tooltip-fade'),
    name: 'no motion on tooltips',
    pattern: /\bno motion on tooltips\b/i,
  },
  {
    listed: () => true,
    name: "no fill on the Slider's range",
    pattern: /\bno fill on (?:a|the) slider['’]s range\b/i,
  },
  {
    listed: () => true,
    name: 'Button sizes md and sm only',
    pattern: /\bbutton sizes `md` and `sm` only\b/i,
  },
  {
    listed: () => true,
    name: 'recommends no scrim value',
    pattern: /\brecommends no scrim value\b/i,
  },
]

/**
What the first release listed and the combined package no longer does, in the words it used: the
arrow on physical sides, the tab indicator that does not move, and a Button of two variants.
 */
export const WITHDRAWN_NOT_PAINTED: readonly RegExp[] = [
  /physical sides/i,
  /\bno motion on [^.]*tab indicator/i,
  /tab indicator (?:does not|doesn['’]t) move/i,
  /\bno motion on popups, tooltips/i,
  /\bno (?:scrim|backdrop) colou?r behind a dialog \(its backdrop/i,
  /\brecommends no value\b/i,
  /\bButton comes in `secondary` and `primary`/,
  /`secondary` and `primary` only/,
]

const flat = (text: string): string => text.replaceAll(/\s+/g, ' ')

/**
The items of the not-painted list a text carries, by name.
 */
export const notPaintedIn = (prose: string): string[] =>
  NOT_PAINTED.filter(({ pattern }) => pattern.test(flat(prose))).map(({ name }) => name)

/**
The items the list holds in a state.
 */
export const notPaintedFor = (state: SignatureState): string[] =>
  NOT_PAINTED.filter(({ listed }) => listed(state)).map(({ name }) => name)

/**
The phrases of a state's list, as one paragraph of prose.
 */
export const notPaintedParagraph = (state: SignatureState): string =>
  `Not painted: ${NOT_PAINTED.filter(({ listed }) => listed(state))
    .map(({ name }) =>
      name.replace('Button sizes md and sm only', 'Button sizes `md` and `sm` only'),
    )
    .join('; ')}.`

/**
The script fences of a markdown text that write a tag.
 */
export const fencesWriting = (markdown: string, tag: RegExp): Fence[] =>
  fencesOf(markdown).filter(
    ({ body, language }) => ['jsx', 'tsx'].includes(language) && tag.test(body),
  )
