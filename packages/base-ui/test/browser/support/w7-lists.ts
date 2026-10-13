/**
 * The lists that highlight an item, each opened in a real page through the built wrappers: Menu,
 * a Menubar's menu, Context Menu, Select, Combobox and Autocomplete. Every list holds the same
 * three items, an enabled `apple`, a disabled `banana` and an enabled `cherry`, each with a test
 * id of its own, and is opened the way a person opens it, then walked with the real ArrowDown key.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { userEvent } from 'vitest/browser'

import { Autocomplete } from '../../../dist/autocomplete/index.js'
import { Combobox } from '../../../dist/combobox/index.js'
import { ContextMenu } from '../../../dist/context-menu/index.js'
import { Menu } from '../../../dist/menu/index.js'
import { Menubar } from '../../../dist/menubar/index.js'
import { Select } from '../../../dist/select/index.js'
import { byTestId, el as h, mount, type Page, settled } from './page.ts'

export type ItemId = 'apple' | 'banana' | 'cherry'

export const ITEMS: readonly ItemId[] = ['apple', 'banana', 'cherry']

export interface List {
  readonly name: string
  /**
  Mounts the list, opens it as a person would, and waits for its items.
   */
  readonly open: () => Promise<Page>
  /**
  Whether the list keeps focus in an input while its items are highlighted.
   */
  readonly hasInput: boolean
}

/**
The props of an item: its test id, and `disabled` for `banana` unless the list is given other
disabled items.
 */
const itemId = (id: ItemId, disabled: readonly ItemId[] = ['banana']): Record<string, unknown> => ({
  'data-testid': id,
  ...(disabled.includes(id) && { disabled: true }),
})

const ARROW_DOWN_LIMIT = 8

export const required = (id: string): HTMLElement => {
  const element = byTestId(id)
  if (element === undefined) {
    throw new Error(`no element with test id ${id}`)
  }
  return element
}

export const isHighlighted = (id: ItemId): boolean =>
  byTestId(id)?.hasAttribute('data-highlighted') ?? false

/**
Presses ArrowDown until the item carries `data-highlighted`, and says how many presses it took.
 */
export const highlight = async (id: ItemId): Promise<number> => {
  for (let presses = 0; presses < ARROW_DOWN_LIMIT; presses += 1) {
    if (isHighlighted(id)) {
      return presses
    }
    await userEvent.keyboard('{ArrowDown}')
  }
  if (!isHighlighted(id)) {
    throw new Error(`ArrowDown never highlighted ${id}`)
  }
  return ARROW_DOWN_LIMIT
}

const waitForItems = async (): Promise<void> => {
  await settled(() => byTestId('cherry'))
}

const menuItems = (Item: unknown): ReactNode[] =>
  ITEMS.map((id) => h(Item, { key: id, ...itemId(id) }, id))

const menuPopup = (parts: {
  Item: unknown
  Popup: unknown
  Portal: unknown
  Positioner: unknown
}): ReactNode =>
  h(parts.Portal, {}, h(parts.Positioner, {}, h(parts.Popup, {}, ...menuItems(parts.Item))))

const menu = (): ReactNode =>
  h(
    Menu.Root,
    {},
    h(Menu.Trigger, { 'data-testid': 'trigger' }, 'Open'),
    menuPopup({
      Item: Menu.Item,
      Popup: Menu.Popup,
      Portal: Menu.Portal,
      Positioner: Menu.Positioner,
    }),
  )

const menubar = (): ReactNode =>
  h(
    Menubar,
    {},
    h(
      Menu.Root,
      {},
      h(Menu.Trigger, { 'data-testid': 'trigger' }, 'Open'),
      menuPopup({
        Item: Menu.Item,
        Popup: Menu.Popup,
        Portal: Menu.Portal,
        Positioner: Menu.Positioner,
      }),
    ),
  )

const contextMenu = (): ReactNode =>
  h(
    ContextMenu.Root,
    {},
    h(
      ContextMenu.Trigger,
      { 'data-testid': 'trigger', style: { display: 'block', padding: 24 } },
      'Area',
    ),
    menuPopup({
      Item: ContextMenu.Item,
      Popup: ContextMenu.Popup,
      Portal: ContextMenu.Portal,
      Positioner: ContextMenu.Positioner,
    }),
  )

const select = (): ReactNode =>
  h(
    Select.Root,
    {},
    h(Select.Trigger, { 'data-testid': 'trigger' }, h(Select.Value), h(Select.Icon, {}, 'v')),
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
            ...ITEMS.map((id) =>
              h(Select.Item, { key: id, value: id, ...itemId(id) }, h(Select.ItemText, {}, id)),
            ),
          ),
        ),
      ),
    ),
  )

export const comboboxLike = (
  Parts: typeof Autocomplete | typeof Combobox,
  rootProps: Record<string, unknown>,
  disabled: readonly ItemId[] = ['banana'],
): ReactNode =>
  h(
    Parts.Root,
    { items: ITEMS, ...rootProps },
    h(
      Parts.InputGroup,
      {},
      h(Parts.Input, { 'aria-label': 'Fruit', 'data-testid': 'input' }),
      h(Parts.Trigger, { 'aria-label': 'Open' }, 'v'),
    ),
    h(
      Parts.Portal,
      {},
      h(
        Parts.Positioner,
        {},
        h(
          Parts.Popup,
          {},
          h(Parts.List, {}, ((item: ItemId) =>
            h(Parts.Item, { key: item, value: item, ...itemId(item, disabled) }, item)) as never),
        ),
      ),
    ),
  )

const openByClick = async (scene: () => ReactNode, targetId = 'trigger'): Promise<Page> => {
  const page = mount(h('div', { style: { padding: 48 } }, scene()))
  await userEvent.click(required(targetId))
  await waitForItems()
  return page
}

const openByContextClick = async (): Promise<Page> => {
  const page = mount(h('div', { style: { padding: 48 } }, contextMenu()))
  await userEvent.click(required('trigger'), { button: 'right' })
  await waitForItems()
  return page
}

export const openCombobox = async (scene: () => ReactNode): Promise<Page> => {
  const page = mount(h('div', { style: { padding: 48 } }, scene()))
  await userEvent.click(required('input'))
  await userEvent.keyboard('{ArrowDown}')
  await waitForItems()
  return page
}

export const lists: readonly List[] = [
  { hasInput: false, name: 'Menu', open: () => openByClick(menu) },
  { hasInput: false, name: 'Menubar menu', open: () => openByClick(menubar) },
  { hasInput: false, name: 'Context Menu', open: openByContextClick },
  { hasInput: false, name: 'Select', open: () => openByClick(select) },
  { hasInput: true, name: 'Combobox', open: () => openCombobox(() => comboboxLike(Combobox, {})) },
  {
    hasInput: true,
    name: 'Autocomplete',
    open: () => openCombobox(() => comboboxLike(Autocomplete, {})),
  },
]

/**
The Combobox lists only: the ones whose focus stays in the input.
 */
export const inputLists: readonly List[] = lists.filter((list) => list.hasInput)
