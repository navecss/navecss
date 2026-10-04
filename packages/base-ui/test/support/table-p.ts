/**
 * Table P: every styled part of a v1 component and the class(es) it takes. The one place the
 * part-to-class mapping is written down for the instruments; the stylesheet's own class set and
 * the roles' atom names are both checked against it.
 */
const BASE = 'nave-base-ui-'

const classes = (...names: string[]): readonly string[] => names.map((name) => `${BASE}${name}`)

const rows: readonly (readonly [readonly string[], readonly string[]])[] = [
  [['Menu.Popup', 'Select.Popup'], classes('list-popup')],
  [['Popover.Popup'], classes('popover-popup')],
  [['Dialog.Popup'], classes('dialog-popup')],
  [['Tooltip.Popup'], classes('tooltip-popup')],
  [['Popover.Arrow', 'Menu.Arrow', 'Select.Arrow', 'Tooltip.Arrow'], classes('arrow')],
  [['Dialog.Title', 'Popover.Title'], classes('title')],
  [['Dialog.Description', 'Popover.Description'], classes('description')],
  [
    [
      'Menu.Item',
      'Menu.CheckboxItem',
      'Menu.RadioItem',
      'Menu.LinkItem',
      'Menu.SubmenuTrigger',
      'Select.Item',
    ],
    classes('item'),
  ],
  [['Menu.Separator', 'Select.Separator'], classes('separator')],
  [['Menu.GroupLabel', 'Select.GroupLabel'], classes('group-label')],
  [['Accordion.Trigger', 'Collapsible.Trigger'], classes('disclosure-trigger', 'disclosure-icon')],
  [['Accordion.Header'], classes('accordion-header')],
  [['Accordion.Item'], classes('accordion-item')],
  [['Accordion.Panel'], classes('accordion-panel')],
  [['Collapsible.Panel'], classes('collapsible-panel')],
  [['Tabs.List'], classes('tab-list')],
  [['Tabs.Tab'], classes('tab')],
  [['Tabs.Indicator'], classes('tab-indicator')],
  [
    [
      'Button',
      'Toolbar.Button',
      'Dialog.Trigger',
      'Dialog.Close',
      'Popover.Trigger',
      'Popover.Close',
      'Menu.Trigger',
      'Tooltip.Trigger',
    ],
    classes('button'),
  ],
  [['Toggle'], classes('toggle')],
  [['ToggleGroup'], classes('toggle-group')],
  [['Input', 'Field.Control', 'Toolbar.Input'], classes('input')],
  [['Select.Trigger'], classes('select-trigger')],
  [['Select.Value'], classes('select-value')],
  [['Select.Icon'], classes('select-icon')],
  [['Field.Root'], classes('field')],
  [['Field.Label', 'Select.Label'], classes('label')],
  [['Field.Description'], classes('field-description')],
  [['Field.Error'], classes('field-error')],
  [['Fieldset.Root'], classes('fieldset')],
  [['Fieldset.Legend'], classes('legend')],
  [['Checkbox.Root'], classes('checkbox')],
  [['Checkbox.Indicator'], classes('checkbox-indicator')],
  [['Radio.Root'], classes('radio')],
  [['Radio.Indicator'], classes('radio-indicator')],
  [['CheckboxGroup', 'RadioGroup'], classes('choice-group')],
  [['Switch.Root'], classes('switch')],
  [['Switch.Thumb'], classes('switch-thumb')],
  [['NumberField.Group'], classes('number-field-group')],
  [['NumberField.Input'], classes('number-field-input')],
  [['NumberField.Increment', 'NumberField.Decrement'], classes('number-field-stepper')],
  [['NumberField.ScrubArea'], classes('number-field-scrub-area')],
  [['Toolbar.Root'], classes('toolbar')],
  [['Toolbar.Group'], classes('toolbar-group')],
  [['Toolbar.Separator'], classes('toolbar-separator')],
  [['Toolbar.Link'], classes('toolbar-link')],
  [['Slider.Control'], classes('slider-control')],
  [['Slider.Track'], classes('slider-track')],
  [['Slider.Thumb'], classes('slider-thumb')],
  [['Slider.Value'], classes('slider-value')],
]

/**
Part (as `Namespace.Part`, or the bare component) to its class names.
 */
export const tableP: ReadonlyMap<string, readonly string[]> = new Map(
  rows.flatMap(([parts, names]) => parts.map((part) => [part, names] as const)),
)

/**
Every class the table names, the Slider's four included (its signature is given).
 */
export const tablePClasses: ReadonlySet<string> = new Set(rows.flatMap(([, names]) => names))

/**
The classes of the Slider, which ships only because its signature is given.
 */
export const sliderClasses: readonly string[] = classes(
  'slider-control',
  'slider-track',
  'slider-thumb',
  'slider-value',
)

/**
 * Table T2: the focusable parts that take `focusRing`. The Slider thumb, the four popups when they
 * take focus themselves and the number field's steppers are excluded by name.
 */
export const focusRingClasses: readonly string[] = classes(
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
)
