import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { attributeReads } from './support/selector.ts'
import { flatten, PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'

const FLOOR = path.join(PACKAGE_DIR, 'node_modules/base-ui-react-floor/esm')

/**
 * Table T1, extended with the form rows: the data attributes and variables the stylesheet keys on,
 * each with the declaration file of the floor package (`@base-ui/react@1.0.0`) that declares it.
 * The transition attributes are declared through a shared enum, whose member name stands for them.
 */
const rows: readonly { files: readonly string[]; items: readonly string[] }[] = [
  {
    files: [
      'menu/positioner/MenuPositionerCssVars.js',
      'select/positioner/SelectPositionerCssVars.js',
    ],
    items: ['--anchor-width', '--available-height'],
  },
  { files: ['popover/positioner/PopoverPositionerCssVars.js'], items: ['--available-height'] },
  {
    files: [
      'popover/arrow/PopoverArrowDataAttributes.js',
      'menu/arrow/MenuArrowDataAttributes.js',
      'select/arrow/SelectArrowDataAttributes.js',
      'tooltip/arrow/TooltipArrowDataAttributes.js',
    ],
    items: ['data-side'],
  },
  { files: ['accordion/panel/AccordionPanelCssVars.js'], items: ['--accordion-panel-height'] },
  {
    files: ['collapsible/panel/CollapsiblePanelCssVars.js'],
    items: ['--collapsible-panel-height'],
  },
  {
    files: [
      'accordion/panel/AccordionPanelDataAttributes.js',
      'collapsible/panel/CollapsiblePanelDataAttributes.js',
    ],
    items: ['startingStyle', 'endingStyle'],
  },
  {
    files: ['tabs/list/TabsListDataAttributes.js', 'tabs/indicator/TabsIndicatorDataAttributes.js'],
    items: ['data-orientation'],
  },
  {
    files: ['tabs/indicator/TabsIndicatorCssVars.js'],
    items: ['--active-tab-left', '--active-tab-top', '--active-tab-width', '--active-tab-height'],
  },
  { files: ['select/value/SelectValueDataAttributes.js'], items: ['data-placeholder'] },
  {
    files: [
      'number-field/group/NumberFieldGroupDataAttributes.js',
      'slider/thumb/SliderThumbDataAttributes.js',
    ],
    items: ['data-disabled'],
  },
  {
    files: [
      'toggle-group/ToggleGroupDataAttributes.js',
      'toolbar/group/ToolbarGroupDataAttributes.js',
      'slider/control/SliderControlDataAttributes.js',
      'slider/track/SliderTrackDataAttributes.js',
      'slider/thumb/SliderThumbDataAttributes.js',
    ],
    items: ['data-orientation'],
  },
]

const TRANSITION_MEMBER: Readonly<Record<string, string>> = {
  'data-ending-style': 'endingStyle',
  'data-starting-style': 'startingStyle',
}

const isMissingFrom = (file: string, item: string): boolean =>
  !readFileSync(path.join(FLOOR, file), 'utf8').includes(item)

const keyedAttributes = (css: string): string[] =>
  flatten(css)
    .flatMap(({ selectors }) =>
      selectors.flatMap((selector) => attributeReads(selector).map(({ name }) => name)),
    )
    .filter((name) => !name.startsWith('aria-') && !name.startsWith('data-nave-'))

const keyedVariables = (css: string): string[] =>
  flatten(css)
    .flatMap(({ value }) =>
      value
        .matchAll(/var\((--[\w-]+)/g)
        .map((match) => match[1] ?? '')
        .toArray(),
    )
    .filter((name) => !name.startsWith('--nave-'))

describe('AC-base-ui-bridge-21: every attribute and variable the stylesheet keys on is declared at the floor', () => {
  it('finds the floor package installed through its alias', () => {
    expect(existsSync(FLOOR)).toBe(true)
  })

  for (const { files, items } of rows) {
    for (const file of files) {
      it(`${file} declares ${items.join(', ')}`, () => {
        expect(items.filter((item) => isMissingFrom(file, item))).toEqual([])
      })
    }
  }

  it('control: an item a file does not declare is reported', () => {
    expect(isMissingFrom('menu/arrow/MenuArrowDataAttributes.js', 'data-nope')).toBe(true)
  })

  it('has a row for every Base UI attribute and variable the stylesheet uses', () => {
    const css = readStylesheet()
    const keyed = new Set([...keyedAttributes(css), ...keyedVariables(css)])
    const covered = new Set(
      rows.flatMap(({ items }) =>
        items.flatMap((item) => [
          item,
          ...Object.entries(TRANSITION_MEMBER)
            .filter(([, member]) => member === item)
            .map(([name]) => name),
        ]),
      ),
    )
    expect([...keyed].filter((name) => !covered.has(name))).toEqual([])
  })
})
