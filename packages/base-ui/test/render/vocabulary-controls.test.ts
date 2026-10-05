import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { cleanup, render } from '../support/react.ts'
import { recordCarried, recordPairs, unrecordedPairs } from '../support/row-pairs.ts'
import { hasClass, hasItem, part, renderScene } from '../support/rows.ts'
import { loadNave } from '../support/sources.ts'
import { topName } from '../support/subpaths.ts'
import { CONTROL_PAIRS, pair } from '../support/vocabulary-pairs.ts'

const nave: Source = await loadNave()
afterEach(cleanup)

const C = 'nave-base-ui-'

describe('AC-base-ui-bridge-22: every item the stylesheet keys on appears where its rule reaches (controls)', () => {
  it('Toggle and Toggle in ToggleGroup carry aria-pressed when pressed, with the class', async () => {
    await renderScene(nave, 'toggle', { Toggle: { defaultPressed: true } })
    expect(hasItem(part('Toggle'), 'aria-pressed', 'true')).toBe(true)
    expect(hasClass(part('Toggle'), `${C}toggle`)).toBe(true)
    await renderScene(nave, 'toggle-group')
    expect(hasItem(part('Toggle'), 'aria-pressed', 'true')).toBe(true)
    expect(hasClass(part('Toggle'), `${C}toggle`)).toBe(true)
    recordPairs(CONTROL_PAIRS.pressed ?? [])
  })

  it('ToggleGroup and Toolbar.Group carry data-orientation when vertical, with the class', async () => {
    await renderScene(nave, 'toggle-group', { ToggleGroup: { orientation: 'vertical' } })
    expect(hasItem(part('ToggleGroup'), 'data-orientation', 'vertical')).toBe(true)
    expect(hasClass(part('ToggleGroup'), `${C}toggle-group`)).toBe(true)
    await renderScene(nave, 'toolbar', { 'Toolbar.Root': { orientation: 'vertical' } })
    expect(hasItem(part('Toolbar.Group'), 'data-orientation', 'vertical')).toBe(true)
    expect(hasClass(part('Toolbar.Group'), `${C}toolbar-group`)).toBe(true)
    recordPairs([
      pair('toggle-group', 'data-orientation'),
      pair('toolbar-group', 'data-orientation'),
    ])
  })

  it('Toolbar carries aria-orientation, and its Separator the opposite value, with the classes', async () => {
    await renderScene(nave, 'toolbar', { 'Toolbar.Root': { orientation: 'vertical' } })
    expect(hasItem(part('Toolbar.Root'), 'aria-orientation', 'vertical')).toBe(true)
    expect(hasClass(part('Toolbar.Root'), `${C}toolbar`)).toBe(true)
    expect(hasItem(part('Toolbar.Separator'), 'aria-orientation', 'horizontal')).toBe(true)
    expect(hasClass(part('Toolbar.Separator'), `${C}toolbar-separator`)).toBe(true)
    recordPairs([
      pair('toolbar', 'aria-orientation'),
      pair('toolbar-separator', 'aria-orientation'),
    ])
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
      recordPairs([pair(name, 'data-orientation')])
    }
  })

  it('Checkbox carries aria-checked, and its Indicator is mounted as a direct child', async () => {
    await renderScene(nave, 'checkbox', { 'Checkbox.Root': { defaultChecked: true } })
    expect(hasItem(part('Checkbox.Root'), 'aria-checked', 'true')).toBe(true)
    expect(part('Checkbox.Indicator')?.parentElement).toBe(part('Checkbox.Root'))
    expect(hasClass(part('Checkbox.Indicator'), `${C}checkbox-indicator`)).toBe(true)
    recordPairs([pair('checkbox-indicator', 'aria-checked')])
    await renderScene(nave, 'checkbox', { 'Checkbox.Root': { indeterminate: true } })
    expect(hasItem(part('Checkbox.Root'), 'aria-checked', 'mixed')).toBe(true)
    expect(part('Checkbox.Indicator')?.parentElement).toBe(part('Checkbox.Root'))
  })

  it('Switch carries aria-checked, and its Thumb is a direct child of the Root', async () => {
    await renderScene(nave, 'switch', { 'Switch.Root': { defaultChecked: true } })
    expect(hasItem(part('Switch.Root'), 'aria-checked', 'true')).toBe(true)
    expect(part('Switch.Thumb')?.parentElement).toBe(part('Switch.Root'))
    expect(hasClass(part('Switch.Thumb'), `${C}switch-thumb`)).toBe(true)
    recordPairs([pair('switch-thumb', 'aria-checked')])
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
        recordPairs([pair(cls, 'aria-invalid')])
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
    recordPairs([pair('number-field-group', 'aria-invalid')])
  })

  it('NumberField and Slider carry data-disabled when disabled, with the class', async () => {
    await renderScene(nave, 'number-field', { 'NumberField.Root': { disabled: true } })
    expect(hasItem(part('NumberField.Group'), 'data-disabled')).toBe(true)
    expect(hasClass(part('NumberField.Group'), `${C}number-field-group`)).toBe(true)
    await renderScene(nave, 'slider', { 'Slider.Root': { disabled: true } })
    expect(hasItem(part('Slider.Thumb'), 'data-disabled')).toBe(true)
    expect(hasClass(part('Slider.Thumb'), `${C}slider-thumb`)).toBe(true)
    recordPairs([
      pair('number-field-group', 'data-disabled'),
      pair('slider-thumb', 'data-disabled'),
    ])
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
    aria: true,
    disable: { 'Accordion.Item': { disabled: true } },
    marker: 'Accordion.Trigger',
    native: false,
    subpath: 'accordion',
  },
  {
    aria: true,
    disable: { 'Collapsible.Root': { disabled: true } },
    marker: 'Collapsible.Trigger',
    native: false,
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

describe('AC-base-ui-bridge-22: every disabled part carries the state the stylesheet keys on', () => {
  for (const { aria, disable, marker, native, subpath } of DISABLED) {
    it(`${subpath}: ${marker} disabled carries ${aria ? 'aria-disabled' : 'no aria-disabled'} and ${native ? 'native disabled' : 'no native disabled'}`, async () => {
      await renderScene(nave, subpath, disable)
      const element = part(marker)
      expect(element, `${marker} rendered`).toBeDefined()
      expect(hasItem(element, 'aria-disabled', 'true')).toBe(aria)
      expect(element?.hasAttribute('disabled')).toBe(native)
      expect(element?.className).toContain(C)
      recordCarried(element, 'aria-disabled', 'true')
    })
  }

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
})

describe("AC-base-ui-bridge-22: the controls' render rows cover every pair they own", () => {
  it('has recorded every pair of the controls table', () => {
    expect(unrecordedPairs(CONTROL_PAIRS)).toEqual([])
  })

  it('control: a pair no row asserted is reported', () => {
    expect(unrecordedPairs({ planted: [pair('toggle', 'data-planted')] })).toEqual([
      'nave-base-ui-toggle data-planted',
    ])
  })
})
