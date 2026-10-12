/**
 * The scenes of the overlay components: each renders a trigger and the portalled tree it opens.
 * Kept apart from `scenes.ts`, which turns every build into a scene.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import type { Make, Other } from './scenes.ts'

/**
A scene's build: the tree for a component, with the maker for its own parts and the maker for
another component's.
 */
type Build = (h: Make, other: Other) => ReactNode

const menuItems = (h: Make): ReactNode[] => [
  h('Item', {}, 'Item'),
  h('LinkItem', { href: '#' }, 'Link'),
  h('CheckboxItem', { defaultChecked: true }, h('CheckboxItemIndicator', {}, 'x'), 'Check'),
  h(
    'RadioGroup',
    { defaultValue: 'a' },
    h('RadioItem', { value: 'a' }, h('RadioItemIndicator', {}, 'o'), 'Radio'),
  ),
  h('Group', {}, h('GroupLabel', {}, 'Group'), h('Item', {}, 'Grouped')),
  h('Separator'),
  h(
    'SubmenuRoot',
    {},
    h('SubmenuTrigger', {}, 'More'),
    h('Portal', {}, h('Positioner', {}, h('Popup', {}, h('Item', {}, 'Nested')))),
  ),
]

const menuContent = (h: Make): ReactNode[] => [h('Arrow'), h('Viewport', {}, ...menuItems(h))]

const selectContent = (h: Make): ReactNode[] => [
  h('ScrollUpArrow'),
  h('Arrow'),
  h(
    'List',
    {},
    h(
      'Group',
      {},
      h('GroupLabel', {}, 'Group'),
      h('Item', { value: 'a' }, h('ItemText', {}, 'A'), h('ItemIndicator', {}, 'x')),
      h('Item', { value: 'b' }, h('ItemText', {}, 'B'), h('ItemIndicator', {}, 'x')),
    ),
    h('Separator'),
  ),
  h('ScrollDownArrow'),
]

/**
The overlay scenes' builds, by subpath.
 */
export const overlayBuilds: Readonly<Record<string, Build>> = {
  dialog: (h) =>
    h(
      'Root',
      {},
      h('Trigger', {}, 'Open'),
      h(
        'Portal',
        {},
        h('Backdrop'),
        h(
          'Viewport',
          {},
          h(
            'Popup',
            {},
            h('Title', {}, 'Title'),
            h('Description', {}, 'Description'),
            h('Close', {}, 'Close'),
          ),
        ),
      ),
    ),

  popover: (h) =>
    h(
      'Root',
      {},
      h('Trigger', {}, 'Open'),
      h(
        'Portal',
        {},
        h('Backdrop'),
        h(
          'Positioner',
          {},
          h(
            'Popup',
            {},
            h('Arrow'),
            h(
              'Viewport',
              {},
              h('Title', {}, 'Title'),
              h('Description', {}, 'Description'),
              h('Close', {}, 'Close'),
            ),
          ),
        ),
      ),
    ),

  menu: (h) =>
    h(
      'Root',
      {},
      h('Trigger', {}, 'Open'),
      h('Portal', {}, h('Backdrop'), h('Positioner', {}, h('Popup', {}, ...menuContent(h)))),
    ),

  select: (h) =>
    h(
      'Root',
      { defaultValue: 'a' },
      h('Label', {}, 'Label'),
      h('Trigger', {}, h('Value'), h('Icon', {}, 'v')),
      h('Portal', {}, h('Backdrop'), h('Positioner', {}, h('Popup', {}, ...selectContent(h)))),
    ),

  tooltip: (h) =>
    h(
      'Provider',
      {},
      h(
        'Root',
        {},
        h('Trigger', {}, 'Hover'),
        h('Portal', {}, h('Positioner', {}, h('Popup', {}, h('Arrow'), h('Viewport', {}, 'Tip')))),
      ),
    ),

  'alert-dialog': (h) =>
    h(
      'Root',
      {},
      h('Trigger', {}, 'Open'),
      h(
        'Portal',
        {},
        h('Backdrop'),
        h(
          'Viewport',
          {},
          h(
            'Popup',
            {},
            h('Title', {}, 'Title'),
            h('Description', {}, 'Description'),
            h('Close', {}, 'Close'),
          ),
        ),
      ),
    ),

  // The Context Menu has no Viewport: its items sit in the Popup.
  'context-menu': (h) =>
    h(
      'Root',
      {},
      h('Trigger', {}, 'Region'),
      h(
        'Portal',
        {},
        h('Backdrop'),
        h('Positioner', {}, h('Popup', {}, h('Arrow'), ...menuItems(h))),
      ),
    ),

  // Two menus in the bar, their parts the Menu's own.
  menubar: (h, other) => {
    const menu = other('menu')
    const barMenu = (label: string): ReactNode =>
      menu(
        'Root',
        {},
        menu('Trigger', {}, label),
        menu(
          'Portal',
          {},
          menu('Positioner', {}, menu('Popup', {}, menu('Item', {}, `${label} item`))),
        ),
      )
    return h('.', {}, barMenu('File'), barMenu('Edit'))
  },

  'preview-card': (h) =>
    h(
      'Root',
      {},
      h('Trigger', { href: '#' }, 'Link'),
      h(
        'Portal',
        {},
        h('Backdrop'),
        h('Positioner', {}, h('Popup', {}, h('Arrow'), h('Viewport', {}, 'Preview'))),
      ),
    ),

  // The chips hold the input group, so one scene shows every part: a Combobox with a value
  // renders its chips and a `Clear`.
  combobox: (h) =>
    h(
      'Root',
      { defaultValue: ['apple'], multiple: true },
      h('Label', {}, 'Fruit'),
      h(
        'Chips',
        {},
        h('Chip', {}, 'apple', h('ChipRemove', {}, 'x')),
        h(
          'InputGroup',
          {},
          h('Input', { 'aria-label': 'Fruit' }),
          h('Clear', {}, 'c'),
          h('Trigger', {}, h('Icon', {}, 'v')),
        ),
      ),
      h(
        'Portal',
        {},
        h('Backdrop'),
        h(
          'Positioner',
          {},
          h(
            'Popup',
            {},
            h('Arrow'),
            h('Status', {}, 'Status'),
            h('Empty', {}, 'No results'),
            h(
              'List',
              {},
              h(
                'Group',
                {},
                h('GroupLabel', {}, 'Group'),
                h('Item', { value: 'apple' }, h('ItemIndicator', {}, 'x'), 'Apple'),
                h('Item', { value: 'banana' }, h('ItemIndicator', {}, 'x'), 'Banana'),
              ),
              h('Separator'),
            ),
          ),
        ),
      ),
    ),

  autocomplete: (h) =>
    h(
      'Root',
      { defaultValue: 'ap' },
      h(
        'InputGroup',
        {},
        h('Input', { 'aria-label': 'Fruit' }),
        h('Clear', {}, 'c'),
        h('Trigger', {}, h('Icon', {}, 'v')),
      ),
      h(
        'Portal',
        {},
        h('Backdrop'),
        h(
          'Positioner',
          {},
          h(
            'Popup',
            {},
            h('Arrow'),
            h('Status', {}, 'Status'),
            h('Empty', {}, 'No results'),
            h(
              'List',
              {},
              h(
                'Group',
                {},
                h('GroupLabel', {}, 'Group'),
                h('Item', { value: 'apple' }, 'Apple'),
                h('Item', { value: 'banana' }, 'Banana'),
              ),
              h('Separator'),
            ),
          ),
        ),
      ),
    ),
}
