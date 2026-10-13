/**
 * The ten popups that take a motion class, each as a scene, how it is opened and how it is closed.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { Opening } from './w8-actions.ts'

import { AlertDialog } from '../../../dist/alert-dialog/index.js'
import { Autocomplete } from '../../../dist/autocomplete/index.js'
import { Combobox } from '../../../dist/combobox/index.js'
import { ContextMenu } from '../../../dist/context-menu/index.js'
import { Dialog } from '../../../dist/dialog/index.js'
import { Menu } from '../../../dist/menu/index.js'
import { Menubar } from '../../../dist/menubar/index.js'
import { Popover } from '../../../dist/popover/index.js'
import { PreviewCard } from '../../../dist/preview-card/index.js'
import { Select } from '../../../dist/select/index.js'
import { el as h } from './page.ts'
import {
  close,
  comboboxLike,
  dialogScene,
  menuItems,
  menuScene,
  outside,
  popup,
  type Scene,
  trigger,
} from './w8-scenes.ts'

export interface PopupCase {
  /**
  How the popup closes when the component allows more than one way: its Close part, or a click away.
   */
  readonly closes: 'close' | 'outside'
  /**
  Whether an Escape close gives the popup `data-instant="dismiss"` (the Menu, Context Menu, Popover).
   */
  readonly dismissesInstantly: boolean
  /**
  The motion class the wrapper puts on the popup.
   */
  readonly motion: 'popup-fade' | 'popup-motion'
  readonly name: string
  readonly opening: Opening
  /**
  The scene, its Root given the props passed (a test opens a popup on mount with `defaultOpen`).
   */
  readonly scene: Scene
}

export const popupCases: readonly PopupCase[] = [
  {
    closes: 'outside',
    dismissesInstantly: true,
    motion: 'popup-motion',
    name: 'Menu',
    opening: 'Enter',
    scene: menuScene,
  },
  {
    closes: 'outside',
    dismissesInstantly: true,
    motion: 'popup-motion',
    name: 'Context Menu',
    opening: 'RightClick',
    scene: (root = {}) =>
      h(
        'div',
        {},
        h(
          ContextMenu.Root,
          root,
          h(ContextMenu.Trigger, { ...trigger, tabIndex: 0 }, 'Region'),
          h(
            ContextMenu.Portal,
            {},
            h(ContextMenu.Positioner, {}, h(ContextMenu.Popup, popup, ...menuItems(ContextMenu))),
          ),
        ),
        outside(),
      ),
  },
  {
    closes: 'outside',
    dismissesInstantly: false,
    motion: 'popup-motion',
    name: 'Menubar menu',
    opening: 'Enter',
    scene: (root = {}) =>
      h(
        'div',
        {},
        h(
          Menubar,
          {},
          h(
            Menu.Root,
            root,
            h(Menu.Trigger, trigger, 'File'),
            h(Menu.Portal, {}, h(Menu.Positioner, {}, h(Menu.Popup, popup, ...menuItems(Menu)))),
          ),
        ),
        outside(),
      ),
  },
  {
    closes: 'close',
    dismissesInstantly: true,
    motion: 'popup-motion',
    name: 'Popover',
    opening: 'Enter',
    scene: (root = {}) =>
      h(
        'div',
        {},
        h(
          Popover.Root,
          root,
          h(Popover.Trigger, trigger, 'Open'),
          h(
            Popover.Portal,
            {},
            h(
              Popover.Positioner,
              {},
              h(
                Popover.Popup,
                popup,
                h(Popover.Title, {}, 'Title'),
                h(Popover.Close, close, 'Close'),
              ),
            ),
          ),
        ),
        outside(),
      ),
  },
  {
    closes: 'outside',
    dismissesInstantly: false,
    motion: 'popup-fade',
    name: 'Select',
    opening: 'Enter',
    scene: (root = {}) =>
      h(
        'div',
        {},
        h(
          Select.Root,
          { defaultValue: 'a', ...root },
          h(Select.Trigger, trigger, h(Select.Value), h(Select.Icon, {}, 'v')),
          h(
            Select.Portal,
            {},
            h(
              Select.Positioner,
              {},
              h(
                Select.Popup,
                popup,
                h(
                  Select.List,
                  {},
                  h(Select.Item, { value: 'a' }, h(Select.ItemText, {}, 'A')),
                  h(Select.Item, { value: 'b' }, h(Select.ItemText, {}, 'B')),
                ),
              ),
            ),
          ),
        ),
        outside(),
      ),
  },
  {
    closes: 'close',
    dismissesInstantly: false,
    motion: 'popup-fade',
    name: 'Dialog',
    opening: 'Enter',
    scene: dialogScene(Dialog),
  },
  {
    closes: 'close',
    dismissesInstantly: false,
    motion: 'popup-fade',
    name: 'Alert Dialog',
    opening: 'Enter',
    scene: dialogScene(AlertDialog),
  },
  {
    closes: 'outside',
    dismissesInstantly: false,
    motion: 'popup-fade',
    name: 'Preview Card',
    opening: 'Tab',
    scene: (root = {}) =>
      h(
        'div',
        {},
        h(
          PreviewCard.Root,
          root,
          h(PreviewCard.Trigger, { ...trigger, href: '#' }, 'Link'),
          h(
            PreviewCard.Portal,
            {},
            h(PreviewCard.Positioner, {}, h(PreviewCard.Popup, popup, 'Preview')),
          ),
        ),
        outside(),
      ),
  },
  {
    closes: 'outside',
    dismissesInstantly: false,
    motion: 'popup-fade',
    name: 'Combobox',
    opening: 'ArrowDown',
    scene: (root = {}) => comboboxLike(Combobox, root),
  },
  {
    closes: 'outside',
    dismissesInstantly: false,
    motion: 'popup-fade',
    name: 'Autocomplete',
    opening: 'ArrowDown',
    scene: (root = {}) => comboboxLike(Autocomplete, root),
  },
]
