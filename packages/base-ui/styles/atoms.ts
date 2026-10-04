/**
 * The role atoms of `@navecss/base-ui`: Nave's design decisions for Base UI's parts, one atom per
 * role, written once. `scripts/build-styles.ts` expands each into a `components.nave` class rule
 * at package build time, so nothing here runs in a consumer's browser or build.
 *
 * Declaration order inside every atom is part of the shipped bytes (the golden compares them), and
 * a rule's later declaration wins over its earlier one, so reordering is a change of output, not a
 * tidy-up. Values are `var(--nave-*)` tokens, keywords, and the few named literals (sizes, offsets and rotations).
 * This directory is outside `src/` on purpose: it is build input, not shipped code.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import { controlAtoms } from './control-atoms.ts'
import { disclosureAtoms } from './disclosure-atoms.ts'
import { fieldAtoms } from './field-atoms.ts'
import { overlayAtoms } from './overlay-atoms.ts'
import { toolbarSliderAtoms } from './toolbar-slider-atoms.ts'

/**
The v1 role atoms, in the order their rules ship.
 */
export const atoms: Record<string, AtomDefinition> = {
  ...overlayAtoms,
  ...disclosureAtoms,
  ...controlAtoms,
  ...fieldAtoms,
  ...toolbarSliderAtoms,
}

/**
The atoms whose rule also carries core's `focusRing`: the focusable parts (Table T2).
 */
export const focusRingAtoms: readonly string[] = [
  'baseUiItem',
  'baseUiDisclosureTrigger',
  'baseUiTab',
  'baseUiButton',
  'baseUiToggle',
  'baseUiInput',
  'baseUiSelectTrigger',
  'baseUiCheckbox',
  'baseUiRadio',
  'baseUiSwitch',
  'baseUiNumberFieldInput',
  'baseUiToolbarLink',
]
