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

import { comboboxAtoms } from './combobox-atoms.ts'
import { completionAtoms } from './completion-atoms.ts'
import { controlAtoms } from './control-atoms.ts'
import { disclosureAtoms } from './disclosure-atoms.ts'
import { type Draft, draftAtoms, openGhostKey } from './drafts.ts'
import { feedbackAtoms } from './feedback-atoms.ts'
import { fieldAtoms } from './field-atoms.ts'
import { overlayAtoms } from './overlay-atoms.ts'
import { toolbarSliderAtoms } from './toolbar-slider-atoms.ts'

/**
The role atoms, in the order their rules ship: the first release's, the overlay completion's, then the feedback and navigation atoms.
 */
export const atoms: Record<string, AtomDefinition> = {
  ...overlayAtoms,
  ...disclosureAtoms,
  ...controlAtoms,
  ...fieldAtoms,
  ...toolbarSliderAtoms,
  ...completionAtoms,
  ...comboboxAtoms,
  ...feedbackAtoms,
}

/**
 * The role atoms of a build with the given drafts unsigned: each draft's atoms are left out, and
 * `baseUiButton` loses the key an unsigned `open-ghost` owns. Nothing else changes.
 */
export const atomsFor = (unsigned: readonly Draft[]): Record<string, AtomDefinition> => {
  const removed = new Set(unsigned.flatMap((draft) => draftAtoms[draft]))
  const kept = Object.entries(atoms).filter(([name]) => !removed.has(name))
  return Object.fromEntries(
    kept.map(([name, atom]) =>
      name === 'baseUiButton' && unsigned.includes('open-ghost')
        ? [name, { ...atom, pseudos: withoutOpenGhost(atom.pseudos) }]
        : [name, atom],
    ),
  )
}

const withoutOpenGhost = (
  pseudos: AtomDefinition['pseudos'],
): NonNullable<AtomDefinition['pseudos']> =>
  Object.fromEntries(Object.entries(pseudos ?? {}).filter(([key]) => key !== openGhostKey))

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
  'baseUiChip',
  'baseUiComboboxTrigger',
  'baseUiNavigationMenuTrigger',
]
