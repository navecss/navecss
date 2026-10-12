/**
 * Table P: every styled part of a component and the class(es) it takes, for a signature state. The
 * one place the part-to-class mapping is written down for the instruments; the stylesheet's own
 * class set and the roles' atom names are both checked against it. `tableP`, `tablePClasses` and
 * `focusRingClasses` are the shipping state (every draft signed, the scrim at scope (i)).
 */
import type { Draft } from './draft-states.ts'

const BASE = 'nave-base-ui-'

/**
 * Where the scrim class goes when `scrim` is signed: at scope (i) on `AlertDialog.Backdrop` alone,
 * at scope (ii) on `Dialog.Backdrop` too.
 */
export type BackdropScope = 'i' | 'ii'

interface ClassEntry {
  readonly name: string
  /**
  The draft that has to be signed for the class to ship; absent when it always ships.
   */
  readonly draft?: Draft
}

interface Row {
  readonly parts: readonly string[]
  readonly classes: readonly ClassEntry[]
  /**
  The draft that has to be signed for the row to exist at all.
   */
  readonly draft?: Draft
  readonly scope?: BackdropScope
}

const always = (name: string): ClassEntry => ({ name: `${BASE}${name}` })

const signedWith = (draft: Draft, name: string): ClassEntry => ({
  name: `${BASE}${name}`,
  draft,
})

const row = (parts: readonly string[], ...classes: readonly ClassEntry[]): Row => ({
  parts,
  classes,
})

const rowWith = (
  draft: Draft,
  parts: readonly string[],
  ...classes: readonly ClassEntry[]
): Row => ({
  parts,
  classes,
  draft,
})

const MENU_ITEMS = [
  'Menu.Item',
  'Menu.CheckboxItem',
  'Menu.RadioItem',
  'Menu.LinkItem',
  'Menu.SubmenuTrigger',
]

const CONTEXT_MENU_ITEMS = [
  'ContextMenu.Item',
  'ContextMenu.CheckboxItem',
  'ContextMenu.RadioItem',
  'ContextMenu.LinkItem',
  'ContextMenu.SubmenuTrigger',
]

const rows: readonly Row[] = [
  row(['Menu.Popup'], always('list-popup'), signedWith('popup-fade', 'popup-motion')),
  row(['Select.Popup'], always('list-popup'), signedWith('popup-fade', 'popup-fade')),
  row(['Popover.Popup'], always('popover-popup'), signedWith('popup-fade', 'popup-motion')),
  row(['Dialog.Popup'], always('dialog-popup'), signedWith('popup-fade', 'popup-fade')),
  row(['Tooltip.Popup'], always('tooltip-popup'), signedWith('tooltip-fade', 'tooltip-motion')),
  row(
    ['Popover.Arrow', 'Menu.Arrow', 'Select.Arrow', 'Tooltip.Arrow'],
    always('arrow'),
    always('arrow-inline'),
  ),
  row(['Dialog.Title', 'Popover.Title'], always('title')),
  row(['Dialog.Description', 'Popover.Description'], always('description')),
  row(
    [...MENU_ITEMS, 'Select.Item'],
    always('item'),
    signedWith('highlight-fill', 'item-highlight'),
  ),
  row(['Menu.Separator', 'Select.Separator'], always('separator')),
  row(['Menu.GroupLabel', 'Select.GroupLabel'], always('group-label')),
  row(
    ['Accordion.Trigger', 'Collapsible.Trigger'],
    always('disclosure-trigger'),
    always('disclosure-icon'),
  ),
  row(['Accordion.Header'], always('accordion-header')),
  row(['Accordion.Item'], always('accordion-item')),
  row(['Accordion.Panel'], always('accordion-panel')),
  row(['Collapsible.Panel'], always('collapsible-panel')),
  row(['Tabs.List'], always('tab-list')),
  row(['Tabs.Tab'], always('tab')),
  row(['Tabs.Indicator'], always('tab-indicator'), always('tab-indicator-motion')),
  row(
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
    always('button'),
  ),
  row(['Toggle'], always('toggle')),
  row(['ToggleGroup'], always('toggle-group')),
  row(['Input', 'Field.Control', 'Toolbar.Input'], always('input')),
  row(['Select.Trigger'], always('select-trigger')),
  row(['Select.Value'], always('select-value')),
  row(['Select.Icon'], always('select-icon')),
  row(['Field.Root'], always('field')),
  row(['Field.Label', 'Select.Label'], always('label')),
  row(['Field.Description'], always('field-description')),
  row(['Field.Error'], always('field-error')),
  row(['Fieldset.Root'], always('fieldset')),
  row(['Fieldset.Legend'], always('legend')),
  row(['Checkbox.Root'], always('checkbox')),
  row(['Checkbox.Indicator'], always('checkbox-indicator')),
  row(['Radio.Root'], always('radio')),
  row(['Radio.Indicator'], always('radio-indicator')),
  row(['CheckboxGroup', 'RadioGroup'], always('choice-group')),
  row(['Switch.Root'], always('switch')),
  row(['Switch.Thumb'], always('switch-thumb')),
  row(['NumberField.Group'], always('number-field-group')),
  row(['NumberField.Input'], always('number-field-input')),
  row(['NumberField.Increment', 'NumberField.Decrement'], always('number-field-stepper')),
  row(['NumberField.ScrubArea'], always('number-field-scrub-area')),
  row(['Toolbar.Root'], always('toolbar')),
  row(['Toolbar.Group'], always('toolbar-group')),
  row(['Toolbar.Separator'], always('toolbar-separator')),
  row(['Toolbar.Link'], always('toolbar-link')),
  row(['Slider.Control'], always('slider-control')),
  row(['Slider.Track'], always('slider-track')),
  row(['Slider.Thumb'], always('slider-thumb')),
  row(['Slider.Value'], always('slider-value')),
  // The scrim: `Dialog.Backdrop` takes it only at scope (ii); `AlertDialog.Backdrop` at either.
  { parts: ['Dialog.Backdrop'], classes: [always('backdrop')], draft: 'scrim', scope: 'ii' },
  rowWith('scrim', ['AlertDialog.Backdrop'], always('backdrop')),
  // Alert Dialog.
  row(['AlertDialog.Trigger', 'AlertDialog.Close'], always('button')),
  row(['AlertDialog.Popup'], always('dialog-popup'), signedWith('popup-fade', 'popup-fade')),
  row(['AlertDialog.Title'], always('title')),
  row(['AlertDialog.Description'], always('description')),
  // Context Menu.
  row(['ContextMenu.Popup'], always('list-popup'), signedWith('popup-fade', 'popup-motion')),
  row(['ContextMenu.Arrow'], always('arrow'), always('arrow-inline')),
  row(CONTEXT_MENU_ITEMS, always('item'), signedWith('highlight-fill', 'item-highlight')),
  row(['ContextMenu.GroupLabel'], always('group-label')),
  row(['ContextMenu.Separator'], always('separator')),
  // Menubar.
  row(['Menubar'], always('toolbar')),
  // Preview Card.
  row(['PreviewCard.Popup'], always('popover-popup'), signedWith('popup-fade', 'popup-fade')),
  row(['PreviewCard.Arrow'], always('arrow'), always('arrow-inline')),
  // Combobox and Autocomplete: they ship with `combobox`.
  rowWith('combobox', ['Combobox.InputGroup', 'Autocomplete.InputGroup'], always('input-group')),
  rowWith('combobox', ['Combobox.Input', 'Autocomplete.Input'], always('number-field-input')),
  rowWith('combobox', ['Combobox.Trigger', 'Autocomplete.Trigger'], always('combobox-trigger')),
  rowWith('combobox', ['Combobox.Clear', 'Autocomplete.Clear'], always('number-field-stepper')),
  rowWith('combobox', ['Combobox.Icon', 'Autocomplete.Icon'], always('select-icon')),
  rowWith('combobox', ['Combobox.Label'], always('label')),
  rowWith('combobox', ['Combobox.Chips'], always('chips')),
  rowWith('combobox', ['Combobox.Chip'], always('chip')),
  rowWith('combobox', ['Combobox.ChipRemove'], always('chip-remove')),
  rowWith(
    'combobox',
    ['Combobox.Popup', 'Autocomplete.Popup'],
    always('list-popup'),
    signedWith('popup-fade', 'popup-fade'),
  ),
  rowWith(
    'combobox',
    ['Combobox.Arrow', 'Autocomplete.Arrow'],
    always('arrow'),
    always('arrow-inline'),
  ),
  rowWith(
    'combobox',
    ['Combobox.Item', 'Autocomplete.Item'],
    always('item'),
    signedWith('highlight-fill', 'item-highlight'),
    always('active-option'),
  ),
  rowWith('combobox', ['Combobox.GroupLabel', 'Autocomplete.GroupLabel'], always('group-label')),
  rowWith('combobox', ['Combobox.Separator', 'Autocomplete.Separator'], always('separator')),
  rowWith('combobox', ['Combobox.Empty', 'Autocomplete.Empty'], always('list-empty')),
]

const isSigned = (draft: Draft | undefined, unsigned: readonly Draft[]): boolean =>
  draft === undefined || !unsigned.includes(draft)

/**
 * The part-to-classes map of a signature state: `unsigned` names the drafts not signed (none is
 * the shipping state), `scope` is the scope `scrim` is signed at. The v1 class stays first in a row.
 */
export const tablePFor = (
  unsigned: readonly Draft[] = [],
  scope: BackdropScope = 'i',
): ReadonlyMap<string, readonly string[]> =>
  new Map(
    rows
      .filter((item) => isSigned(item.draft, unsigned) && (item.scope ?? scope) === scope)
      .flatMap((item) => {
        const names = item.classes
          .filter((entry) => isSigned(entry.draft, unsigned))
          .map((entry) => entry.name)
        return item.parts.map((part) => [part, names] as const)
      }),
  )

/**
 * Every class Table P names for a signature state.
 */
export const tablePClassesFor = (
  unsigned: readonly Draft[] = [],
  scope: BackdropScope = 'i',
): ReadonlySet<string> => new Set(tablePFor(unsigned, scope).values().toArray().flat())

/**
Part (as `Namespace.Part`, or the bare component) to its class names, in the shipping state:
every draft signed, `scrim` at scope (i).
 */
export const tableP: ReadonlyMap<string, readonly string[]> = tablePFor()

/**
Every class the table names in the shipping state, the Slider's four included (its signature is given).
 */
export const tablePClasses: ReadonlySet<string> = tablePClassesFor()

/**
The classes of the Slider, which ships only because its signature is given.
 */
export const sliderClasses: readonly string[] = [
  'slider-control',
  'slider-track',
  'slider-thumb',
  'slider-value',
].map((name) => `${BASE}${name}`)

/**
 * Table T2: the focusable parts that take `focusRing`, for a signature state. The Slider thumb, the
 * four popups when they take focus themselves and the number field's steppers are excluded by
 * name; the chip and the combobox trigger are in only while `combobox` is signed.
 */
export const focusRingClassesFor = (unsigned: readonly Draft[] = []): readonly string[] =>
  [
    always('button'),
    always('input'),
    always('select-trigger'),
    always('number-field-input'),
    always('checkbox'),
    always('radio'),
    always('switch'),
    always('toggle'),
    always('tab'),
    always('disclosure-trigger'),
    always('item'),
    always('toolbar-link'),
    signedWith('combobox', 'chip'),
    signedWith('combobox', 'combobox-trigger'),
  ]
    .filter((entry) => isSigned(entry.draft, unsigned))
    .map((entry) => entry.name)

/**
 * Table T2 in the shipping state.
 */
export const focusRingClasses: readonly string[] = focusRingClassesFor()
