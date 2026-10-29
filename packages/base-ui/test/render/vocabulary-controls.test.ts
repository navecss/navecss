import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import {
  disclosureDivTabindex,
  disclosureTriggerDisabled,
  disclosureTriggerDisabledSelectors,
} from '../support/disclosure-disabled.ts'
import { cleanup, render, user } from '../support/react.ts'
import { recordCarried, recordRelated, unrecordedPairs } from '../support/row-pairs.ts'
import { hasClass, hasItem, part, renderScene } from '../support/rows.ts'
import { loadBare, loadNave } from '../support/sources.ts'
import { topName } from '../support/subpaths.ts'
import { tableP } from '../support/table-p.ts'
import { CONTROL_PAIRS, pair } from '../support/vocabulary-pairs.ts'
import { menuTree, openByClick } from '../support/w6-menus.ts'
import { need, settle } from '../support/w6-render.ts'

const nave: Source = await loadNave()
const bare: Source = await loadBare()
afterEach(cleanup)

const C = 'nave-base-ui-'

describe('AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: every item the stylesheet keys on appears where its rule reaches (controls)', () => {
  it('Toggle and Toggle in ToggleGroup carry aria-pressed when pressed, with the class', async () => {
    await renderScene(nave, 'toggle', { Toggle: { defaultPressed: true } })
    expect(hasItem(part('Toggle'), 'aria-pressed', 'true')).toBe(true)
    expect(hasClass(part('Toggle'), `${C}toggle`)).toBe(true)
    await renderScene(nave, 'toggle-group')
    expect(hasItem(part('Toggle'), 'aria-pressed', 'true')).toBe(true)
    expect(hasClass(part('Toggle'), `${C}toggle`)).toBe(true)
    recordCarried(part('Toggle'), 'aria-pressed', 'true')
  })

  it('ToggleGroup and Toolbar.Group carry data-orientation when vertical, with the class', async () => {
    await renderScene(nave, 'toggle-group', { ToggleGroup: { orientation: 'vertical' } })
    expect(hasItem(part('ToggleGroup'), 'data-orientation', 'vertical')).toBe(true)
    expect(hasClass(part('ToggleGroup'), `${C}toggle-group`)).toBe(true)
    recordCarried(part('ToggleGroup'), 'data-orientation', 'vertical')
    await renderScene(nave, 'toolbar', { 'Toolbar.Root': { orientation: 'vertical' } })
    expect(hasItem(part('Toolbar.Group'), 'data-orientation', 'vertical')).toBe(true)
    expect(hasClass(part('Toolbar.Group'), `${C}toolbar-group`)).toBe(true)
    recordCarried(part('Toolbar.Group'), 'data-orientation', 'vertical')
  })

  it('Toolbar carries aria-orientation, and its Separator the opposite value, with the classes', async () => {
    await renderScene(nave, 'toolbar', { 'Toolbar.Root': { orientation: 'vertical' } })
    expect(hasItem(part('Toolbar.Root'), 'aria-orientation', 'vertical')).toBe(true)
    expect(hasClass(part('Toolbar.Root'), `${C}toolbar`)).toBe(true)
    expect(hasItem(part('Toolbar.Separator'), 'aria-orientation', 'horizontal')).toBe(true)
    expect(hasClass(part('Toolbar.Separator'), `${C}toolbar-separator`)).toBe(true)
    recordCarried(part('Toolbar.Root'), 'aria-orientation', 'vertical')
    recordCarried(part('Toolbar.Separator'), 'aria-orientation', 'horizontal')
  })

  it('Slider parts carry data-orientation when vertical, with the classes', async () => {
    await renderScene(nave, 'slider', { 'Slider.Root': { orientation: 'vertical' } })
    for (const [marker, name] of [
      ['Slider.Control', 'slider-control'],
      ['Slider.Track', 'slider-track'],
      ['Slider.Thumb', 'slider-thumb'],
    ] as const) {
      expect(hasItem(part(marker), 'data-orientation', 'vertical')).toBe(true)
      expect(hasClass(part(marker), `${C}${name}`)).toBe(true)
      recordCarried(part(marker), 'data-orientation', 'vertical')
    }
  })

  it('Checkbox carries aria-checked, and its Indicator is mounted as a direct child', async () => {
    await renderScene(nave, 'checkbox', { 'Checkbox.Root': { defaultChecked: true } })
    expect(hasItem(part('Checkbox.Root'), 'aria-checked', 'true')).toBe(true)
    expect(part('Checkbox.Indicator')?.parentElement).toBe(part('Checkbox.Root'))
    expect(hasClass(part('Checkbox.Indicator'), `${C}checkbox-indicator`)).toBe(true)
    recordRelated(part('Checkbox.Indicator'), part('Checkbox.Root'), 'aria-checked', 'true')
    await renderScene(nave, 'checkbox', { 'Checkbox.Root': { indeterminate: true } })
    expect(hasItem(part('Checkbox.Root'), 'aria-checked', 'mixed')).toBe(true)
    expect(part('Checkbox.Indicator')?.parentElement).toBe(part('Checkbox.Root'))
  })

  it('Switch carries aria-checked, and its Thumb is a direct child of the Root', async () => {
    await renderScene(nave, 'switch', { 'Switch.Root': { defaultChecked: true } })
    expect(hasItem(part('Switch.Root'), 'aria-checked', 'true')).toBe(true)
    expect(part('Switch.Thumb')?.parentElement).toBe(part('Switch.Root'))
    expect(hasClass(part('Switch.Thumb'), `${C}switch-thumb`)).toBe(true)
    recordRelated(part('Switch.Thumb'), part('Switch.Root'), 'aria-checked', 'true')
  })

  it('an invalid Field gives aria-invalid to each control, with the class', async () => {
    const component = (subpath: string): Record<string, never> =>
      nave(subpath) as Record<string, never>
    const make = (subpath: string, type: string, props: Props = {}): ReactElement =>
      createElement(
        component(subpath)[type] as never,
        { 'data-part': `${topName(subpath)}.${type}`, ...props } as never,
      )
    const cases: readonly { cls: string; marker: string; tree: ReactElement }[] = [
      { cls: 'input', marker: 'Field.Control', tree: make('field', 'Control') },
      { cls: 'switch', marker: 'Switch.Root', tree: make('switch', 'Root') },
      { cls: 'checkbox', marker: 'Checkbox.Root', tree: make('checkbox', 'Root') },
      {
        cls: 'radio',
        marker: 'Radio.Root',
        tree: createElement(
          nave('radio-group') as never,
          undefined,
          make('radio', 'Root', { value: 'a' }),
        ),
      },
      {
        cls: 'select-trigger',
        marker: 'Select.Trigger',
        tree: createElement(
          component('select').Root as never,
          undefined,
          make('select', 'Trigger'),
        ),
      },
    ]
    const problems: string[] = []
    for (const { cls, marker, tree } of cases) {
      await render(
        createElement(component('field').Root as never, { invalid: true } as never, tree),
      )
      const element = part(marker)
      if (!hasItem(element, 'aria-invalid', 'true') || !hasClass(element, `${C}${cls}`)) {
        problems.push(marker)
      } else {
        recordCarried(element, 'aria-invalid', 'true')
      }
    }
    expect(problems).toEqual([])
  })

  it('an invalid Field gives aria-invalid to NumberField.Input, a direct child of the Group', async () => {
    const field = nave('field') as Record<string, never>
    const number = nave('number-field') as Record<string, never>
    const input = createElement(
      number.Input as never,
      {
        'data-part': 'NumberField.Input',
      } as never,
    )
    const group = createElement(
      number.Group as never,
      { 'data-part': 'NumberField.Group' } as never,
      input,
    )
    const root = createElement(number.Root as never, undefined, group)
    await render(createElement(field.Root as never, { invalid: true } as never, root))
    expect(hasItem(part('NumberField.Input'), 'aria-invalid', 'true')).toBe(true)
    expect(part('NumberField.Input')?.parentElement).toBe(part('NumberField.Group'))
    expect(hasClass(part('NumberField.Group'), `${C}number-field-group`)).toBe(true)
    recordRelated(part('NumberField.Group'), part('NumberField.Input'), 'aria-invalid', 'true')
  })

  it('NumberField and Slider carry data-disabled when disabled, with the class', async () => {
    await renderScene(nave, 'number-field', { 'NumberField.Root': { disabled: true } })
    expect(hasItem(part('NumberField.Group'), 'data-disabled')).toBe(true)
    expect(hasClass(part('NumberField.Group'), `${C}number-field-group`)).toBe(true)
    recordCarried(part('NumberField.Group'), 'data-disabled')
    await renderScene(nave, 'slider', { 'Slider.Root': { disabled: true } })
    expect(hasItem(part('Slider.Thumb'), 'data-disabled')).toBe(true)
    expect(hasClass(part('Slider.Thumb'), `${C}slider-thumb`)).toBe(true)
    recordCarried(part('Slider.Thumb'), 'data-disabled')
  })
})

/**
 * Each disabled part the stylesheet paints: how to disable it, and what it carries (an ARIA state,
 * a native `disabled`, or both).
 */
const DISABLED: readonly {
  aria: boolean
  disable: Record<string, Props>
  marker: string
  native: boolean
  subpath: string
}[] = [
  {
    aria: true,
    disable: { 'Menu.Root': { open: true }, 'Menu.Item': { disabled: true } },
    marker: 'Menu.Item',
    native: false,
    subpath: 'menu',
  },
  {
    aria: true,
    disable: { 'Menu.Root': { open: true }, 'Menu.CheckboxItem': { disabled: true } },
    marker: 'Menu.CheckboxItem',
    native: false,
    subpath: 'menu',
  },
  {
    aria: true,
    disable: { 'Menu.Root': { open: true }, 'Menu.RadioItem': { disabled: true } },
    marker: 'Menu.RadioItem',
    native: false,
    subpath: 'menu',
  },
  {
    aria: true,
    disable: { 'Menu.Root': { open: true }, 'Menu.SubmenuTrigger': { disabled: true } },
    marker: 'Menu.SubmenuTrigger',
    native: false,
    subpath: 'menu',
  },
  {
    aria: true,
    disable: { 'Select.Root': { open: true }, 'Select.Item': { disabled: true } },
    marker: 'Select.Item',
    native: false,
    subpath: 'select',
  },
  {
    aria: true,
    disable: { 'Tabs.Tab': { disabled: true } },
    marker: 'Tabs.Tab',
    native: false,
    subpath: 'tabs',
  },
  {
    ...disclosureTriggerDisabled(),
    disable: { 'Accordion.Item': { disabled: true } },
    marker: 'Accordion.Trigger',
    subpath: 'accordion',
  },
  {
    ...disclosureTriggerDisabled(),
    disable: { 'Collapsible.Root': { disabled: true } },
    marker: 'Collapsible.Trigger',
    subpath: 'collapsible',
  },
  {
    aria: true,
    disable: { Button: { disabled: true, focusableWhenDisabled: true } },
    marker: 'Button',
    native: false,
    subpath: 'button',
  },
  {
    aria: true,
    disable: { 'Toolbar.Button': { disabled: true } },
    marker: 'Toolbar.Button',
    native: false,
    subpath: 'toolbar',
  },
  {
    aria: true,
    disable: { 'Toolbar.Input': { disabled: true } },
    marker: 'Toolbar.Input',
    native: false,
    subpath: 'toolbar',
  },
  {
    aria: true,
    disable: { 'Checkbox.Root': { disabled: true } },
    marker: 'Checkbox.Root',
    native: false,
    subpath: 'checkbox',
  },
  {
    aria: true,
    disable: { 'Radio.Root': { disabled: true } },
    marker: 'Radio.Root',
    native: false,
    subpath: 'radio',
  },
  {
    aria: false,
    disable: { Toggle: { disabled: true } },
    marker: 'Toggle',
    native: true,
    subpath: 'toggle',
  },
  {
    aria: true,
    disable: { Toggle: { disabled: true } },
    marker: 'Toggle',
    native: true,
    subpath: 'toggle-group',
  },
  {
    aria: true,
    disable: { 'Switch.Root': { disabled: true } },
    marker: 'Switch.Root',
    native: false,
    subpath: 'switch',
  },
  {
    aria: true,
    disable: { 'NumberField.Root': { disabled: true } },
    marker: 'NumberField.Increment',
    native: true,
    subpath: 'number-field',
  },
  {
    aria: false,
    disable: { 'Select.Root': { disabled: true } },
    marker: 'Select.Trigger',
    native: true,
    subpath: 'select',
  },
]

describe('AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: every disabled part carries the state the stylesheet keys on', () => {
  for (const { aria, disable, marker, native, subpath } of DISABLED) {
    it(`${subpath}: ${marker} disabled carries ${aria ? 'aria-disabled' : 'no aria-disabled'} and ${native ? 'native disabled' : 'no native disabled'}`, async () => {
      await renderScene(nave, subpath, disable)
      const element = part(marker)
      expect(element, `${marker} rendered`).toBeDefined()
      expect(hasItem(element, 'aria-disabled', 'true')).toBe(aria)
      expect(element?.hasAttribute('disabled')).toBe(native)
      expect(element?.className).toContain(C)
      // Every class Table P names for the part is on it, so the pairs recorded below are the
      // rules' own: the highlight fill's `:not([aria-disabled="true"])` included.
      expect((tableP.get(marker) ?? []).filter((name) => !hasClass(element, name))).toEqual([])
      recordCarried(element, 'aria-disabled', 'true')
    })
  }

  it('lists the disabled parts the vocabulary table covers, so a deleted entry reds', () => {
    expect(DISABLED.map(({ marker, subpath }) => `${subpath}: ${marker}`)).toEqual([
      'menu: Menu.Item',
      'menu: Menu.CheckboxItem',
      'menu: Menu.RadioItem',
      'menu: Menu.SubmenuTrigger',
      'select: Select.Item',
      'tabs: Tabs.Tab',
      'accordion: Accordion.Trigger',
      'collapsible: Collapsible.Trigger',
      'button: Button',
      'toolbar: Toolbar.Button',
      'toolbar: Toolbar.Input',
      'checkbox: Checkbox.Root',
      'radio: Radio.Root',
      'toggle: Toggle',
      'toggle-group: Toggle',
      'switch: Switch.Root',
      'number-field: NumberField.Increment',
      'select: Select.Trigger',
    ])
  })

  it('Select.Trigger carries aria-disabled when it is not a native button, whichever part disables it', async () => {
    const asDiv = { nativeButton: false, render: createElement('div') }
    const routes: readonly (readonly [string, Record<string, Props>])[] = [
      ['Root', { 'Select.Root': { disabled: true }, 'Select.Trigger': asDiv }],
      ['Trigger', { 'Select.Trigger': { ...asDiv, disabled: true } }],
    ]
    for (const [disabledBy, props] of routes) {
      await renderScene(nave, 'select', props)
      const trigger = part('Select.Trigger')
      expect(trigger?.tagName, `${disabledBy} disabled: the trigger is a div`).toBe('DIV')
      expect(hasItem(trigger, 'aria-disabled', 'true'), `${disabledBy} disabled`).toBe(true)
      expect(trigger?.hasAttribute('disabled')).toBe(false)
      expect(hasClass(trigger, `${C}select-trigger`)).toBe(true)
      recordCarried(trigger, 'aria-disabled', 'true')
      await cleanup()
    }
  })
  it('Accordion.Trigger and Collapsible.Trigger carry aria-disabled when they are not a native button', async () => {
    const asDiv = { nativeButton: false, render: createElement('div') }
    const routes: readonly (readonly [string, string, Record<string, Props>])[] = [
      [
        'accordion',
        'Accordion.Trigger',
        { 'Accordion.Item': { disabled: true }, 'Accordion.Trigger': asDiv },
      ],
      [
        'collapsible',
        'Collapsible.Trigger',
        { 'Collapsible.Root': { disabled: true }, 'Collapsible.Trigger': asDiv },
      ],
    ]
    for (const [subpath, marker, props] of routes) {
      await renderScene(nave, subpath, props)
      const trigger = part(marker)
      expect(trigger?.tagName, `${marker} is a div`).toBe('DIV')
      expect(hasItem(trigger, 'aria-disabled', 'true'), marker).toBe(true)
      expect(trigger?.hasAttribute('disabled')).toBe(false)
      expect(trigger?.getAttribute('tabindex'), `${marker} tabindex`).toBe(disclosureDivTabindex())
      expect(hasClass(trigger, `${C}disclosure-trigger`)).toBe(true)
      recordCarried(trigger, 'aria-disabled', 'true')
      await cleanup()
    }
  })

  // AC-base-ui-bridge-22: the trigger's disabled rule has to reach every disabled Trigger at the
  // run, whichever attribute Base UI marks it with. A native button is marked `aria-disabled` up to
  // 1.8.0 and `disabled` from 1.9.0; a `div` is marked `aria-disabled` at every minor.
  describe('the disclosure trigger disabled rule reaches the disabled Trigger at the run', () => {
    interface Reading {
      readonly isDisabled: boolean
      readonly matched: readonly string[]
      readonly name: string
    }

    const asDiv = { nativeButton: false, render: createElement('div') }
    const readTriggers = async (branches: readonly string[]): Promise<Reading[]> => {
      const readings: Reading[] = []
      const places = [
        ['accordion', 'Accordion.Trigger', 'Accordion.Item', 'Accordion.Root'],
        ['collapsible', 'Collapsible.Trigger', 'Collapsible.Root', undefined],
      ] as const
      for (const [subpath, marker, owner, otherOwner] of places) {
        const forms: readonly (readonly [string, boolean, Record<string, Props>])[] = [
          ['native, disabled', true, { [owner]: { disabled: true } }],
          ['div, disabled', true, { [owner]: { disabled: true }, [marker]: asDiv }],
          ['native, enabled', false, {}],
          ['div, enabled', false, { [marker]: asDiv }],
          ...(otherOwner === undefined
            ? []
            : ([
                [`native, disabled by ${otherOwner}`, true, { [otherOwner]: { disabled: true } }],
              ] as const)),
          [`native, disabled by ${marker}`, true, { [marker]: { disabled: true } }],
        ]
        for (const [form, isDisabled, props] of forms) {
          await renderScene(nave, subpath, props)
          const trigger = part(marker)
          expect(
            trigger,
            `${marker} (${form}) is rendered, so the rule has a node to read`,
          ).toBeDefined()
          readings.push({
            isDisabled,
            matched: branches.filter((branch) => trigger?.matches(branch) === true),
            name: `${marker} (${form})`,
          })
          await cleanup()
        }
      }
      return readings
    }
    const unreached = (readings: readonly Reading[]): string[] =>
      readings
        .filter((reading) => reading.isDisabled && reading.matched.length === 0)
        .map((r) => r.name)

    it('matches every disabled Trigger by at least one branch, and no enabled one', async () => {
      const branches = disclosureTriggerDisabledSelectors()
      expect(branches.length, 'the trigger has a disabled rule').toBeGreaterThan(0)
      const readings = await readTriggers(branches)
      expect(unreached(readings), 'disabled Triggers the rule does not reach').toEqual([])
      expect(
        readings.filter((reading) => !reading.isDisabled && reading.matched.length > 0),
        'enabled Triggers the rule reaches',
      ).toEqual([])
    })

    it('reaches a native button by :disabled from 1.9.0 and by [aria-disabled] before, and a div by [aria-disabled]', async () => {
      const readings = await readTriggers(disclosureTriggerDisabledSelectors())
      const byName = (name: string): readonly string[] =>
        readings.find((reading) => reading.name === name)?.matched ?? []
      for (const marker of ['Accordion.Trigger', 'Collapsible.Trigger']) {
        expect(byName(`${marker} (div, disabled)`), `${marker} as a div`).toEqual([
          '[aria-disabled="true"]',
        ])
        expect(byName(`${marker} (native, disabled)`), `${marker} as a native button`).toEqual(
          disclosureTriggerDisabled().native ? [':disabled'] : ['[aria-disabled="true"]'],
        )
      }
    })

    // Every part that can disable a native trigger reaches it the same way: `Accordion.Root`,
    // `Accordion.Item` and `Accordion.Trigger`, `Collapsible.Root` and `Collapsible.Trigger`.
    it('reaches a native Trigger the same way whichever part disables it', async () => {
      const readings = await readTriggers(disclosureTriggerDisabledSelectors())
      const reached = disclosureTriggerDisabled().native
        ? [':disabled']
        : ['[aria-disabled="true"]']
      const routes = readings.filter((reading) => reading.name.includes('(native, disabled'))
      expect(
        routes.map((reading) => reading.name),
        'the routes read',
      ).toEqual([
        'Accordion.Trigger (native, disabled)',
        'Accordion.Trigger (native, disabled by Accordion.Root)',
        'Accordion.Trigger (native, disabled by Accordion.Trigger)',
        'Collapsible.Trigger (native, disabled)',
        'Collapsible.Trigger (native, disabled by Collapsible.Trigger)',
      ])
      for (const reading of routes) {
        expect(reading.matched, reading.name).toEqual(reached)
      }
    })

    // The control: the key as it was (`[aria-disabled="true"]` alone) leaves the native button
    // unreached at 1.9.0, naming the Trigger, and reaches it at the floor.
    it('reds on the key without :disabled, naming the native Triggers at 1.9.0 only', async () => {
      const withoutNative = disclosureTriggerDisabledSelectors().filter(
        (branch) => branch !== ':disabled',
      )
      expect(withoutNative).toEqual(['[aria-disabled="true"]'])
      expect(unreached(await readTriggers(withoutNative))).toEqual(
        disclosureTriggerDisabled().native
          ? [
              'Accordion.Trigger (native, disabled)',
              'Accordion.Trigger (native, disabled by Accordion.Root)',
              'Accordion.Trigger (native, disabled by Accordion.Trigger)',
              'Collapsible.Trigger (native, disabled)',
              'Collapsible.Trigger (native, disabled by Collapsible.Trigger)',
            ]
          : [],
      )
    })
  })
})

describe('Menu.LinkItem has no disabled state', () => {
  // The README says so for Base UI 1.8.0 and 1.9.0; the floor behaves the same.
  it('a disabled Menu.LinkItem reaches the <a> as an attribute, carries no aria-disabled, and still activates', async () => {
    let activated = 0
    await render(
      menuTree(nave, bare, {
        LinkItem: {
          disabled: true,
          onClick: () => {
            activated += 1
          },
        },
      }),
    )
    await openByClick('Menu.Trigger')
    const link = need('Menu.LinkItem')
    await user().click(link)
    await settle()
    expect(link.tagName).toBe('A')
    expect(link.hasAttribute('disabled')).toBe(true)
    expect(link.getAttribute('aria-disabled')).toBeNull()
    expect(activated).toBe(1)
  })
})

describe("AC-base-ui-overlay-completion-29 and AC-base-ui-bridge-22: the controls' render rows cover every pair they own", () => {
  it('has recorded every pair of the controls table', () => {
    expect(unrecordedPairs(CONTROL_PAIRS)).toEqual([])
  })

  it('control: a pair no row asserted is reported', () => {
    expect(unrecordedPairs({ planted: [pair('toggle', 'data-planted')] })).toEqual([
      'nave-base-ui-toggle data-planted',
    ])
  })
})
