/**
 * Table T0: the parts of a component that are unstyled on purpose (the spec's complete list). A
 * bare name stands for that part of every component that has it. The Backdrop is not listed here:
 * whether it is unstyled depends on the scrim's signature state, which `isInT0` reads off Table P.
 */
import type { Draft } from './draft-states.ts'
import type { BackdropScope } from './table-p.ts'

import { tablePFor } from './table-p.ts'

export const T0_BARE: ReadonlySet<string> = new Set([
  'createHandle',
  'Form',
  'Handle',
  'Portal',
  'Positioner',
  'Provider',
  'Viewport',
])

export const T0_QUALIFIED: ReadonlySet<string> = new Set([
  'Accordion.Root',
  'AlertDialog.Root',
  'Autocomplete.Collection',
  'Autocomplete.Group',
  'Autocomplete.List',
  'Autocomplete.Root',
  'Autocomplete.Row',
  'Autocomplete.Status',
  'Autocomplete.useFilter',
  'Autocomplete.useFilteredItems',
  'Autocomplete.Value',
  'Collapsible.Root',
  'Combobox.Collection',
  'Combobox.createItems',
  'Combobox.Group',
  'Combobox.ItemIndicator',
  'Combobox.List',
  'Combobox.Root',
  'Combobox.Row',
  'Combobox.Status',
  'Combobox.useFilter',
  'Combobox.useFilteredItems',
  'Combobox.Value',
  'ContextMenu.CheckboxItemIndicator',
  'ContextMenu.Group',
  'ContextMenu.RadioGroup',
  'ContextMenu.RadioItemIndicator',
  'ContextMenu.Root',
  'ContextMenu.SubmenuRoot',
  'ContextMenu.Trigger',
  'Dialog.Root',
  'Field.Item',
  'Field.Validity',
  'Menu.CheckboxItemIndicator',
  'Menu.Group',
  'Menu.RadioGroup',
  'Menu.RadioItemIndicator',
  'Menu.Root',
  'Menu.SubmenuRoot',
  'NumberField.Root',
  'NumberField.ScrubAreaCursor',
  'Popover.Root',
  'PreviewCard.Root',
  'PreviewCard.Trigger',
  'Select.Group',
  'Select.ItemIndicator',
  'Select.ItemText',
  'Select.List',
  'Select.Root',
  'Select.ScrollDownArrow',
  'Select.ScrollUpArrow',
  'Slider.Indicator',
  'Slider.Label',
  'Slider.Root',
  'Tabs.Panel',
  'Tabs.Root',
  'Tooltip.Root',
])

/**
Whether a part (as `Namespace.Part`, or the bare component) is in Table T0 for a signature state
(the shipping state by default). A Backdrop is the one part that moves between the tables: it is
styled where Table P gives it a row for the state, and unstyled everywhere else.
 */
export const isInT0 = (
  part: string,
  unsigned: readonly Draft[] = [],
  scope: BackdropScope = 'i',
): boolean => {
  const name = part.slice(part.lastIndexOf('.') + 1)
  if (name === 'Backdrop') {
    return !tablePFor(unsigned, scope).has(part)
  }
  return T0_QUALIFIED.has(part) || T0_BARE.has(name)
}
