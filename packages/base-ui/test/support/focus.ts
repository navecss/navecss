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
 * Whether a declaration belongs to the Slider thumb's focus rule.
 */
export const isThumbRingDeclaration = (item: FlatDeclaration): boolean =>
  item.owner === THUMB &&
  item.selectors[1] === '&:has(:focus-visible)' &&
  THUMB_RING[item.property] === item.value
