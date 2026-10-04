/**
Overlay popups, their arrow and the list parts they hold.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import type { Declarations } from './shared.ts'

import { borderSm, V } from './shared.ts'

const listPopup: Declarations = {
  'box-sizing': 'border-box',
  'background-color': V('color-surface-overlay'),
  color: V('color-content-primary'),
  border: borderSm,
  'border-radius': V('radius-control'),
  'box-shadow': V('shadow-overlay'),
  padding: V('spacing-control-sm'),
  'font-size': V('font-size-sm'),
  'min-inline-size': 'var(--anchor-width)',
  'max-block-size': 'var(--available-height)',
  'overflow-y': 'auto',
  'scroll-padding': V('spacing-control-sm'),
}

const popoverPopup: Declarations = {
  'box-sizing': 'border-box',
  'background-color': V('color-surface-overlay'),
  color: V('color-content-primary'),
  border: borderSm,
  'border-radius': V('radius-control'),
  'box-shadow': V('shadow-overlay'),
  padding: V('spacing-content-md'),
  'font-size': V('font-size-sm'),
  'max-block-size': 'var(--available-height)',
  'overflow-y': 'auto',
  'scroll-padding': V('spacing-content-md'),
}

export const overlayAtoms: Record<string, AtomDefinition> = {
  baseUiListPopup: { declarations: listPopup },
  baseUiPopoverPopup: { declarations: popoverPopup },
  baseUiDialogPopup: {
    declarations: {
      'box-sizing': 'border-box',
      position: 'fixed',
      inset: '0',
      margin: 'auto',
      'block-size': 'fit-content',
      'inline-size': '32rem',
      'max-inline-size': `calc(100% - 2 * ${V('spacing-content-lg')})`,
      'max-block-size': `calc(100% - 2 * ${V('spacing-content-lg')})`,
      'overflow-y': 'auto',
      'scroll-padding': V('spacing-content-lg'),
      'background-color': V('color-surface-overlay'),
      color: V('color-content-primary'),
      border: borderSm,
      'border-radius': V('radius-overlay'),
      'box-shadow': V('shadow-modal'),
      padding: V('spacing-content-lg'),
    },
  },
  baseUiTooltipPopup: {
    declarations: {
      'box-sizing': 'border-box',
      'background-color': V('color-surface-inverse'),
      color: V('color-content-inverse'),
      border: `${V('border-width-sm')} solid transparent`,
      'border-radius': V('radius-sm'),
      padding: `${V('spacing-control-xs')} ${V('spacing-control-sm')}`,
      'font-size': V('font-size-xs'),
      'line-height': V('line-height-snug'),
      'max-inline-size': '20rem',
    },
  },
  baseUiArrow: {
    declarations: {},
    pseudos: {
      '[data-side="top"], [data-side="bottom"], [data-side="left"], [data-side="right"]': {
        position: 'absolute',
        'box-sizing': 'border-box',
        'inline-size': '8px',
        'block-size': '8px',
        'background-color': 'inherit',
        'border-style': 'inherit',
        'border-width': 'inherit',
        'border-color': 'inherit',
        'border-top-style': 'none',
        'border-left-style': 'none',
      },
      '[data-side="top"]': { bottom: '-4px', rotate: '45deg' },
      '[data-side="bottom"]': { top: '-4px', rotate: '225deg' },
      '[data-side="left"]': { right: '-4px', rotate: '-45deg' },
      '[data-side="right"]': { left: '-4px', rotate: '135deg' },
    },
  },
  baseUiTitle: {
    declarations: {
      margin: '0',
      'font-size': V('font-size-lg'),
      'font-weight': V('font-weight-semibold'),
      'line-height': V('line-height-tight'),
    },
  },
  baseUiDescription: {
    declarations: {
      margin: '0',
      'font-size': V('font-size-sm'),
      'line-height': V('line-height-base'),
      color: V('color-content-secondary'),
    },
  },
  baseUiItem: {
    declarations: {
      display: 'flex',
      'align-items': 'center',
      gap: V('spacing-control-sm'),
      padding: `${V('spacing-control-sm')} ${V('spacing-control-md')}`,
      cursor: 'default',
      'user-select': 'none',
    },
    pseudos: { '[aria-disabled="true"]': { color: V('color-content-disabled') } },
  },
  baseUiSeparator: {
    declarations: {
      border: '0',
      'block-size': V('border-width-sm'),
      'margin-block': V('spacing-control-xs'),
      'background-color': V('color-border-default'),
    },
  },
  baseUiGroupLabel: {
    declarations: {
      padding: `${V('spacing-control-sm')} ${V('spacing-control-md')}`,
      'font-size': V('font-size-xs'),
      'font-weight': V('font-weight-medium'),
      color: V('color-content-secondary'),
    },
  },
}
