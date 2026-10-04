/**
 * What counts as a focus declaration the stylesheet may carry: core's `focusRing` on the focusable
 * parts it styles, and the Slider thumb's own rule, byte for byte.
 */
import { atoms as coreAtoms } from '@navecss/core/atoms'

import type { FlatDeclaration } from './stylesheet.ts'

import { focusRingClasses } from './table-p.ts'

export const THUMB = 'nave-base-ui-slider-thumb'

/**
 * The Slider thumb's focus rule: the four longhands with their fallbacks, as the signature fixes them.
 */
export const THUMB_RING: Readonly<Record<string, string>> = {
  'outline-style': 'solid',
  'outline-width': 'var(--nave-border-width-focus, 2px)',
  'outline-color': 'var(--nave-color-border-focus, currentColor)',
  'outline-offset': '2px',
}

/**
 * The block core's `focusRing` puts under `:focus-visible`, read from the workspace atoms at run time.
 */
export const ringBlock: Readonly<Record<string, string>> =
  coreAtoms.focusRing.pseudos[':focus-visible']

const isOwnRoot = (item: FlatDeclaration): boolean => item.selectors[0] === `.${item.owner}`

const isBase = (item: FlatDeclaration): boolean =>
  isOwnRoot(item) &&
  item.selectors.length === 1 &&
  item.property === 'outline' &&
  item.value === coreAtoms.focusRing.declarations.outline

const isBlock = (item: FlatDeclaration): boolean =>
  isOwnRoot(item) &&
  item.selectors.length === 2 &&
  item.selectors[1] === '&:focus-visible' &&
  ringBlock[item.property] === item.value

/**
 * Whether a declaration is one `focusRing` contributes to a class that takes it.
 */
export const isFocusRingDeclaration = (item: FlatDeclaration): boolean =>
  focusRingClasses.includes(item.owner) && (isBase(item) || isBlock(item))

/**
 * Whether a declaration is the base declaration of `focusRing` (its own `outline`).
 */
export const isFocusRingBase = (item: FlatDeclaration): boolean =>
  focusRingClasses.includes(item.owner) && isBase(item)

/**
 * The two insets that size the Slider thumb's focus bar, by the selector of the rule they sit in.
 * They read the focus width token, so they carry its fallback.
 */
const THUMB_BAR_INSETS: Readonly<Record<string, string>> = {
  '&:has(:focus-visible)::before': 'inset-inline',
  '&[data-orientation="vertical"]:has(:focus-visible)::before': 'inset-block',
}

const THUMB_BAR_INSET_VALUE = 'calc(-1 * (var(--nave-border-width-focus, 2px) + 2px))'

/**
 * Whether a declaration is one of the Slider thumb's two focus bar insets.
 */
export const isThumbBarInset = (item: FlatDeclaration): boolean =>
  item.owner === THUMB &&
  item.selectors.length === 2 &&
  THUMB_BAR_INSETS[item.selectors[1] ?? ''] === item.property &&
  item.value === THUMB_BAR_INSET_VALUE

/**
 * Whether a declaration belongs to the Slider thumb's focus rule.
 */
export const isThumbRingDeclaration = (item: FlatDeclaration): boolean =>
  item.owner === THUMB &&
  item.selectors[1] === '&:has(:focus-visible)' &&
  THUMB_RING[item.property] === item.value
