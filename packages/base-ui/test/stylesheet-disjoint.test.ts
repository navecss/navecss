import { describe, expect, it } from 'vitest'

import type { FlatDeclaration } from './support/stylesheet.ts'

import { expectedSheet } from './support/feedback-states.ts'
import { compare, selectorSpecificity } from './support/selector.ts'
import { flatten, readStylesheet, resolveAgainst } from './support/stylesheet.ts'
import { tableP } from './support/table-p.ts'
import { generatedBox, isMutuallyExclusive } from './support/w2-exclusion.ts'
import { longhandsOf } from './support/w2-longhands.ts'

const PREFIX = 'nave-base-ui-'

const classes = (...names: string[]): string[] => names.map((name) => `${PREFIX}${name}`)

type Parts = ReadonlyMap<string, readonly string[]>

/**
 * The parts that gain a class or arrive with the overlay completion, each with every class it takes,
 * in the shipping state (every draft signed, the scrim at scope (i)). The first release's class
 * stays first.
 */
const OVERLAY_ROWS: readonly (readonly [readonly string[], readonly string[]])[] = [
  [
    [
      'Menu.Item',
      'Menu.CheckboxItem',
      'Menu.RadioItem',
      'Menu.LinkItem',
      'Menu.SubmenuTrigger',
      'Select.Item',
      'ContextMenu.Item',
      'ContextMenu.CheckboxItem',
      'ContextMenu.RadioItem',
      'ContextMenu.LinkItem',
      'ContextMenu.SubmenuTrigger',
    ],
    classes('item', 'item-highlight'),
  ],
  [['Menu.Popup', 'ContextMenu.Popup'], classes('list-popup', 'popup-motion')],
  [['Select.Popup', 'Combobox.Popup', 'Autocomplete.Popup'], classes('list-popup', 'popup-fade')],
  [['Popover.Popup'], classes('popover-popup', 'popup-motion')],
  [['PreviewCard.Popup'], classes('popover-popup', 'popup-fade')],
  [['Dialog.Popup', 'AlertDialog.Popup'], classes('dialog-popup', 'popup-fade')],
  [['Tooltip.Popup'], classes('tooltip-popup', 'tooltip-motion')],
  [
    [
      'Popover.Arrow',
      'Menu.Arrow',
      'Select.Arrow',
      'Tooltip.Arrow',
      'ContextMenu.Arrow',
      'PreviewCard.Arrow',
      'Combobox.Arrow',
      'Autocomplete.Arrow',
    ],
    classes('arrow', 'arrow-inline'),
  ],
  [['Tabs.Indicator'], classes('tab-indicator', 'tab-indicator-motion')],
  [['Combobox.Item', 'Autocomplete.Item'], classes('item', 'item-highlight', 'active-option')],
  [['AlertDialog.Trigger', 'AlertDialog.Close'], classes('button')],
  [['AlertDialog.Title'], classes('title')],
  [['AlertDialog.Description'], classes('description')],
  [['AlertDialog.Backdrop'], classes('backdrop')],
  [
    ['ContextMenu.GroupLabel', 'Combobox.GroupLabel', 'Autocomplete.GroupLabel'],
    classes('group-label'),
  ],
  [['ContextMenu.Separator', 'Combobox.Separator', 'Autocomplete.Separator'], classes('separator')],
  [['Menubar'], classes('toolbar')],
  [['Combobox.InputGroup', 'Autocomplete.InputGroup'], classes('input-group')],
  [['Combobox.Input', 'Autocomplete.Input'], classes('number-field-input')],
  [['Combobox.Trigger', 'Autocomplete.Trigger'], classes('combobox-trigger')],
  [['Combobox.Clear', 'Autocomplete.Clear'], classes('number-field-stepper')],
  [['Combobox.Icon', 'Autocomplete.Icon'], classes('select-icon')],
  [['Combobox.Label'], classes('label')],
  [['Combobox.Chips'], classes('chips')],
  [['Combobox.Chip'], classes('chip')],
  [['Combobox.ChipRemove'], classes('chip-remove')],
  [['Combobox.Empty', 'Autocomplete.Empty'], classes('list-empty')],
]

/**
 * The parts the feedback and navigation spec adds or changes, each with every class it takes in
 * the signature state (Table P delta, every #789 draft signed). A part that already has a class
 * keeps it first. Written here from the spec's table so the instrument does not wait on Table P.
 */
const FEEDBACK_ROWS: readonly (readonly [readonly string[], readonly string[]])[] = [
  [['Toast.Viewport'], classes('toast-viewport', 'toast-placement')],
  [['Toast.Root'], classes('toast-root', 'toast-fade', 'toast-limit')],
  [['Toast.Title'], classes('title')],
  [['Toast.Description'], classes('description')],
  [['Toast.Action', 'Toast.Close'], classes('button')],
  [['Toast.Arrow', 'NavigationMenu.Arrow'], classes('arrow', 'arrow-inline')],
  [['NavigationMenu.List'], classes('navigation-menu-list')],
  [['NavigationMenu.Trigger'], classes('navigation-menu-trigger')],
  [['NavigationMenu.Icon'], classes('navigation-menu-icon')],
  [['NavigationMenu.Link'], classes('toolbar-link', 'current-link')],
  [['NavigationMenu.Popup'], classes('popover-popup', 'navigation-menu-fade')],
  [['ScrollArea.Root'], classes('scroll-area')],
  [['ScrollArea.Viewport'], classes('scroll-area-viewport')],
  [['ScrollArea.Scrollbar'], classes('scroll-area-scrollbar')],
  [['ScrollArea.Thumb'], classes('scroll-area-thumb')],
  [['ScrollArea.Corner'], classes('scroll-area-corner')],
  [['Meter.Root', 'Progress.Root'], classes('value-bar')],
  [['Meter.Label', 'Progress.Label'], classes('label')],
  [['Meter.Value', 'Progress.Value'], classes('slider-value')],
  [['Meter.Track', 'Progress.Track'], classes('value-bar-track')],
  [['Meter.Indicator', 'Progress.Indicator'], classes('value-bar-indicator')],
  [['Avatar.Root'], classes('avatar')],
  [['Avatar.Image'], classes('avatar-image')],
  [['Avatar.Fallback'], classes('avatar-fallback')],
  [['Separator'], classes('toolbar-separator')],
]

/**
 * Table P with the overlay completion's rows and the feedback and navigation rows merged in: a part
 * keeps the classes it already has and gains the others after them.
 */
const combinedParts = (): Parts => {
  const merged = new Map<string, readonly string[]>(tableP)
  for (const [parts, names] of [...OVERLAY_ROWS, ...FEEDBACK_ROWS]) {
    for (const part of parts) {
      merged.set(part, [...new Set([...(merged.get(part) ?? []), ...names])])
    }
  }
  return merged
}

const COMBINED = combinedParts()

interface SettingRule {
  readonly owner: string
  readonly selector: string
  /**
  The generated box the rule paints on: the element, `::before`, `::after`, or `::placeholder`.
   */
  readonly box: string
  /**
  The physical longhands the rule sets, shorthands expanded and logical sides mapped to both.
   */
  readonly properties: Set<string>
}

const resolvedSelectors = (item: FlatDeclaration): string[] => {
  let selectors = [`.${item.owner}`]
  for (const list of item.selectors.slice(1)) selectors = resolveAgainst(selectors, list)
  return selectors
}

const addLonghands = (
  byRule: Map<string, SettingRule>,
  item: FlatDeclaration,
  selector: string,
): void => {
  const key = `${item.owner}|${selector}`
  const longhands = longhandsOf(item.property)
  const known = byRule.get(key)
  if (known === undefined) {
    byRule.set(key, {
      owner: item.owner,
      selector,
      box: generatedBox(selector),
      properties: new Set(longhands),
    })
  } else {
    for (const longhand of longhands) known.properties.add(longhand)
  }
}

/**
Every rule of a stylesheet with the longhands it sets, its selector resolved against its class.
A rule with a selector list is one rule per alternative, since each is judged on its own.
 */
const settingRules = (css: string): SettingRule[] => {
  const byRule = new Map<string, SettingRule>()
  for (const item of flatten(css)) {
    for (const selector of resolvedSelectors(item)) addLonghands(byRule, item, selector)
  }
  return byRule.values().toArray()
}

const pairsOf = (names: readonly string[]): string[][] =>
  names.flatMap((first, index) => names.slice(index + 1).map((second) => [first, second]))

/**
 * The class pairs that share a part, from a part-to-classes table.
 */
const sharedPairs = (parts: Parts): string[][] => {
  const pairs = parts
    .values()
    .flatMap((names) => pairsOf(names))
    .map((pair): [string, string[]] => [pair.join('|'), pair])
  return new Map(pairs).values().toArray()
}

const byText = (a: string, b: string): number => a.localeCompare(b)

const pairKey = (pair: readonly string[]): string => pair.toSorted(byText).join('|')

const where = (rule: SettingRule): string =>
  rule.box === 'element' ? rule.selector : `${rule.selector} on ${rule.box}`

/**
Each longhand both classes of a pair set on rules that can match one element, on the same generated
box, with the specificity of each.
 */
const conflictsOf = (css: string, pair: readonly string[]): string[] => {
  const [first = '', second = ''] = pair
  const rules = settingRules(css)
  return rules
    .filter((a) => a.owner === first)
    .flatMap((a) =>
      rules
        .filter(
          (b) =>
            b.owner === second && b.box === a.box && !isMutuallyExclusive(a.selector, b.selector),
        )
        .flatMap((b) =>
          [...a.properties]
            .filter((property) => b.properties.has(property))
            .map((property) => {
              const [x, y] = [selectorSpecificity(a.selector), selectorSpecificity(b.selector)]
              return `${property}: ${where(a)} (${x.join(',')}) against ${where(b)} (${y.join(',')}, ${compare(x, y) === 0 ? 'equal' : 'unequal'})`
            }),
        ),
    )
}

const conflicts = (css: string, parts: Parts): string[] =>
  sharedPairs(parts).flatMap((pair) => conflictsOf(css, pair))

/**
 * The shared-part pairs both of whose classes the stylesheet styles, each with the conflicts the
 * check found: the pairs it checked, and the ones it found conflict-free.
 */
const checkedPairs = (css: string, parts: Parts): { checked: string[]; free: string[] } => {
  const styled = new Set(settingRules(css).map((rule) => rule.owner))
  const checked = sharedPairs(parts).filter((pair) => pair.every((name) => styled.has(name)))
  return {
    checked: checked.map((pair) => pairKey(pair)),
    free: checked
      .filter((pair) => conflictsOf(css, pair).length === 0)
      .map((pair) => pairKey(pair)),
  }
}

const keysOf = (pairs: readonly (readonly string[])[]): string[] =>
  pairs.map((pair) => pairKey(pair.map((name) => `${PREFIX}${name}`))).toSorted(byText)

/**
 * Every pair of classes that share a part in the combined package.
 */
const SHARED = keysOf([
  ['disclosure-trigger', 'disclosure-icon'],
  ['dialog-popup', 'popup-fade'],
  ['list-popup', 'popup-motion'],
  ['list-popup', 'popup-fade'],
  ['popover-popup', 'popup-motion'],
  ['popover-popup', 'popup-fade'],
  ['tooltip-popup', 'tooltip-motion'],
  ['arrow', 'arrow-inline'],
  ['item', 'item-highlight'],
  ['item', 'active-option'],
  ['item-highlight', 'active-option'],
  ['tab-indicator', 'tab-indicator-motion'],
  ['toast-viewport', 'toast-placement'],
  ['toast-root', 'toast-fade'],
  ['toast-root', 'toast-limit'],
  ['toast-fade', 'toast-limit'],
  ['popover-popup', 'navigation-menu-fade'],
  ['toolbar-link', 'current-link'],
])

/**
 * The pairs the criterion names as checked and conflict-free.
 */
const NAMED_FREE = keysOf([
  ['arrow', 'arrow-inline'],
  ['item', 'item-highlight'],
  ['item-highlight', 'active-option'],
  ['dialog-popup', 'popup-fade'],
  ['list-popup', 'popup-motion'],
  ['tab-indicator', 'tab-indicator-motion'],
  ['toast-viewport', 'toast-placement'],
  ['toast-root', 'toast-fade'],
  ['toast-root', 'toast-limit'],
  ['toast-fade', 'toast-limit'],
  ['popover-popup', 'navigation-menu-fade'],
  ['toolbar-link', 'current-link'],
])

/**
 * The classes among a part's own that set the longhand on its box, in the part's class order.
 */
const settersOn = (css: string, part: string, longhand: string): string[] => {
  const own = COMBINED.get(part) ?? []
  return own.filter((name) =>
    settingRules(css).some(
      (rule) => rule.owner === name && rule.box === 'element' && rule.properties.has(longhand),
    ),
  )
}

const planted = (rule: string): string => `${readStylesheet()}\n@layer components.nave { ${rule} }`

describe('AC-base-ui-feedback-navigation-10 and AC-base-ui-overlay-completion-10: the disjointness instrument judges per box and per attribute value, and still bites', () => {
  it('finds exactly the shared-part pairs of the combined package', () => {
    expect(
      sharedPairs(COMBINED)
        .map((pair) => pairKey(pair))
        .toSorted(byText),
    ).toEqual(SHARED)
  })

  it('checks every shared-part pair of the stylesheet and reports no conflict', () => {
    expect(conflicts(readStylesheet(), COMBINED)).toEqual([])
    expect(checkedPairs(readStylesheet(), COMBINED).checked.toSorted(byText)).toEqual(SHARED)
  })

  it('names as checked and conflict-free the pairs the criterion lists', () => {
    expect(checkedPairs(readStylesheet(), COMBINED).free).toEqual(
      expect.arrayContaining(NAMED_FREE),
    )
  })

  it('checks all 18 shared-part pairs of the expected sheet and finds them conflict-free, the named six among them (the instrument on the oracle)', () => {
    const oracle = expectedSheet()
    const { checked, free } = checkedPairs(oracle, COMBINED)

    expect(checked.toSorted(byText)).toEqual(SHARED)
    expect(SHARED).toHaveLength(18)
    expect(free).toEqual(expect.arrayContaining(NAMED_FREE))
    expect(conflicts(oracle, COMBINED)).toEqual([])
  })

  it('names the Toast and Navigation Menu arrows as sharing the arrow and the inline arrow, and finds them conflict-free', () => {
    for (const part of ['Toast.Arrow', 'NavigationMenu.Arrow']) {
      expect(COMBINED.get(part)).toEqual(classes('arrow', 'arrow-inline'))
    }
    expect(conflictsOf(readStylesheet(), classes('arrow', 'arrow-inline'))).toEqual([])
  })

  it('sets display and align-items on the Track only in the value bar track, and max-block-size on the Indicator only in the value bar indicator', () => {
    const css = readStylesheet()

    expect(settersOn(css, 'Meter.Track', 'display')).toEqual(classes('value-bar-track'))
    expect(settersOn(css, 'Progress.Track', 'align-items')).toEqual(classes('value-bar-track'))
    expect(settersOn(css, 'Meter.Indicator', 'max-height')).toEqual(classes('value-bar-indicator'))
    expect(settersOn(css, 'Progress.Indicator', 'max-height')).toEqual(
      classes('value-bar-indicator'),
    )
  })

  it('sets scroll-padding-inline-end and scroll-padding-block-end only in the scroll area viewport, and padding-block on the Navigation Menu link only in the current link', () => {
    const css = readStylesheet()

    expect(settersOn(css, 'ScrollArea.Viewport', 'scroll-padding-right')).toEqual(
      classes('scroll-area-viewport'),
    )
    expect(settersOn(css, 'ScrollArea.Viewport', 'scroll-padding-bottom')).toEqual(
      classes('scroll-area-viewport'),
    )
    expect(settersOn(css, 'NavigationMenu.Link', 'padding-top')).toEqual(classes('current-link'))
    expect(settersOn(css, 'NavigationMenu.Link', 'padding-bottom')).toEqual(classes('current-link'))
    expect(settersOn(css, 'NavigationMenu.Link', 'padding-left')).toEqual(classes('toolbar-link'))
  })

  it('reports a planted rest text-decoration-thickness in the toolbar link against the current link key (control)', () => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}toolbar-link { text-decoration-thickness: 1px } }`

    expect(conflicts(css, COMBINED)).toEqual([
      `text-decoration-thickness: .${PREFIX}toolbar-link (0,1,0) against .${PREFIX}current-link[aria-current="page"] (0,2,0, unequal)`,
    ])
    expect(conflicts(expectedSheet(), COMBINED)).toEqual([])
  })

  it('reports a planted padding: 0 in the Navigation Menu fade against the popover popup padding (control)', () => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}navigation-menu-fade { padding: 0 } }`

    expect(conflicts(css, COMBINED)).toEqual(
      ['top', 'right', 'bottom', 'left'].map(
        (side) =>
          `padding-${side}: .${PREFIX}popover-popup (0,1,0) against .${PREFIX}navigation-menu-fade (0,1,0, equal)`,
      ),
    )
  })

  it('sees a second setter of a longhand the part owner must set alone: a padding-block in the toolbar link, a max-block-size in the track, a display in the indicator (control)', () => {
    const css = `${expectedSheet()}\n@layer components.nave { .${PREFIX}toolbar-link { padding-block: 1px } .${PREFIX}value-bar-indicator { display: block } }`

    expect(settersOn(expectedSheet(), 'NavigationMenu.Link', 'padding-top')).toEqual(
      classes('current-link'),
    )
    expect(settersOn(css, 'NavigationMenu.Link', 'padding-top')).toEqual(
      classes('toolbar-link', 'current-link'),
    )
    expect(conflicts(css, COMBINED)).toEqual([
      `padding-top: .${PREFIX}toolbar-link (0,1,0) against .${PREFIX}current-link (0,1,0, equal)`,
      `padding-bottom: .${PREFIX}toolbar-link (0,1,0) against .${PREFIX}current-link (0,1,0, equal)`,
    ])
  })

  it('reports a highlight rule on Menu.Item against the item disabled colour, at equal specificity (first control)', () => {
    const css = planted(`.${PREFIX}item-highlight { &[data-highlighted] { color: x } }`)

    expect(conflicts(css, COMBINED)).toEqual([
      `color: .${PREFIX}item[aria-disabled="true"] (0,2,0) against .${PREFIX}item-highlight[data-highlighted] (0,2,0, equal)`,
    ])
  })

  it('does not report the same rule once it excludes the disabled state with :not() (first control, second half)', () => {
    const css = planted(
      `.${PREFIX}item-highlight { &[data-highlighted]:not([aria-disabled="true"]) { color: x } }`,
    )

    expect(conflicts(css, COMBINED)).toEqual([])
  })

  it('joins a nested selector with no & to its parent as a descendant (control)', () => {
    const css = planted(`.${PREFIX}item-highlight { [data-highlighted] { color: x } }`)

    expect(conflicts(css, COMBINED)).toEqual([
      `color: .${PREFIX}item[aria-disabled="true"] (0,2,0) against .${PREFIX}item-highlight [data-highlighted] (0,2,0, equal)`,
    ])
  })

  it('judges every branch of a selector list, not only the first (control)', () => {
    const css = planted(
      `.${PREFIX}item-highlight { &[data-highlighted]:not([aria-disabled="true"]), &[data-highlighted] { color: x } }`,
    )

    expect(conflicts(css, COMBINED)).toEqual([
      `color: .${PREFIX}item[aria-disabled="true"] (0,2,0) against .${PREFIX}item-highlight[data-highlighted] (0,2,0, equal)`,
    ])
  })

  it('does not read a :not() holding two attributes as excluding either one (control)', () => {
    const css = planted(
      `.${PREFIX}item-highlight { &[data-highlighted]:not([aria-disabled="true"][data-side="top"]) { color: x } }`,
    )

    expect(conflicts(css, COMBINED)).toHaveLength(1)
  })

  it('reads each argument of :not(A, B) as excluded separately (control)', () => {
    const excluded = planted(
      `.${PREFIX}item-highlight { &[data-highlighted]:not([data-side="top"], [aria-disabled="true"]) { color: x } }`,
    )
    const kept = planted(
      `.${PREFIX}item-highlight { &[data-highlighted]:not([data-side="top"], [data-orientation="vertical"]) { color: x } }`,
    )

    expect(conflicts(excluded, COMBINED)).toEqual([])
    expect(conflicts(kept, COMBINED)).toHaveLength(1)
  })

  it('reports a planted element-box radius on the active option against the highlight radius, and not the shipped ::before radius (second control)', () => {
    const css = planted(`.${PREFIX}active-option { border-top-left-radius: 0 }`)

    expect(conflicts(css, COMBINED)).toEqual([
      `border-top-left-radius: .${PREFIX}item-highlight (0,1,0) against .${PREFIX}active-option (0,1,0, equal)`,
    ])
  })

  it('reports a planted bare rule on the inline arrow against the arrow side rules (third control)', () => {
    const css = planted(`.${PREFIX}arrow-inline { inset-inline-start: 0 }`)

    expect(conflicts(css, COMBINED)).toEqual([
      `right: .${PREFIX}arrow[data-side="left"] (0,2,0) against .${PREFIX}arrow-inline (0,1,0, unequal)`,
      `left: .${PREFIX}arrow[data-side="right"] (0,2,0) against .${PREFIX}arrow-inline (0,1,0, unequal)`,
    ])
  })

  it('reports a planted popup-fade margin against the dialog popup margin shorthand (fourth control)', () => {
    const css = planted(`.${PREFIX}popup-fade { margin-top: 4px }`)

    expect(conflicts(css, COMBINED)).toEqual([
      `margin-top: .${PREFIX}dialog-popup (0,1,0) against .${PREFIX}popup-fade (0,1,0, equal)`,
    ])
  })

  it('maps a logical longhand to the physical one it competes with (control)', () => {
    const css = planted(`.${PREFIX}popup-fade { width: 1px }`)

    expect(conflicts(css, COMBINED)).toEqual([
      `width: .${PREFIX}dialog-popup (0,1,0) against .${PREFIX}popup-fade (0,1,0, equal)`,
    ])
  })

  it('does not read two rules requiring one value of one attribute as disjoint (control)', () => {
    const css = planted(`.${PREFIX}arrow-inline { &[data-side="right"] { left: 0 } }`)

    expect(conflicts(css, COMBINED)).toEqual([
      `left: .${PREFIX}arrow[data-side="right"] (0,2,0) against .${PREFIX}arrow-inline[data-side="right"] (0,2,0, equal)`,
    ])
  })

  it('compares generated boxes with their own kind only (control)', () => {
    const parts = new Map([['Part', ['a', 'b']]])
    const sameBox =
      '@layer x { .a { &::before { border-radius: 1px } } .b { &::before { border-radius: 2px } } }'
    const otherBox =
      '@layer x { .a { border-radius: 1px } .b { &::before { border-radius: 2px } } }'

    expect(conflicts(sameBox, parts)).toEqual([
      'border-top-left-radius: .a::before on ::before (0,1,1) against .b::before on ::before (0,1,1, equal)',
      'border-top-right-radius: .a::before on ::before (0,1,1) against .b::before on ::before (0,1,1, equal)',
      'border-bottom-right-radius: .a::before on ::before (0,1,1) against .b::before on ::before (0,1,1, equal)',
      'border-bottom-left-radius: .a::before on ::before (0,1,1) against .b::before on ::before (0,1,1, equal)',
    ])
    expect(conflicts(otherBox, parts)).toEqual([])
  })
})
