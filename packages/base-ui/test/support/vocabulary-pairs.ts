/**
 * The (class, item) pairs each render row of AC-22 and AC-29 asserts: a class of the stylesheet and
 * a Base UI attribute or variable its rules key on. The linkage scenario compares their union with the
 * pairs read out of the stylesheet, so a key added to a rule without a render row reds it. Each
 * render test file records the pairs its rows assert as they run (`support/row-pairs.ts`) and ends
 * by checking that its own table was recorded in full. That check holds one pair at a time: a
 * pair that no row records any more reds the file, and a pair that several rows record (the
 * `aria-disabled` of the items, say) stays recorded while any one of them runs. The disabled-part
 * table has its own check that every part is still listed.
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
    ...pairs('item-highlight', 'aria-disabled'),
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
  arrowInline: pairs('arrow-inline', 'data-side'),
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

/**
The pairs the Combobox and Autocomplete rows assert (`test/render/completion-combobox.test.ts`):
the active option, the chips, the trigger and the empty message.
 */
export const COMBOBOX_PAIRS: Table = {
  activeOption: pairs('active-option', 'data-highlighted'),
  chips: [...pairs('chip', 'aria-disabled'), ...pairs('chip-remove', 'aria-disabled')],
  empty: pairs('list-empty', 'data-empty'),
  trigger: pairs('combobox-trigger', 'aria-disabled', 'aria-haspopup', 'aria-invalid'),
}

/**
The pairs the field box's rows assert (`test/render/completion-input-group.test.ts`).
 */
export const INPUT_GROUP_PAIRS: Table = {
  group: pairs('input-group', 'data-disabled', 'data-invalid'),
}

/**
The pairs the list rows assert (`test/render/completion-lists.test.ts`): the highlight fill.
 */
export const LIST_PAIRS: Table = {
  highlight: pairs('item-highlight', 'data-highlighted'),
}

/**
The pairs the popup rows assert (`test/render/completion-overlays.test.ts`): the open ghost
trigger and the transient attributes the motion classes key on.
 */
export const POPUP_PAIRS: Table = {
  backdrop: pairs('backdrop', 'data-ending-style', 'data-starting-style'),
  expanded: pairs('button', 'aria-expanded'),
  popupFade: pairs('popup-fade', 'data-ending-style', 'data-starting-style'),
  popupMotion: pairs('popup-motion', 'data-ending-style', 'data-instant', 'data-starting-style'),
  tooltipMotion: pairs(
    'tooltip-motion',
    'data-ending-style',
    'data-instant',
    'data-starting-style',
  ),
}

/**
The `&[data-instant]` key of the reduced-motion guard on the three motion classes whose parts do
not declare `data-instant` at every minor: it matches nothing there, and no render row asserts it.
 */
export const GUARD_PAIRS: readonly Pair[] = [
  pair('backdrop', 'data-instant'),
  pair('popup-fade', 'data-instant'),
  pair('tab-indicator-motion', 'data-instant'),
]

/**
The pairs the feedback and navigation render rows assert (AC-39's Examples, Tier A): the limited
toast, the closing toast, the Icon on its open trigger, the Navigation Menu panel's transient
attributes, the current link, the Scroll Area scrollbar and thumb, the indeterminate Progress
Indicator, and the trigger's `aria-disabled` (the hover key's `:not()`, asserted by AC-20's
disabled-trigger rows). The Arrows' `data-side` pair is the existing `arrowInline` one.
 */
export const FEEDBACK_PAIRS: Table = {
  currentLink: pairs('current-link', 'aria-current'),
  disabledTrigger: pairs('navigation-menu-trigger', 'aria-disabled'),
  indeterminate: pairs('value-bar-indicator', 'data-indeterminate'),
  limited: pairs('toast-limit', 'data-limited'),
  menuIcon: pairs('navigation-menu-icon', 'aria-expanded'),
  menuTransition: pairs('navigation-menu-fade', 'data-ending-style', 'data-starting-style'),
  scrollOrientation: [
    ...pairs('scroll-area-scrollbar', 'data-orientation'),
    ...pairs('scroll-area-thumb', 'data-orientation'),
  ],
  toastEnding: pairs('toast-fade', 'data-ending-style'),
}

/**
The pairs jsdom cannot produce, asserted by the Tier B rows of the criterion each names (AC-39's
second scenario): an opening toast (`data-starting-style` is not set on `Toast.Root` in jsdom), a
swiped toast, and an overflowing Viewport. Each is a pair of the stylesheet and each is asserted
by a browser test that names the criterion and the item.
 */
export const TIER_B_PAIRS: readonly (readonly [Pair, string])[] = [
  [pair('toast-fade', 'data-starting-style'), 'AC-base-ui-feedback-navigation-15'],
  [pair('toast-fade', 'data-swipe-direction'), 'AC-base-ui-feedback-navigation-15'],
  [pair('scroll-area-viewport', 'data-has-overflow-x'), 'AC-base-ui-feedback-navigation-28'],
  [pair('scroll-area-viewport', 'data-has-overflow-y'), 'AC-base-ui-feedback-navigation-28'],
]

/**
The one (class, part) pair no row asserts: `&[data-indeterminate]` on `Meter.Indicator`, which
declares the attribute at no minor and never carries it. Its (class, item) pair is asserted by
`Progress.Indicator`'s row, so no extracted pair goes unasserted; this constant names the part so
that the exemption is exactly this one and reaches nothing else.
 */
export const METER_INDICATOR_EXEMPT: Readonly<{ pair: Pair; part: string }> = {
  part: 'Meter.Indicator',
  pair: pair('value-bar-indicator', 'data-indeterminate'),
}

export const ROW_PAIRS: Table = {
  ...CONTROL_PAIRS,
  ...OVERLAY_PAIRS,
  ...COMBOBOX_PAIRS,
  ...INPUT_GROUP_PAIRS,
  ...LIST_PAIRS,
  ...POPUP_PAIRS,
  ...FEEDBACK_PAIRS,
}
