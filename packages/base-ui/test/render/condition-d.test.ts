import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Props, Source } from '../support/scenes.ts'

import { partsNamed } from '../support/dom.ts'
import { act, cleanup, render, user } from '../support/react.ts'
import { renderScene } from '../support/rows.ts'
import { partOf } from '../support/scenes.ts'
import { loadNave } from '../support/sources.ts'
import { openProps } from '../support/states.ts'

const nave: Source = await loadNave()
afterEach(cleanup)

type Act = 'arrow-right' | 'arrow-up' | 'click' | 'enter' | 'space'
type Spy = ReturnType<typeof vi.fn>

interface Row {
  readonly acts?: readonly Act[]
  /**
  What the disabled part carries on the element the act is delivered to: an `aria-disabled="true"`,
  a native `disabled`, or both. Left out where another row already pins it.
   */
  readonly attrs?: { readonly aria: boolean; readonly native: boolean }
  /**
  A custom tree, for the rows a scene cannot express.
   */
  readonly element?: (source: Source, isDisabled: boolean, spy: Spy) => ReactElement
  /**
  The part acted on, and which of its occurrences.
   */
  readonly index?: number
  readonly marker: string
  readonly name: string
  /**
  The props by part: what disables the part, and what carries the spy on the signal.
   */
  readonly props?: (isDisabled: boolean, spy: Spy) => Record<string, Props>
  /**
  What must not move when the act is delivered to the disabled part.
   */
  readonly state: (target: HTMLElement) => string
  readonly subpath: string
  /**
  The element the act is delivered to, when it is inside the marked part (the Slider's input).
   */
  readonly target?: (marked: HTMLElement) => HTMLElement
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
      // eslint-disable-next-line unicorn/no-null -- null is the Select's empty value, which undefined would leave uncontrolled
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
    attrs: { aria: false, native: true },
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
    attrs: { aria: false, native: true },
    props: (d, s) => ({ 'Dialog.Root': { onOpenChange: s }, 'Dialog.Trigger': { disabled: d } }),
    state: attribute('aria-expanded'),
    subpath: 'dialog',
  },
  {
    marker: 'Popover.Trigger',
    name: 'Popover.Trigger',
    attrs: { aria: false, native: true },
    props: (d, s) => ({ 'Popover.Root': { onOpenChange: s }, 'Popover.Trigger': { disabled: d } }),
    state: attribute('aria-expanded'),
    subpath: 'popover',
  },
  {
    marker: 'Menu.Trigger',
    name: 'Menu.Trigger',
    attrs: { aria: false, native: true },
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
    element: (source, d, s) => {
      const control = createElement(partOf(source, 'field', 'Control'), {
        'data-part': 'Field.Control',
        onValueChange: s,
      })
      const field = createElement(partOf(source, 'field', 'Root'), undefined, control)
      return createElement(partOf(source, 'fieldset', 'Root'), { disabled: d }, field)
    },
    marker: 'Field.Control',
    name: 'Field.Control (Fieldset disabled)',
    attrs: { aria: false, native: true },
    state: value,
    subpath: 'field',
    typing: true,
  },
  {
    acts: ['click'],
    marker: 'Input',
    name: 'Input',
    attrs: { aria: false, native: true },
    props: (d, s) => ({ Input: { disabled: d, onValueChange: s } }),
    state: value,
    subpath: 'input',
    typing: true,
  },
  {
    acts: ['click'],
    attrs: { aria: true, native: true },
    marker: 'NumberField.Increment',
    name: 'NumberField.Increment (Root disabled)',
    props: (d, s) => ({ 'NumberField.Root': { disabled: d, onValueChange: s } }),
    state: () => value(partsNamed('NumberField.Input')[0]!),
    subpath: 'number-field',
  },
  {
    acts: ['arrow-up'],
    marker: 'NumberField.Input',
    name: 'NumberField.Input (Root disabled)',
    props: (d, s) => ({ 'NumberField.Root': { disabled: d, onValueChange: s } }),
    state: value,
    subpath: 'number-field',
  },
  {
    acts: ['arrow-right'],
    attrs: { aria: false, native: true },
    marker: 'Slider.Thumb',
    name: "Slider.Thumb's input (Root disabled)",
    props: (d, s) => ({ 'Slider.Root': { disabled: d, onValueChange: s } }),
    state: value,
    subpath: 'slider',
    target: (marked) => marked.querySelector('input')!,
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

const KEYS = {
  'arrow-right': '{ArrowRight}',
  'arrow-up': '{ArrowUp}',
  enter: '{Enter}',
  space: ' ',
} as const

const deliver = async (target: HTMLElement, act: Act, isTyping: boolean): Promise<void> => {
  const session = user()
  if (act === 'click') {
    await session.click(target)
    if (isTyping) {
      await session.keyboard('abc')
    }
  } else {
    await act_(() => target.focus())
    await session.keyboard(KEYS[act])
  }
  await settle()
}

const act_ = (callback: () => void): Promise<void> =>
  act(() => {
    callback()
    return Promise.resolve()
  })

/**
 * Renders the row and finds the element its act is delivered to.
 */
const renderRow = async (
  row: Row,
  isDisabled: boolean,
  spy: Spy,
): Promise<{ read: () => string; target: HTMLElement }> => {
  if (row.element === undefined) {
    await renderScene(nave, row.subpath, row.props?.(isDisabled, spy) ?? {})
  } else {
    await render(row.element(nave, isDisabled, spy))
  }
  const marked = (): HTMLElement | undefined => partsNamed(row.marker)[row.index ?? 0]
  const found = marked()
  if (found === undefined) {
    throw new Error(`${row.name}: ${row.marker} did not render`)
  }
  const target = row.target?.(found) ?? found
  return { read: () => row.state(row.target?.(marked() ?? found) ?? marked() ?? found), target }
}

/**
 * Renders the row, delivers the act to its target and reports whether the signal fired and what
 * the state read before and after.
 */
const attempt = async (
  row: Row,
  isDisabled: boolean,
  actName: Act,
): Promise<{ after: string; before: string; called: boolean }> => {
  const spy = vi.fn()
  const { read, target } = await renderRow(row, isDisabled, spy)
  const before = read()
  await deliver(target, actName, row.typing === true)
  return { after: read(), before, called: spy.mock.calls.length > 0 }
}

describe('AC-base-ui-bridge-26: condition D, every disabled part is inactive, and each act is proven able to activate', () => {
  for (const row of ROWS) {
    // eslint-disable-next-line vitest/valid-title -- each row's own name is the title, a plain string
    it(row.name, async () => {
      const acts = row.acts ?? (['click', 'enter', 'space'] as const)
      const activating: Act[] = []
      for (const actName of acts) {
        const { called } = await attempt(row, false, actName)
        if (called) {
          activating.push(actName)
        }
        await cleanup()
      }
      // The positive control: the row's first act (the click, or the key a part without a click
      // target answers to) always activates the enabled part.
      expect(activating).toContain(acts[0])
      for (const actName of activating) {
        const { after, before, called } = await attempt(row, true, actName)
        expect({ act: actName, called }).toEqual({ act: actName, called: false })
        expect(after).toBe(before)
        await cleanup()
      }
    })
  }
})

const ROWS_WITH_ATTRS = ROWS.filter(({ attrs }) => attrs !== undefined)

describe('AC-base-ui-bridge-26: the disabled part carries the attributes its row names', () => {
  for (const row of ROWS_WITH_ATTRS) {
    // eslint-disable-next-line vitest/valid-title -- each row's own name is the title, a plain string
    it(row.name, async () => {
      const { target } = await renderRow(row, true, vi.fn())
      expect({
        aria: target.getAttribute('aria-disabled') === 'true',
        native: target.hasAttribute('disabled'),
      }).toEqual(row.attrs)
    })
  }
})
