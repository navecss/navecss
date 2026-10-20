/**
 * What counts as a focus declaration the stylesheet may carry: core's `focusRing` on the focusable
 * parts it styles, and the Slider thumb's own rule, byte for byte.
 */
import type { ChildNode } from 'postcss'

import { atoms as coreAtoms } from '@navecss/core/atoms'

import type { FlatDeclaration } from './stylesheet.ts'

export const THUMB = 'nave-base-ui-slider-thumb'

const T2_NAMES = [
  'button',
  'input',
  'select-trigger',
  'number-field-input',
  'checkbox',
  'radio',
  'switch',
  'toggle',
  'tab',
  'disclosure-trigger',
  'item',
  'toolbar-link',
  // The two focusable parts the overlay completion adds: a chip takes DOM focus, and so does the
  // combobox trigger. `-active-option` is not here: its options never take DOM focus.
  'chip',
  'combobox-trigger',
  // The one focusable part the feedback and navigation spec adds (Table T2 amended): the
  // Navigation Menu trigger, an atom of its own. `-toast-root` and `-scroll-area-viewport` keep the
  // browser's ring and are not here.
  'navigation-menu-trigger',
]

/**
 * Table T2: the focusable parts that take `focusRing`, the twelve of the first release, the two
 * the overlay completion adds and the one the feedback and navigation spec adds. The Slider thumb, the four popups when they take focus themselves
 * and the number field's steppers are excluded by name.
 */
export const focusRingClasses: readonly string[] = T2_NAMES.map((name) => `nave-base-ui-${name}`)

/**
 * The classes the overlay completion adds, each a new part with its own rules.
 */
export const NEW_CLASSES: readonly string[] = [
  'item-highlight',
  'active-option',
  'backdrop',
  'popup-motion',
  'popup-fade',
  'tooltip-motion',
  'tab-indicator-motion',
  'arrow-inline',
  'input-group',
  'combobox-trigger',
  'chips',
  'chip',
  'chip-remove',
  'list-empty',
].map((name) => `nave-base-ui-${name}`)

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

/**
 * The declaration core's `focusRing` puts on the element itself, read from the workspace atoms at run time.
 */
export const ringBase: Readonly<Record<string, string>> = coreAtoms.focusRing.declarations

const isOwnRoot = (item: FlatDeclaration): boolean => item.selectors[0] === `.${item.owner}`

const isRingBlockRule = (node: ChildNode): boolean =>
  node.type === 'rule' &&
  node.selector === '&:focus-visible' &&
  node.nodes.length === Object.keys(ringBlock).length &&
  node.nodes.every((child) => child.type === 'decl' && ringBlock[child.prop] === child.value)

/**
 * Whether a declaration sits alone in a `& { }` that is a direct child of its class's rule, with
 * the ring block written after it in that same rule: the place `focusRing`'s `outline: none` takes
 * when the role has blocks of its own.
 */
const isWrappedAlone = (item: FlatDeclaration): boolean => {
  const wrapper = item.node.parent
  if (wrapper?.type !== 'rule' || wrapper.selector !== '&' || wrapper.nodes.length !== 1) {
    return false
  }
  const classRule = wrapper.parent
  if (classRule?.type !== 'rule' || classRule.selector !== `.${item.owner}`) return false
  return classRule.nodes.slice(classRule.index(wrapper) + 1).some((node) => isRingBlockRule(node))
}

const isBase = (item: FlatDeclaration): boolean =>
  isOwnRoot(item) &&
  item.property === 'outline' &&
  item.value === coreAtoms.focusRing.declarations.outline &&
  (item.selectors.length === 1 || (item.selectors.length === 2 && isWrappedAlone(item)))

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
 * Whether a declaration is the base declaration of `focusRing` (its own `outline`), among the
 * class's declarations or, where the role has blocks, alone in a `& { }` before the ring block.
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
