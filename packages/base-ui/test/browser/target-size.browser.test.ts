/**
 * AC-base-ui-bridge-35: every interactive styled part is at least 24 by 24 CSS px (WCAG 2.2
 * SC 2.5.8's minimum) where a pointer reaches it, at its default size, in its default and (where
 * it has one) its invalid state. Checkbox, Radio and Switch reach it through the hit areas their roots
 * carry; the Slider's target is its Control, not its Thumb.
 *
 * Measured in a real engine with the built tokens and stylesheet, through the built wrappers, by
 * `elementFromPoint` along each part's centre row and column (`support/hit-extent.ts`): jsdom has
 * no layout, and a size read from a style declaration says nothing about what a pointer hits.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Accordion } from '../../dist/accordion/index.js'
import { Button } from '../../dist/button/index.js'
import { Checkbox } from '../../dist/checkbox/index.js'
import { Collapsible } from '../../dist/collapsible/index.js'
import { Dialog } from '../../dist/dialog/index.js'
import { Field } from '../../dist/field/index.js'
import { Input } from '../../dist/input/index.js'
import { Menu } from '../../dist/menu/index.js'
import { NumberField } from '../../dist/number-field/index.js'
import { Popover } from '../../dist/popover/index.js'
import { RadioGroup } from '../../dist/radio-group/index.js'
import { Radio } from '../../dist/radio/index.js'
import { Select } from '../../dist/select/index.js'
import { Slider } from '../../dist/slider/index.js'
import { Switch } from '../../dist/switch/index.js'
import { Tabs } from '../../dist/tabs/index.js'
import { ToggleGroup } from '../../dist/toggle-group/index.js'
import { Toggle } from '../../dist/toggle/index.js'
import { Toolbar } from '../../dist/toolbar/index.js'
import { Tooltip } from '../../dist/tooltip/index.js'
import { hitExtent } from './support/hit-extent.ts'
import {
  byTestId,
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'

/**
SC 2.5.8's minimum, in CSS px.
 */
const MINIMUM = 24
/**
Edges are found to 0.001px, and layout rounds to a 64th of a pixel: a shortfall of one 64th fails.
 */
const TOLERANCE = 0.005

const subject = { 'data-testid': 'subject' } as const
const invalid = { 'aria-invalid': true } as const

interface Row {
  readonly part: string
  readonly state: 'default' | 'invalid'
  /**
  The scene: the part carries the `subject` test id, and a popup's parts are rendered open.
   */
  readonly scene: () => ReactNode
}

const bothStates = (part: string, scene: (state: object) => ReactNode): Row[] => [
  { part, scene: () => scene({}), state: 'default' },
  { part, scene: () => scene(invalid), state: 'invalid' },
]

const openMenu = (...items: ReactNode[]): ReactNode =>
  h(
    Menu.Root,
    { defaultOpen: true },
    h(Menu.Trigger, {}, 'Open'),
    h(Menu.Portal, {}, h(Menu.Positioner, {}, h(Menu.Popup, {}, ...items))),
  )

const openSelect = (): ReactNode =>
  h(
    Select.Root,
    { defaultOpen: true, defaultValue: 'a' },
    h(Select.Trigger, {}, h(Select.Value), h(Select.Icon, {}, 'v')),
    h(
      Select.Portal,
      {},
      h(
        Select.Positioner,
        {},
        h(
          Select.Popup,
          {},
          h(
            Select.List,
            {},
            h(Select.Item, { value: 'a' }, h(Select.ItemText, {}, 'A')),
            h(Select.Item, { ...subject, value: 'b' }, h(Select.ItemText, {}, 'B')),
          ),
        ),
      ),
    ),
  )

const rows: readonly Row[] = [
  { part: 'Button', scene: () => h(Button, { ...subject }, 'Save'), state: 'default' },
  { part: 'Toggle', scene: () => h(Toggle, { ...subject }, 'Bold'), state: 'default' },
  {
    part: 'ToggleGroup (a Toggle in it)',
    scene: () => h(ToggleGroup, {}, h(Toggle, { ...subject, value: 'a' }, 'A')),
    state: 'default',
  },
  {
    part: 'Toolbar.Button',
    scene: () => h(Toolbar.Root, {}, h(Toolbar.Button, { ...subject }, 'Save')),
    state: 'default',
  },
  {
    part: 'Dialog.Trigger',
    scene: () => h(Dialog.Root, {}, h(Dialog.Trigger, { ...subject }, 'Open')),
    state: 'default',
  },
  {
    part: 'Dialog.Close',
    scene: () =>
      h(
        Dialog.Root,
        { defaultOpen: true },
        h(Dialog.Portal, {}, h(Dialog.Popup, {}, h(Dialog.Close, { ...subject }, 'Close'))),
      ),
    state: 'default',
  },
  {
    part: 'Popover.Trigger',
    scene: () => h(Popover.Root, {}, h(Popover.Trigger, { ...subject }, 'Open')),
    state: 'default',
  },
  {
    part: 'Popover.Close',
    scene: () =>
      h(
        Popover.Root,
        { defaultOpen: true },
        h(Popover.Trigger, {}, 'Open'),
        h(
          Popover.Portal,
          {},
          h(
            Popover.Positioner,
            {},
            h(Popover.Popup, {}, h(Popover.Close, { ...subject }, 'Close')),
          ),
        ),
      ),
    state: 'default',
  },
  {
    part: 'Menu.Trigger',
    scene: () => h(Menu.Root, {}, h(Menu.Trigger, { ...subject }, 'Open')),
    state: 'default',
  },
  {
    part: 'Tooltip.Trigger',
    scene: () =>
      h(Tooltip.Provider, {}, h(Tooltip.Root, {}, h(Tooltip.Trigger, { ...subject }, 'Hover'))),
    state: 'default',
  },
  ...bothStates('Input', (state) => h(Input, { ...subject, ...state, 'aria-label': 'Name' })),
  {
    part: 'Field.Control',
    scene: () => h(Field.Root, {}, h(Field.Control, { ...subject, 'aria-label': 'Name' })),
    state: 'default',
  },
  {
    part: 'Field.Control',
    // Base UI marks the control invalid once the field is invalid and its error is rendered.
    scene: () =>
      h(
        Field.Root,
        { invalid: true },
        h(Field.Control, { ...subject, 'aria-label': 'Name' }),
        h(Field.Error, { match: true }, 'Required'),
      ),
    state: 'invalid',
  },
  {
    part: 'Toolbar.Input',
    scene: () => h(Toolbar.Root, {}, h(Toolbar.Input, { ...subject, 'aria-label': 'Name' })),
    state: 'default',
  },
  ...bothStates('Select.Trigger', (state) =>
    h(
      Select.Root,
      { defaultValue: 'a' },
      h(Select.Trigger, { ...subject, ...state }, h(Select.Value), h(Select.Icon, {}, 'v')),
    ),
  ),
  ...bothStates('NumberField.Group', (state) =>
    h(
      NumberField.Root,
      { defaultValue: 5 },
      h(
        NumberField.Group,
        { ...subject },
        h(NumberField.Decrement, {}, '-'),
        h(NumberField.Input, { ...state, 'aria-label': 'Count' }),
        h(NumberField.Increment, {}, '+'),
      ),
    ),
  ),
  ...['Decrement', 'Increment'].map((stepper): Row => {
    const Part = stepper === 'Decrement' ? NumberField.Decrement : NumberField.Increment
    return {
      part: `NumberField.${stepper}`,
      scene: () =>
        h(
          NumberField.Root,
          { defaultValue: 5 },
          h(
            NumberField.Group,
            {},
            h(Part, { ...subject }, stepper === 'Decrement' ? '-' : '+'),
            h(NumberField.Input, { 'aria-label': 'Count' }),
          ),
        ),
      state: 'default',
    }
  }),
  {
    part: 'NumberField.Input',
    scene: () =>
      h(
        NumberField.Root,
        { defaultValue: 5 },
        h(NumberField.Group, {}, h(NumberField.Input, { ...subject, 'aria-label': 'Count' })),
      ),
    state: 'default',
  },
  {
    part: 'Menu.Item',
    scene: () => openMenu(h(Menu.Item, { ...subject }, 'Item')),
    state: 'default',
  },
  {
    part: 'Menu.LinkItem',
    scene: () => openMenu(h(Menu.LinkItem, { ...subject, href: '#' }, 'Link')),
    state: 'default',
  },
  {
    part: 'Menu.CheckboxItem',
    scene: () => openMenu(h(Menu.CheckboxItem, { ...subject }, 'Check')),
    state: 'default',
  },
  {
    part: 'Menu.RadioItem',
    scene: () =>
      openMenu(h(Menu.RadioGroup, {}, h(Menu.RadioItem, { ...subject, value: 'a' }, 'Radio'))),
    state: 'default',
  },
  {
    part: 'Menu.SubmenuTrigger',
    scene: () =>
      openMenu(
        h(
          Menu.SubmenuRoot,
          {},
          h(Menu.SubmenuTrigger, { ...subject }, 'More'),
          h(Menu.Portal, {}, h(Menu.Positioner, {}, h(Menu.Popup, {}, 'Nested'))),
        ),
      ),
    state: 'default',
  },
  { part: 'Select.Item', scene: openSelect, state: 'default' },
  {
    part: 'Tabs.Tab',
    scene: () =>
      h(
        Tabs.Root,
        { defaultValue: 'a' },
        h(Tabs.List, {}, h(Tabs.Tab, { ...subject, value: 'a' }, 'A')),
        h(Tabs.Panel, { value: 'a' }, 'Panel'),
      ),
    state: 'default',
  },
  {
    part: 'Accordion.Trigger',
    scene: () =>
      h(
        Accordion.Root,
        {},
        h(
          Accordion.Item,
          { value: 'a' },
          h(Accordion.Header, {}, h(Accordion.Trigger, { ...subject }, 'Question')),
          h(Accordion.Panel, {}, 'Answer'),
        ),
      ),
    state: 'default',
  },
  {
    part: 'Collapsible.Trigger',
    scene: () =>
      h(
        Collapsible.Root,
        {},
        h(Collapsible.Trigger, { ...subject }, 'Toggle'),
        h(Collapsible.Panel, {}, 'Content'),
      ),
    state: 'default',
  },
  ...bothStates('Checkbox.Root', (state) => h(Checkbox.Root, { ...subject, ...state })),
  ...bothStates('Radio.Root', (state) =>
    h(RadioGroup, {}, h(Radio.Root, { ...subject, ...state, value: 'a' })),
  ),
  ...bothStates('Switch.Root', (state) =>
    h(Switch.Root, { ...subject, ...state }, h(Switch.Thumb)),
  ),
  {
    part: 'Slider.Control',
    scene: () =>
      h(
        'div',
        { style: { width: 240 } },
        h(
          Slider.Root,
          { defaultValue: 30 },
          h(
            Slider.Control,
            { ...subject },
            h(Slider.Track, {}, h(Slider.Indicator)),
            h(Slider.Thumb, { 'aria-label': 'Volume' }),
          ),
        ),
      ),
    state: 'default',
  },
]

describe('AC-base-ui-bridge-35: every interactive styled part is at least 24 by 24 CSS px', () => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined

  beforeEach(() => {
    removeSheets = useSheets(tokens, stylesheet)
  })

  afterEach(() => {
    page?.dispose()
    removeSheets?.()
    page = undefined
  })

  describe.each([
    { expectation: 'passes', size: 24 },
    { expectation: 'fails', size: 23.5 },
  ])('the instrument, as its own control', ({ expectation, size }) => {
    it(`AC-base-ui-bridge-35: a plain ${String(size)}px square ${expectation} the 24px check`, async () => {
      page = mount(
        h(
          'div',
          { style: { padding: 48 } },
          h('div', { 'data-testid': 'subject', style: { height: size, width: size } }),
        ),
      )
      const { height, width } = hitExtent(await settled(() => byTestId('subject')))
      expect(height).toBeCloseTo(size, 2)
      expect(width).toBeCloseTo(size, 2)
      expect(Math.min(height, width) >= MINIMUM - TOLERANCE).toBe(size >= MINIMUM)
    })
  })

  it.each(rows)(
    'AC-base-ui-bridge-35: $part ($state) is hit across at least 24 by 24',
    async ({ scene, state }) => {
      // A part is measured alone, in a padded box, so no neighbour covers part of its hit area.
      page = mount(h('div', { style: { padding: 48 } }, scene()))
      const element = await settled(() => byTestId('subject'))
      const isInvalid = element.matches('[aria-invalid="true"], :has(> [aria-invalid="true"])')
      expect(isInvalid, 'the part is in the state the row names').toBe(state === 'invalid')
      const { height, width } = hitExtent(element)
      expect(width, 'hittable width').toBeGreaterThanOrEqual(MINIMUM - TOLERANCE)
      expect(height, 'hittable height').toBeGreaterThanOrEqual(MINIMUM - TOLERANCE)
    },
  )
})
