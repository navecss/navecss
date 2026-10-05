import { createElement, type ReactElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { act, cleanup, render, user } from '../support/react.ts'
import { renderScene } from '../support/rows.ts'
import { partOf } from '../support/scenes.ts'
import { loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'

let nave: Source
beforeAll(async () => {
  nave = await loadNave()
})
afterEach(cleanup)

type Act = 'click' | 'enter' | 'space'
type Spy = ReturnType<typeof vi.fn>

interface Row {
  readonly acts?: readonly Act[]
  /**
  A custom tree, for the rows a scene cannot express.
   */
  readonly element?: (source: Source, disabled: boolean, spy: Spy) => ReactElement
  /**
  The part acted on, and which of its occurrences.
   */
  readonly index?: number
  readonly marker: string
  readonly name: string
  /**
  The props by part: what disables the part, and what carries the spy on the signal.
   */
  readonly props?: (disabled: boolean, spy: Spy) => Record<string, Props>
  /**
  What must not move when the act is delivered to the disabled part.
   */
  readonly state: (target: HTMLElement) => string
  readonly subpath: string
  /**
  Whether the click is followed by typing, for the text inputs, which a click alone does not change.
   */
  readonly typing?: boolean
}

const attribute =
  (name: string) =>
  (target: HTMLElement): string =>
    target.getAttribute(name) ?? ''
const countOf = (marker: string) => (): string => String(partsNamed(marker).length)
const value = (target: HTMLElement): string => (target as HTMLInputElement).value

const ROWS: readonly Row[] = [
  {
    marker: 'Menu.Item',
    name: 'Menu.Item',
    props: (d, s) => ({ ...openProps(), 'Menu.Item': { disabled: d, onClick: s } }),
    state: countOf('Menu.Popup'),
    subpath: 'menu',
  },
  {
    marker: 'Menu.CheckboxItem',
    name: 'Menu.CheckboxItem',
    props: (d, s) => ({
      ...openProps(),
      'Menu.CheckboxItem': { defaultChecked: false, disabled: d, onCheckedChange: s },
    }),
    state: attribute('aria-checked'),
    subpath: 'menu',
  },
  {
    marker: 'Menu.RadioItem',
    name: 'Menu.RadioItem',
    props: (d, s) => ({
      ...openProps(),
      'Menu.RadioGroup': { defaultValue: 'b', onValueChange: s },
      'Menu.RadioItem': { disabled: d },
    }),
    state: attribute('aria-checked'),
    subpath: 'menu',
  },
  {
    acts: ['click', 'enter', 'space'],
    marker: 'Menu.SubmenuTrigger',
    name: 'Menu.SubmenuTrigger',
    props: (d, s) => ({
      ...openProps(),
      'Menu.SubmenuRoot': { onOpenChange: s },
      'Menu.SubmenuTrigger': { disabled: d },
    }),
    state: countOf('Menu.Popup'),
    subpath: 'menu',
  },
  {
    marker: 'Select.Item',
    name: 'Select.Item',
    props: (d, s) => ({
      ...openProps(),
      'Select.Root': { defaultValue: null, onValueChange: s, open: true },
      'Select.Item': { disabled: d },
    }),
    state: attribute('aria-selected'),
    subpath: 'select',
  },
  {
    marker: 'Tabs.Tab',
    index: 1,
    name: 'Tabs.Tab',
    props: (d, s) => ({ 'Tabs.Root': { onValueChange: s }, 'Tabs.Tab': { disabled: d } }),
    state: attribute('aria-selected'),
    subpath: 'tabs',
  },
  {
    marker: 'Accordion.Trigger',
    name: 'Accordion.Trigger (Item disabled)',
    props: (d, s) => ({
      'Accordion.Item': { disabled: d },
      'Accordion.Root': { onValueChange: s },
    }),
    state: attribute('aria-expanded'),
    subpath: 'accordion',
  },
  {
    marker: 'Accordion.Trigger',
    name: 'Accordion.Trigger (Root disabled)',
    props: (d, s) => ({ 'Accordion.Root': { disabled: d, onValueChange: s } }),
    state: attribute('aria-expanded'),
    subpath: 'accordion',
  },
  {
    marker: 'Collapsible.Trigger',
    name: 'Collapsible.Trigger (Root disabled)',
    props: (d, s) => ({ 'Collapsible.Root': { disabled: d, onOpenChange: s } }),
    state: attribute('aria-expanded'),
    subpath: 'collapsible',
  },
  {
    marker: 'Button',
    name: 'Button (disabled)',
    props: (d, s) => ({ Button: { disabled: d, onClick: s } }),
    state: attribute('class'),
    subpath: 'button',
  },
  {
    marker: 'Button',
    name: 'Button (disabled, focusableWhenDisabled)',
    props: (d, s) => ({ Button: { disabled: d, focusableWhenDisabled: true, onClick: s } }),
    state: attribute('class'),
    subpath: 'button',
  },
  {
    marker: 'Toolbar.Button',
    name: 'Toolbar.Button',
    props: (d, s) => ({ 'Toolbar.Button': { disabled: d, onClick: s } }),
    state: attribute('class'),
    subpath: 'toolbar',
  },
  {
    marker: 'Dialog.Trigger',
    name: 'Dialog.Trigger',
    props: (d, s) => ({ 'Dialog.Root': { onOpenChange: s }, 'Dialog.Trigger': { disabled: d } }),
    state: attribute('aria-expanded'),
    subpath: 'dialog',
  },
  {
    marker: 'Popover.Trigger',
    name: 'Popover.Trigger',
    props: (d, s) => ({ 'Popover.Root': { onOpenChange: s }, 'Popover.Trigger': { disabled: d } }),
    state: attribute('aria-expanded'),
    subpath: 'popover',
  },
  {
    marker: 'Menu.Trigger',
    name: 'Menu.Trigger',
    props: (d, s) => ({ 'Menu.Root': { onOpenChange: s }, 'Menu.Trigger': { disabled: d } }),
    state: attribute('aria-expanded'),
    subpath: 'menu',
  },
  {
    marker: 'Toggle',
    name: 'Toggle (standalone)',
    props: (d, s) => ({ Toggle: { disabled: d, onPressedChange: s } }),
    state: attribute('aria-pressed'),
    subpath: 'toggle',
  },
  {
    marker: 'Toggle',
    index: 1,
    name: 'Toggle in ToggleGroup',
    props: (d, s) => ({ Toggle: { disabled: d }, ToggleGroup: { onValueChange: s } }),
    state: attribute('aria-pressed'),
    subpath: 'toggle-group',
  },
  {
    marker: 'Checkbox.Root',
    name: 'Checkbox.Root',
    props: (d, s) => ({
      'Checkbox.Root': { defaultChecked: false, disabled: d, onCheckedChange: s },
    }),
    state: attribute('aria-checked'),
    subpath: 'checkbox',
  },
  {
    marker: 'Radio.Root',
    index: 1,
    name: 'Radio.Root in RadioGroup',
    props: (d, s) => ({ RadioGroup: { onValueChange: s }, 'Radio.Root': { disabled: d } }),
    state: attribute('aria-checked'),
    subpath: 'radio-group',
  },
  {
    marker: 'Switch.Root',
    name: 'Switch.Root',
    props: (d, s) => ({
      'Switch.Root': { defaultChecked: false, disabled: d, onCheckedChange: s },
    }),
    state: attribute('aria-checked'),
    subpath: 'switch',
  },
  {
    marker: 'Select.Trigger',
    name: 'Select.Trigger',
    props: (d, s) => ({ 'Select.Root': { disabled: d, onOpenChange: s } }),
    state: attribute('aria-expanded'),
    subpath: 'select',
  },
  {
    acts: ['click'],
    element: (source, d, s) =>
      createElement(
        partOf(source, 'fieldset', 'Root'),
        { disabled: d },
        createElement(
          partOf(source, 'field', 'Root'),
          null,
          createElement(partOf(source, 'field', 'Control'), {
            'data-part': 'Field.Control',
            onValueChange: s,
          }),
        ),
      ),
    marker: 'Field.Control',
    name: 'Field.Control (Fieldset disabled)',
    state: value,
    subpath: 'field',
    typing: true,
  },
  {
    acts: ['click'],
    marker: 'Input',
    name: 'Input',
    props: (d, s) => ({ Input: { disabled: d, onValueChange: s } }),
    state: value,
    subpath: 'input',
    typing: true,
  },
]

/**
 * Waits for what an act sets going: Base UI opens a trigger's popup a moment after the press, so a
 * check made straight away would read a part as inactive that was only slow.
 */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

const deliver = async (target: HTMLElement, act: Act, typing: boolean): Promise<void> => {
  const session = user()
  if (act === 'click') {
    await session.click(target)
    if (typing) {
      await session.keyboard('abc')
    }
  } else {
    await act_(() => target.focus())
    await session.keyboard(act === 'enter' ? '{Enter}' : ' ')
  }
  await settle()
}

const act_ = (callback: () => void): Promise<void> =>
  act(async () => {
    callback()
  })

/**
 * Renders the row, delivers the act to its target and reports whether the signal fired and what
 * the state read before and after.
 */
const attempt = async (
  row: Row,
  disabled: boolean,
  actName: Act,
): Promise<{ after: string; before: string; called: boolean }> => {
  const spy = vi.fn()
  if (row.element === undefined) {
    await renderScene(nave, row.subpath, row.props?.(disabled, spy) ?? {})
  } else {
    await render(row.element(nave, disabled, spy))
  }
  const target = partsNamed(row.marker)[row.index ?? 0]
  if (target === undefined) {
    throw new Error(`${row.name}: ${row.marker} did not render`)
  }
  const before = row.state(target)
  await deliver(target, actName, row.typing === true)
  return {
    after: row.state(partsNamed(row.marker)[row.index ?? 0] ?? target),
    before,
    called: spy.mock.calls.length > 0,
  }
}

describe('AC-base-ui-bridge-26: condition D, every disabled part is inactive, and each act is proven able to activate', () => {
  for (const row of ROWS) {
    it(row.name, async () => {
      const acts = row.acts ?? (['click', 'enter', 'space'] as const)
      const activating: Act[] = []
      for (const actName of acts) {
        if ((await attempt(row, false, actName)).called) {
          activating.push(actName)
        }
        await cleanup()
      }
      // The positive control: the click always activates the enabled part.
      expect(activating).toContain('click')
      for (const actName of activating) {
        const { after, before, called } = await attempt(row, true, actName)
        expect({ act: actName, called }).toEqual({ act: actName, called: false })
        expect(after).toBe(before)
        await cleanup()
      }
    })
  }
})
