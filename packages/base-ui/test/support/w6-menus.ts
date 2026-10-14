import type { ReactElement, ReactNode } from 'react'

/**
 * Trees for the list-like overlays the completion render tests open: Menu, Context Menu, a
 * Menubar's menu and Select, each with every item kind a list has, so a test can walk the
 * highlight over all of them.
 */
/* eslint-disable unicorn/max-nested-calls -- a tree is written as the nested calls it renders */
import { fireEvent } from '@testing-library/dom'

import type { Props, Source } from './scenes.ts'

import { user } from './react.ts'
import { el, hasPart, need, settle } from './w6-render.ts'

export type MenuSubpath = 'context-menu' | 'menu'

/**
The item kinds of a menu, `LinkItem` only where the installed Base UI has it.
 */
export const menuItems = (
  source: Source,
  bare: Source,
  subpath: MenuSubpath,
  props: Readonly<Record<string, Props>> = {},
): ReactNode[] => [
  el(source, subpath, 'Item', { key: 'item', ...props.Item }, 'Item'),
  ...(hasPart(bare, subpath, 'LinkItem')
    ? [el(source, subpath, 'LinkItem', { href: '#', key: 'link', ...props.LinkItem }, 'Link')]
    : []),
  el(source, subpath, 'CheckboxItem', { key: 'check', ...props.CheckboxItem }, 'Check'),
  el(
    source,
    subpath,
    'RadioGroup',
    { defaultValue: 'a', key: 'radio' },
    el(source, subpath, 'RadioItem', { value: 'a', ...props.RadioItem }, 'Radio'),
  ),
  el(
    source,
    subpath,
    'SubmenuRoot',
    { key: 'submenu' },
    el(source, subpath, 'SubmenuTrigger', { ...props.SubmenuTrigger }, 'More'),
    el(
      source,
      subpath,
      'Portal',
      {},
      el(
        source,
        subpath,
        'Positioner',
        {},
        el(source, subpath, 'Popup', {}, el(source, subpath, 'Item', {}, 'Nested')),
      ),
    ),
  ),
]

const menuPopup = (
  source: Source,
  bare: Source,
  subpath: MenuSubpath,
  props: Readonly<Record<string, Props>>,
): ReactElement =>
  el(
    source,
    subpath,
    'Portal',
    {},
    el(source, subpath, 'Backdrop', props.Backdrop),
    el(
      source,
      subpath,
      'Positioner',
      props.Positioner,
      el(
        source,
        subpath,
        'Popup',
        props.Popup,
        el(source, subpath, 'Arrow', props.Arrow),
        ...menuItems(source, bare, subpath, props),
      ),
    ),
  )

/**
A standalone Menu with a trigger. `props` is by part (`Root`, `Trigger`, `Popup`, `Item` ...).
 */
export const menuTree = (
  source: Source,
  bare: Source,
  props: Readonly<Record<string, Props>> = {},
): ReactElement =>
  el(
    source,
    'menu',
    'Root',
    props.Root,
    el(source, 'menu', 'Trigger', props.Trigger, 'Open'),
    menuPopup(source, bare, 'menu', props),
  )

/**
A Context Menu: its trigger is the reader's own area.
 */
export const contextMenuTree = (
  source: Source,
  bare: Source,
  props: Readonly<Record<string, Props>> = {},
): ReactElement =>
  el(
    source,
    'context-menu',
    'Root',
    props.Root,
    el(source, 'context-menu', 'Trigger', props.Trigger, 'Area'),
    menuPopup(source, bare, 'context-menu', props),
  )

/**
A Menubar holding one Menu whose trigger is the Menubar's. The menu parts come from `menu`.
 */
export const menubarTree = (
  source: Source,
  bare: Source,
  props: Readonly<Record<string, Props>> = {},
): ReactElement =>
  el(
    source,
    'menubar',
    '.',
    props.Menubar,
    el(
      source,
      'menu',
      'Root',
      props.Root,
      el(source, 'menu', 'Trigger', { variant: 'ghost', ...props.Trigger }, 'File'),
      menuPopup(source, bare, 'menu', props),
    ),
  )

/**
A Select holding two items.
 */
export const selectTree = (
  source: Source,
  props: Readonly<Record<string, Props>> = {},
): ReactElement =>
  el(
    source,
    'select',
    'Root',
    // eslint-disable-next-line unicorn/no-null -- null is the Select's empty value, which undefined would leave uncontrolled
    { defaultValue: null, ...props.Root },
    el(
      source,
      'select',
      'Trigger',
      props.Trigger,
      el(source, 'select', 'Value', {}),
      el(source, 'select', 'Icon', {}, 'v'),
    ),
    el(
      source,
      'select',
      'Portal',
      {},
      el(source, 'select', 'Backdrop', props.Backdrop),
      el(
        source,
        'select',
        'Positioner',
        props.Positioner,
        el(
          source,
          'select',
          'Popup',
          props.Popup,
          el(source, 'select', 'Arrow', props.Arrow),
          el(
            source,
            'select',
            'List',
            {},
            el(
              source,
              'select',
              'Item',
              { value: 'a', ...props.Item },
              el(source, 'select', 'ItemText', {}, 'A'),
            ),
            el(
              source,
              'select',
              'Item',
              { value: 'b', ...props.Item },
              el(source, 'select', 'ItemText', {}, 'B'),
            ),
          ),
        ),
      ),
    ),
  )

/**
Opens a Context Menu the way a user does, with the context-menu event on its trigger area.
 */
export const openContextMenu = async (): Promise<void> => {
  fireEvent.contextMenu(need('ContextMenu.Trigger'))
  await settle()
}

/**
Clicks a trigger and waits for the popup.
 */
export const openByClick = async (marker: string): Promise<void> => {
  await user().click(need(marker))
  await settle()
}

/**
The elements carrying `data-highlighted`, as markers.
 */
export const highlighted = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-highlighted]'),
]

/**
Presses ArrowDown `count` times and reads the highlighted element after each press, while it is
still the highlighted one (the highlight moves with the next press). Returns the elements read.
 */
export const arrowThrough = async (
  count: number,
  read?: (element: HTMLElement) => void,
): Promise<HTMLElement[]> => {
  const seen: HTMLElement[] = []
  for (let press = 0; press < count; press += 1) {
    await user().keyboard('{ArrowDown}')
    await settle(10)
    const [element] = highlighted()
    if (element !== undefined) {
      read?.(element)
      seen.push(element)
    }
  }
  return seen
}
