/**
 * The states of the feedback and navigation spec (feedback): its four drafts, the byte oracles of
 * Appendix C written from the spec text, and the textual composition of a feedback state from a overlay
 * one. The overlay side (`DRAFTS`, `allStates`, `deriveState`) is `draft-states.ts` and is not
 * multiplied by this: a feedback state is read with overlay all signed, and the six corners of Appendix
 * C.4 are where the two meet.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Draft } from './draft-states.ts'

import { deriveState } from './draft-states.ts'
import { PACKAGE_DIR } from './stylesheet.ts'

/**
 * The four drafts of the feedback and navigation spec, by the id `buildStyles({ unsigned })` takes.
 * The signature each rests on is in `SIGNATURES_789`.
 */
export const DRAFTS_789 = [
  'toast-placement',
  'toast-fade',
  'toast-limit',
  'navigation-menu-fade',
] as const

export type Draft789 = (typeof DRAFTS_789)[number]

/**
 * The ids a build takes in `unsigned`, the overlay release's and this spec's.
 */
export type AnyDraft = Draft | Draft789

/**
 * The finding each draft is signed by: `vgiq` placement and stacking, `q1dc` toast fade, `i696`
 * limited toasts hidden, `wlu6` the Navigation Menu fade-in.
 */
export const SIGNATURES_789: Readonly<Record<Draft789, string>> = {
  'toast-placement': 'vgiq',
  'toast-fade': 'q1dc',
  'toast-limit': 'i696',
  'navigation-menu-fade': 'wlu6',
}

const BASE = 'nave-base-ui-'

/**
 * The class each feedback draft owns, one apiece, and the bytes it takes out of the block (Appendix
 * C.3).
 */
export const DRAFT_CLASSES_789: Readonly<Record<Draft789, readonly string[]>> = {
  'toast-placement': [`${BASE}toast-placement`],
  'toast-fade': [`${BASE}toast-fade`],
  'toast-limit': [`${BASE}toast-limit`],
  'navigation-menu-fade': [`${BASE}navigation-menu-fade`],
}

export const REMOVED_BYTES_789: Readonly<Record<Draft789, number>> = {
  'toast-placement': 272,
  'toast-fade': 498,
  'toast-limit': 75,
  'navigation-menu-fade': 441,
}

/**
 * The 21 classes the block adds, in Appendix C.1's order.
 */
export const NEW_CLASSES_789: readonly string[] = [
  'toast-viewport',
  'toast-placement',
  'toast-root',
  'toast-fade',
  'toast-limit',
  'navigation-menu-list',
  'navigation-menu-trigger',
  'navigation-menu-icon',
  'navigation-menu-fade',
  'current-link',
  'scroll-area',
  'scroll-area-viewport',
  'scroll-area-scrollbar',
  'scroll-area-thumb',
  'scroll-area-corner',
  'value-bar',
  'value-bar-track',
  'value-bar-indicator',
  'avatar',
  'avatar-image',
  'avatar-fallback',
].map((name) => `${BASE}${name}`)

/**
 * Every combination of unsigned feedback drafts, smallest first: 16 states.
 */
export const allStates789 = (): Draft789[][] => {
  const states: Draft789[][] = [[]]
  for (const draft of DRAFTS_789) states.push(...states.map((state) => [...state, draft]))
  return states.toSorted((a, b) => a.length - b.length)
}

/**
 * A feedback state's name: the unsigned drafts in the order `DRAFTS_789` lists them, joined by `+`;
 * `none` when nothing is unsigned. The keys of `feedback-states.json`.
 */
export const stateKey789 = (unsigned: readonly Draft789[]): string =>
  DRAFTS_789.filter((draft) => unsigned.includes(draft)).join('+') || 'none'

/**
 * A byte oracle under `test/fixtures/generated/`, read as text. Written by a script from the spec
 * text and frozen: never rebuilt from this package.
 */
export const readOracle = (name: string): string =>
  readFileSync(path.join(PACKAGE_DIR, 'test/fixtures/generated', name), 'utf8')

/**
 * Appendix C.1, the 21 rules all signed, byte for byte (6,899 B).
 */
export const feedbackBlock = (): string => readOracle('feedback-block.css')

/**
 * The all-signed overlay sheet, built independently of this package's atoms (30,401 B).
 */
export const sheet787 = (): string => readOracle('independent-build.css')

/**
 * A block's rules by class, each from its two leading spaces to its final newline.
 */
export const blockRules = (block: string): Map<string, string> =>
  new Map(
    block
      .split(/^(?= {2}\.nave-base-ui-)/m)
      .filter((part) => part !== '')
      .map((part) => [/^ {2}\.(nave-base-ui-[\w-]+) /.exec(part)?.[1] ?? '', part] as const),
  )

/**
 * The block of a feedback state: Appendix C.1 minus the rules of the unsigned drafts (C.3).
 */
export const blockFor = (unsigned: readonly Draft789[] = []): string => {
  const removed = new Set(unsigned.flatMap((draft) => DRAFT_CLASSES_789[draft]))
  return [...blockRules(feedbackBlock())]
    .filter(([name]) => !removed.has(name))
    .map(([, text]) => text)
    .join('')
}

const LAYER_CLOSE = '\n}\n'

/**
 * A overlay sheet with the feedback block appended before the closing `}` of `@layer components.nave`:
 * the construction of Appendix C, textual and without `focusRing`.
 */
export const composeSheet = (sheet: string, unsigned: readonly Draft789[] = []): string => {
  if (!sheet.endsWith(LAYER_CLOSE)) throw new Error('the sheet does not end with the layer block')
  return `${sheet.slice(0, -2) + blockFor(unsigned)}}\n`
}

/**
 * The expected sheet of a state without `focusRing`, overlay drafts and feedback drafts both named.
 */
export const expectedSheet = (
  unsigned787: readonly Draft[] = [],
  unsigned789: readonly Draft789[] = [],
): string => composeSheet(deriveState(sheet787(), unsigned787), unsigned789)

// What `focusRing` contributes to a class that takes it, as it stands in the built text: the base
// `outline: none;` among the class's own declarations, and one nested `:focus-visible` rule.
const RING_BASE = 'outline: none; '
const RING_RULE =
  '&:focus-visible{ outline-style: solid; outline-width: var(--nave-border-width-focus, 2px); outline-color: var(--nave-color-border-focus, currentColor); outline-offset: 2px;\n    } '

/**
 * A built sheet with the `focusRing` block left out (the form Appendix C counts), and how many
 * classes had it.
 */
export const withoutRing = (css: string): { count: number; text: string } => ({
  count: css.split(RING_RULE).length - 1,
  text: css.replaceAll(RING_RULE, '').replaceAll(RING_BASE, ''),
})
