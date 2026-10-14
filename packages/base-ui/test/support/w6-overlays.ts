/**
 * Trees for the other overlays the completion render tests open: Preview Card, Alert Dialog, the
 * Dialog, Popover and a pair of Tooltips in one provider. Each takes props by part, as the menu
 * trees do.
 */
/* eslint-disable unicorn/max-nested-calls -- a tree is written as the nested calls it renders */
import type { ReactElement } from 'react'

import type { Props, Source } from './scenes.ts'

import { el } from './w6-render.ts'

type ByPart = Readonly<Record<string, Props>>

export const previewCardTree = (source: Source, props: ByPart = {}): ReactElement =>
  el(
    source,
    'preview-card',
    'Root',
    props.Root,
    el(
      source,
      'preview-card',
      'Trigger',
      { closeDelay: 0, delay: 0, href: '#', ...props.Trigger },
      'Link',
    ),
    el(
      source,
      'preview-card',
      'Portal',
      {},
      el(source, 'preview-card', 'Backdrop', props.Backdrop),
      el(
        source,
        'preview-card',
        'Positioner',
        props.Positioner,
        el(
          source,
          'preview-card',
          'Popup',
          props.Popup,
          el(source, 'preview-card', 'Arrow', props.Arrow),
          'Preview',
        ),
      ),
    ),
  )

/**
A Dialog or an Alert Dialog: the trigger, a backdrop, and a popup with a title, a description and
a close.
 */
export const dialogTree = (
  source: Source,
  subpath: 'alert-dialog' | 'dialog',
  props: ByPart = {},
): ReactElement =>
  el(
    source,
    subpath,
    'Root',
    props.Root,
    el(source, subpath, 'Trigger', props.Trigger, 'Open'),
    el(
      source,
      subpath,
      'Portal',
      {},
      el(source, subpath, 'Backdrop', props.Backdrop),
      el(
        source,
        subpath,
        'Popup',
        props.Popup,
        el(source, subpath, 'Title', {}, 'Title'),
        el(source, subpath, 'Description', {}, 'Description'),
        el(source, subpath, 'Close', props.Close, 'Close'),
      ),
    ),
  )

export const popoverTree = (source: Source, props: ByPart = {}): ReactElement =>
  el(
    source,
    'popover',
    'Root',
    props.Root,
    el(source, 'popover', 'Trigger', props.Trigger, 'Open'),
    el(
      source,
      'popover',
      'Portal',
      {},
      el(source, 'popover', 'Backdrop', props.Backdrop),
      el(
        source,
        'popover',
        'Positioner',
        props.Positioner,
        el(
          source,
          'popover',
          'Popup',
          props.Popup,
          el(source, 'popover', 'Arrow', props.Arrow),
          el(source, 'popover', 'Title', {}, 'Title'),
          el(source, 'popover', 'Close', {}, 'Close'),
        ),
      ),
    ),
  )

/**
A Tooltip with a trigger and a popup, markers `Tooltip.Trigger` and `Tooltip.Popup` unless given.
 */
export const tooltipTree = (source: Source, props: ByPart = {}): ReactElement =>
  el(
    source,
    'tooltip',
    'Root',
    props.Root,
    el(source, 'tooltip', 'Trigger', { delay: 0, ...props.Trigger }, 'Hover'),
    el(
      source,
      'tooltip',
      'Portal',
      {},
      el(
        source,
        'tooltip',
        'Positioner',
        props.Positioner,
        el(
          source,
          'tooltip',
          'Popup',
          props.Popup,
          el(source, 'tooltip', 'Arrow', props.Arrow),
          'Tip',
        ),
      ),
    ),
  )

/**
Two Tooltips in one `Tooltip.Provider`; their markers end in `1` and `2` (`Tooltip.Popup.2`).
 */
export const tooltipPairTree = (source: Source): ReactElement =>
  el(
    source,
    'tooltip',
    'Provider',
    { delay: 0 },
    ...[1, 2].map((number) =>
      el(
        source,
        'tooltip',
        'Root',
        { key: number },
        el(
          source,
          'tooltip',
          'Trigger',
          { 'data-part': `Tooltip.Trigger.${number}`, delay: 0 },
          `Hover ${number}`,
        ),
        el(
          source,
          'tooltip',
          'Portal',
          {},
          el(
            source,
            'tooltip',
            'Positioner',
            {},
            el(
              source,
              'tooltip',
              'Popup',
              { 'data-part': `Tooltip.Popup.${number}` },
              `Tip ${number}`,
            ),
          ),
        ),
      ),
    ),
  )
