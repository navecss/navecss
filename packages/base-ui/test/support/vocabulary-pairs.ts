/**
 * The (class, item) pairs each render row of AC-22 asserts: a class of the stylesheet and a Base
 * UI attribute or variable its rules key on. The linkage scenario compares their union with the
 * pairs read out of the stylesheet, so a key added to a rule without a render row reds it. Each
 * render test file records the pairs its rows assert as they run (`support/row-pairs.ts`) and ends
 * by checking that its own table was recorded in full, so a row that is skipped or removed reds
 * the file instead of leaving its pairs listed here.
 */
export type Pair = readonly [string, string]

const P = 'nave-base-ui-'
const pairs = (cls: string, ...items: string[]): Pair[] => items.map((item) => [`${P}${cls}`, item])

export const pair = (cls: string, item: string): Pair => [`${P}${cls}`, item]

type Table = Readonly<Record<string, readonly Pair[]>>

/**
The pairs the controls' render rows assert (`test/render/vocabulary-controls.test.ts`).
 */
export const CONTROL_PAIRS: Table = {
  checked: [
    ...pairs('checkbox-indicator', 'aria-checked'),
    ...pairs('switch-thumb', 'aria-checked'),
  ],
  disabled: [
    ...pairs('button', 'aria-disabled'),
    ...pairs('checkbox', 'aria-disabled'),
    ...pairs('disclosure-trigger', 'aria-disabled'),
    ...pairs('input', 'aria-disabled'),
    ...pairs('item', 'aria-disabled'),
    ...pairs('number-field-stepper', 'aria-disabled'),
    ...pairs('radio', 'aria-disabled'),
    ...pairs('select-trigger', 'aria-disabled'),
    ...pairs('switch', 'aria-disabled'),
    ...pairs('tab', 'aria-disabled'),
    ...pairs('toggle', 'aria-disabled'),
  ],
  disabledData: [
    ...pairs('number-field-group', 'data-disabled'),
    ...pairs('slider-thumb', 'data-disabled'),
  ],
  invalid: [
    ...pairs('checkbox', 'aria-invalid'),
    ...pairs('input', 'aria-invalid'),
    ...pairs('number-field-group', 'aria-invalid'),
    ...pairs('radio', 'aria-invalid'),
    ...pairs('select-trigger', 'aria-invalid'),
    ...pairs('switch', 'aria-invalid'),
  ],
  orientation: [
    ...pairs('slider-control', 'data-orientation'),
    ...pairs('slider-thumb', 'data-orientation'),
    ...pairs('slider-track', 'data-orientation'),
    ...pairs('toggle-group', 'data-orientation'),
    ...pairs('toolbar', 'aria-orientation'),
    ...pairs('toolbar-group', 'data-orientation'),
    ...pairs('toolbar-separator', 'aria-orientation'),
  ],
  pressed: pairs('toggle', 'aria-pressed'),
}

/**
The pairs the overlays' and disclosure parts' render rows assert (`test/render/vocabulary-overlays.test.ts`).
 */
export const OVERLAY_PAIRS: Table = {
  arrow: pairs('arrow', 'data-side'),
  disclosureIcon: pairs('disclosure-icon', 'aria-expanded'),
  panelVariable: [
    ...pairs('accordion-panel', '--accordion-panel-height'),
    ...pairs('collapsible-panel', '--collapsible-panel-height'),
  ],
  placeholder: pairs('select-value', 'data-placeholder'),
  positionerVariables: [
    ...pairs('list-popup', '--anchor-width', '--available-height'),
    ...pairs('popover-popup', '--available-height'),
  ],
  tabIndicatorVariables: pairs(
    'tab-indicator',
    '--active-tab-height',
    '--active-tab-left',
    '--active-tab-top',
    '--active-tab-width',
  ),
  tabOrientation: [
    ...pairs('tab-indicator', 'data-orientation'),
    ...pairs('tab-list', 'aria-orientation'),
  ],
  transition: [
    ...pairs('accordion-panel', 'data-ending-style', 'data-starting-style'),
    ...pairs('collapsible-panel', 'data-ending-style', 'data-starting-style'),
  ],
}

export const ROW_PAIRS: Table = { ...CONTROL_PAIRS, ...OVERLAY_PAIRS }
