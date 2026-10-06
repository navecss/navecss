/**
 * The roster: which parts of Base UI's components the wrappers style, with the role atoms whose
 * classes each takes (in the order they are joined) and, for the Button family, which of the
 * `variant` and `size` props it gains. Every part not named here is a pass-through. Keys read
 * `Namespace.Part`, or the component's own name for one that is not a namespace.
 */
export interface StyledPart {
  readonly atoms: readonly string[]
  /**
  The typed props the part gains: `variant` and `size`, or `size` alone.
   */
  readonly variants?: 'size' | 'variant'
}

const atoms = (...names: string[]): Pick<StyledPart, 'atoms'> => ({ atoms: names })

const button: StyledPart = { ...atoms('baseUiButton'), variants: 'variant' }
const item = atoms('baseUiItem')
const popupArrow = atoms('baseUiArrow')

export const styledParts: Readonly<Record<string, StyledPart>> = {
  'Accordion.Header': atoms('baseUiAccordionHeader'),
  'Accordion.Item': atoms('baseUiAccordionItem'),
  'Accordion.Panel': atoms('baseUiAccordionPanel'),
  'Accordion.Trigger': atoms('baseUiDisclosureTrigger', 'baseUiDisclosureIcon'),
  Button: button,
  'Checkbox.Indicator': atoms('baseUiCheckboxIndicator'),
  'Checkbox.Root': atoms('baseUiCheckbox'),
  CheckboxGroup: atoms('baseUiChoiceGroup'),
  'Collapsible.Panel': atoms('baseUiCollapsiblePanel'),
  'Collapsible.Trigger': atoms('baseUiDisclosureTrigger', 'baseUiDisclosureIcon'),
  'Dialog.Close': button,
  'Dialog.Description': atoms('baseUiDescription'),
  'Dialog.Popup': atoms('baseUiDialogPopup'),
  'Dialog.Title': atoms('baseUiTitle'),
  'Dialog.Trigger': button,
  'Field.Control': atoms('baseUiInput'),
  'Field.Description': atoms('baseUiFieldDescription'),
  'Field.Error': atoms('baseUiFieldError'),
  'Field.Label': atoms('baseUiLabel'),
  'Field.Root': atoms('baseUiField'),
  'Fieldset.Legend': atoms('baseUiLegend'),
  'Fieldset.Root': atoms('baseUiFieldset'),
  Input: atoms('baseUiInput'),
  'Menu.Arrow': popupArrow,
  'Menu.CheckboxItem': item,
  'Menu.GroupLabel': atoms('baseUiGroupLabel'),
  'Menu.Item': item,
  'Menu.LinkItem': item,
  'Menu.Popup': atoms('baseUiListPopup'),
  'Menu.RadioItem': item,
  'Menu.Separator': atoms('baseUiSeparator'),
  'Menu.SubmenuTrigger': item,
  'Menu.Trigger': button,
  'NumberField.Decrement': atoms('baseUiNumberFieldStepper'),
  'NumberField.Group': atoms('baseUiNumberFieldGroup'),
  'NumberField.Increment': atoms('baseUiNumberFieldStepper'),
  'NumberField.Input': atoms('baseUiNumberFieldInput'),
  'NumberField.ScrubArea': atoms('baseUiNumberFieldScrubArea'),
  'Popover.Arrow': popupArrow,
  'Popover.Close': button,
  'Popover.Description': atoms('baseUiDescription'),
  'Popover.Popup': atoms('baseUiPopoverPopup'),
  'Popover.Title': atoms('baseUiTitle'),
  'Popover.Trigger': button,
  'Radio.Indicator': atoms('baseUiRadioIndicator'),
  'Radio.Root': atoms('baseUiRadio'),
  RadioGroup: atoms('baseUiChoiceGroup'),
  'Select.Arrow': popupArrow,
  'Select.GroupLabel': atoms('baseUiGroupLabel'),
  'Select.Icon': atoms('baseUiSelectIcon'),
  'Select.Item': item,
  'Select.Label': atoms('baseUiLabel'),
  'Select.Popup': atoms('baseUiListPopup'),
  'Select.Separator': atoms('baseUiSeparator'),
  'Select.Trigger': atoms('baseUiSelectTrigger'),
  'Select.Value': atoms('baseUiSelectValue'),
  'Slider.Control': atoms('baseUiSliderControl'),
  'Slider.Thumb': atoms('baseUiSliderThumb'),
  'Slider.Track': atoms('baseUiSliderTrack'),
  'Slider.Value': atoms('baseUiSliderValue'),
  'Switch.Root': atoms('baseUiSwitch'),
  'Switch.Thumb': atoms('baseUiSwitchThumb'),
  'Tabs.Indicator': atoms('baseUiTabIndicator'),
  'Tabs.List': atoms('baseUiTabList'),
  'Tabs.Tab': atoms('baseUiTab'),
  Toggle: { ...atoms('baseUiToggle'), variants: 'size' },
  ToggleGroup: atoms('baseUiToggleGroup'),
  'Toolbar.Button': button,
  'Toolbar.Group': atoms('baseUiToolbarGroup'),
  'Toolbar.Input': atoms('baseUiInput'),
  'Toolbar.Link': atoms('baseUiToolbarLink'),
  'Toolbar.Root': atoms('baseUiToolbar'),
  'Toolbar.Separator': atoms('baseUiToolbarSeparator'),
  'Tooltip.Arrow': popupArrow,
  'Tooltip.Popup': atoms('baseUiTooltipPopup'),
  'Tooltip.Trigger': button,
}
