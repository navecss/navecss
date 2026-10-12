/**
 * The Combobox and Autocomplete trees the completion render tests share: the standard layout
 * (the input in an `InputGroup`, the popup beside it), the chips layout of a `multiple` Combobox,
 * and the input-inside-popup layout. A tree is built from a source, so the same tree renders
 * through the wrapper or, when a test asks, through Base UI's own parts.
 */
/* eslint-disable unicorn/max-nested-calls -- a tree is written as the nested calls it renders */
import type { ReactElement, ReactNode } from 'react'

import type { Props, Source } from './scenes.ts'

import { el } from './w6-render.ts'

export type Kind = 'autocomplete' | 'combobox'

export const KINDS: readonly Kind[] = ['combobox', 'autocomplete']

export const FRUITS = ['apple', 'banana', 'cherry'] as const

export interface TreeOptions {
  /**
  Items that render disabled.
   */
  readonly disabled?: readonly string[]
  readonly items?: readonly string[]
  /**
  Props for `Popup`, `Positioner`, `Input`, `Trigger`, `Clear`, `Empty`, `List`, `Arrow` and `Item`, by part.
   */
  readonly parts?: Readonly<Record<string, Props>>
  /**
  Props for the Root.
   */
  readonly root?: Props
  /**
  Children placed before the group, the Field's label among them.
   */
  readonly before?: ReactNode
}

const part = (options: TreeOptions, name: string): Props => options.parts?.[name] ?? {}

const popup = (source: Source, kind: Kind, options: TreeOptions): ReactElement =>
  el(
    source,
    kind,
    'Portal',
    {},
    el(source, kind, 'Backdrop', part(options, 'Backdrop')),
    el(
      source,
      kind,
      'Positioner',
      part(options, 'Positioner'),
      el(
        source,
        kind,
        'Popup',
        part(options, 'Popup'),
        el(source, kind, 'Arrow', part(options, 'Arrow')),
        el(source, kind, 'Empty', part(options, 'Empty'), 'No results'),
        el(source, kind, 'List', part(options, 'List'), ((item: string) =>
          el(
            source,
            kind,
            'Item',
            {
              disabled: options.disabled?.includes(item),
              key: item,
              value: item,
              ...part(options, 'Item'),
            },
            item,
          )) as never),
      ),
    ),
  )

/**
The standard layout: the input outside the popup, the group holding the input and its buttons.
 */
export const standardTree = (source: Source, kind: Kind, options: TreeOptions = {}): ReactElement =>
  el(
    source,
    kind,
    'Root',
    { items: options.items ?? FRUITS, ...options.root },
    options.before,
    el(
      source,
      kind,
      'InputGroup',
      part(options, 'InputGroup'),
      el(source, kind, 'Input', { 'aria-label': 'Fruit', ...part(options, 'Input') }),
      el(source, kind, 'Trigger', part(options, 'Trigger'), 'v'),
      el(source, kind, 'Clear', part(options, 'Clear'), 'x'),
    ),
    popup(source, kind, options),
  )

/**
The chips layout of a `multiple` Combobox holding apple and cherry.
 */
export const chipsTree = (source: Source, options: TreeOptions = {}): ReactElement =>
  el(
    source,
    'combobox',
    'Root',
    { defaultValue: ['apple', 'cherry'], items: FRUITS, multiple: true, ...options.root },
    el(
      source,
      'combobox',
      'Chips',
      part(options, 'Chips'),
      el(source, 'combobox', 'Value', {}, ((values: string[]) =>
        values.map((value) =>
          el(
            source,
            'combobox',
            'Chip',
            { 'aria-label': value, key: value, ...part(options, 'Chip') },
            value,
            el(source, 'combobox', 'ChipRemove', {
              'aria-label': `Remove ${value}`,
              ...part(options, 'ChipRemove'),
            }),
          ),
        )) as never),
      el(source, 'combobox', 'Input', { 'aria-label': 'Fruit', ...part(options, 'Input') }),
    ),
    popup(source, 'combobox', options),
  )

/**
The layout that puts the input inside the popup, behind a Trigger that opens a dialog.
 */
export const insidePopupTree = (source: Source, options: TreeOptions = {}): ReactElement =>
  el(
    source,
    'combobox',
    'Root',
    { items: options.items ?? FRUITS, ...options.root },
    options.before,
    el(source, 'combobox', 'Trigger', part(options, 'Trigger'), 'Choose'),
    el(
      source,
      'combobox',
      'Portal',
      {},
      el(
        source,
        'combobox',
        'Positioner',
        part(options, 'Positioner'),
        el(
          source,
          'combobox',
          'Popup',
          part(options, 'Popup'),
          el(source, 'combobox', 'Input', { 'aria-label': 'Fruit', ...part(options, 'Input') }),
          el(source, 'combobox', 'Empty', part(options, 'Empty'), 'No results'),
          el(source, 'combobox', 'List', part(options, 'List'), ((item: string) =>
            el(
              source,
              'combobox',
              'Item',
              { key: item, value: item, ...part(options, 'Item') },
              item,
            )) as never),
        ),
      ),
    ),
  )
