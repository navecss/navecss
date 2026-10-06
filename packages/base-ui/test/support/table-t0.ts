/**
 * Table T0: the parts of a v1 component that are unstyled on purpose (the spec's complete list). A
 * bare name stands for that part of every component that has it.
 */
export const T0_BARE: ReadonlySet<string> = new Set([
  'Backdrop',
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
  'Collapsible.Root',
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
Whether a part (as `Namespace.Part`, or the bare component) is in Table T0.
 */
export const isInT0 = (part: string): boolean =>
  T0_QUALIFIED.has(part) || T0_BARE.has(part.slice(part.lastIndexOf('.') + 1))
