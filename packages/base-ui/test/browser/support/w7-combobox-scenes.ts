/**
 * The Combobox and Autocomplete trees the combobox box tests mount: the standard layout (the
 * input and its buttons in an `InputGroup`, the popup beside it), the chips layout of a `multiple`
 * Combobox, and the input-inside-popup layout with a `Select` to compare its trigger with. Every
 * part that is measured carries a test id.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import type { Autocomplete } from '../../../dist/autocomplete/index.js'

import { Combobox } from '../../../dist/combobox/index.js'
import { Field } from '../../../dist/field/index.js'
import { Select } from '../../../dist/select/index.js'
import { el as h } from './page.ts'

type Parts = typeof Autocomplete | typeof Combobox

export const FRUITS = ['apple', 'banana', 'cherry'] as const

export interface FieldState {
  /**
  Disabled on the Field.
   */
  readonly fieldDisabled?: boolean
  readonly invalid?: boolean
  /**
  Disabled on the component's Root.
   */
  readonly rootDisabled?: boolean
}

const popup = (parts: Parts, hasEmpty = false): ReactNode =>
  h(
    parts.Portal,
    {},
    h(
      parts.Positioner,
      {},
      h(
        parts.Popup,
        { 'data-testid': 'popup' },
        hasEmpty ? h(parts.Empty, { 'data-testid': 'empty' }, 'No results') : undefined,
        h(parts.List, { 'data-testid': 'list' }, ((item: string) =>
          h(parts.Item, { key: item, value: item }, item)) as never),
      ),
    ),
  )

/**
Standard layout inside a Field: the input, the trigger and the clear button in the group.
 */
export const standard = (
  parts: Parts,
  { fieldDisabled, invalid, rootDisabled }: FieldState = {},
  { hasEmpty = false, hasValue = true }: { hasEmpty?: boolean; hasValue?: boolean } = {},
): ReactNode =>
  h(
    'div',
    { style: { padding: 48, width: 320 } },
    h(
      Field.Root,
      { disabled: fieldDisabled, invalid },
      h(
        parts.Root,
        {
          disabled: rootDisabled,
          items: FRUITS,
          ...(hasValue && { defaultValue: 'apple' }),
        },
        h(
          parts.InputGroup,
          { 'data-testid': 'group' },
          h(parts.Input, { 'aria-label': 'Fruit', 'data-testid': 'input' }),
          h(parts.Clear, { 'aria-label': 'Clear', 'data-testid': 'clear' }, 'x'),
          h(parts.Trigger, { 'aria-label': 'Open', 'data-testid': 'trigger' }, 'v'),
        ),
        popup(parts, hasEmpty),
      ),
    ),
  )

/**
A multiple Combobox holding apple and cherry as chips, each with a remove button.
 */
export const chips = (): ReactNode =>
  h(
    'div',
    { style: { padding: 48, width: 360 } },
    h(
      Combobox.Root,
      { defaultValue: ['apple', 'cherry'], items: FRUITS, multiple: true },
      h(
        Combobox.Chips,
        { 'data-testid': 'chips' },
        h(Combobox.Value, {}, ((values: string[]) =>
          values.map((value) =>
            h(
              Combobox.Chip,
              { 'aria-label': value, 'data-testid': `chip-${value}`, key: value },
              value,
              h(Combobox.ChipRemove, {
                'aria-label': `Remove ${value}`,
                'data-testid': `remove-${value}`,
              }),
            ),
          )) as never),
        h(Combobox.Input, { 'aria-label': 'Fruit', 'data-testid': 'input' }),
      ),
      popup(Combobox),
    ),
  )

/**
The layout that puts the input inside the popup, behind a trigger that opens a dialog, next to a
`Select` in the same Field state.
 */
export const insidePopup = ({ fieldDisabled, invalid, rootDisabled }: FieldState = {}): ReactNode =>
  h(
    'div',
    { style: { display: 'grid', gap: 24, padding: 48, width: 320 } },
    h(
      Field.Root,
      { disabled: fieldDisabled, invalid },
      h(
        Combobox.Root,
        { disabled: rootDisabled, items: FRUITS },
        h(Combobox.Trigger, { 'data-testid': 'trigger' }, 'Choose'),
        h(
          Combobox.Portal,
          {},
          h(
            Combobox.Positioner,
            {},
            h(
              Combobox.Popup,
              {},
              h(Combobox.Input, { 'aria-label': 'Fruit' }),
              h(Combobox.List, {}, ((item: string) =>
                h(Combobox.Item, { key: item, value: item }, item)) as never),
            ),
          ),
        ),
      ),
    ),
    h(
      Field.Root,
      { disabled: fieldDisabled, invalid },
      h(
        Select.Root,
        { disabled: rootDisabled },
        h(
          Select.Trigger,
          { 'data-testid': 'select' },
          h(Select.Value, {}, 'Choose'),
          h(Select.Icon, {}, 'v'),
        ),
      ),
    ),
  )
