/**
 * The scene builders of the popups that take a motion class. Every scene carries the test ids
 * `trigger`, `popup` and `outside` (a control away from the popup), and, where the component has
 * one, `close`.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import type { AlertDialog } from '../../../dist/alert-dialog/index.js'
import type { Autocomplete } from '../../../dist/autocomplete/index.js'
import type { Combobox } from '../../../dist/combobox/index.js'
import type { ContextMenu } from '../../../dist/context-menu/index.js'
import type { Dialog } from '../../../dist/dialog/index.js'

import { Menu } from '../../../dist/menu/index.js'
import { el as h } from './page.ts'

export const outside = (): ReactNode => h('button', { 'data-testid': 'outside' }, 'Outside')

export const popup = { 'data-testid': 'popup' } as const
export const trigger = { 'data-testid': 'trigger' } as const
export const close = { 'data-testid': 'close' } as const

export type Scene = (root?: Readonly<Record<string, unknown>>) => ReactNode

export const dialogScene =
  (Namespace: typeof AlertDialog | typeof Dialog): Scene =>
  (root = {}): ReactNode =>
    h(
      'div',
      {},
      h(
        Namespace.Root,
        root,
        h(Namespace.Trigger, trigger, 'Open'),
        h(
          Namespace.Portal,
          {},
          h(Namespace.Backdrop, {}),
          h(
            Namespace.Viewport,
            {},
            h(
              Namespace.Popup,
              popup,
              h(Namespace.Title, {}, 'Title'),
              h(Namespace.Description, {}, 'Description'),
              h(Namespace.Close, close, 'Close'),
            ),
          ),
        ),
      ),
      outside(),
    )

export const menuItems = (Namespace: typeof Menu | typeof ContextMenu): ReactNode[] => [
  h(Namespace.Item, {}, 'First'),
  h(Namespace.Item, {}, 'Second'),
]

export const menuScene: Scene = (root = {}) =>
  h(
    'div',
    {},
    h(
      Menu.Root,
      root,
      h(Menu.Trigger, trigger, 'Open'),
      h(Menu.Portal, {}, h(Menu.Positioner, {}, h(Menu.Popup, popup, ...menuItems(Menu)))),
    ),
    outside(),
  )

export const comboboxLike = (
  Namespace: typeof Autocomplete | typeof Combobox,
  root: Readonly<Record<string, unknown>>,
): ReactNode =>
  h(
    'div',
    {},
    h(
      Namespace.Root,
      root,
      h(Namespace.Input, { ...trigger, 'aria-label': 'Fruit' }),
      h(
        Namespace.Portal,
        {},
        h(
          Namespace.Positioner,
          {},
          h(
            Namespace.Popup,
            popup,
            h(
              Namespace.List,
              {},
              h(Namespace.Item, { value: 'apple' }, 'Apple'),
              h(Namespace.Item, { value: 'banana' }, 'Banana'),
            ),
          ),
        ),
      ),
    ),
    outside(),
  )
