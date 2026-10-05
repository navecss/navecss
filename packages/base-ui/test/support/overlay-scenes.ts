/**
 * The scenes of the overlay components: each renders a trigger and the portalled tree it opens.
 * Kept apart from `scenes.ts`, which turns every build into a scene.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import type { Make } from './scenes.ts'

const menuContent = (h: Make): ReactNode[] => [
  h('Arrow'),
  h(
    'Viewport',
    {},
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
  ),
]

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
export const overlayBuilds: Readonly<Record<string, (h: Make) => ReactNode>> = {
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
}
