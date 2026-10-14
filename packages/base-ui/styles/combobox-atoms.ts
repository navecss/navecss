/**
The Combobox and Autocomplete atoms: the field box, its trigger, the chips and the empty message.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import { V } from './shared.ts'

export const comboboxAtoms: Record<string, AtomDefinition> = {
  baseUiInputGroup: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'flex',
      'align-items': 'stretch',
      'min-block-size': V('size-control-md'),
      border: `${V('border-width-sm')} solid ${V('color-border-control')}`,
      'border-radius': V('radius-control'),
      'background-color': 'transparent',
      color: V('color-content-primary'),
    },
    pseudos: {
      '[data-invalid]:not([data-disabled])': {
        'border-color': V('color-feedback-danger'),
        'border-width': V('border-width-mark'),
      },
      '[data-disabled]': {
        'border-color': V('color-border-disabled'),
        color: V('color-content-disabled'),
      },
    },
  },
  baseUiComboboxTrigger: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      flex: 'none',
      'inline-size': V('size-control-sm'),
      padding: '0',
      border: '0',
      'background-color': 'transparent',
      color: 'inherit',
      'font-family': 'inherit',
      cursor: 'pointer',
    },
    pseudos: {
      '[aria-haspopup="dialog"]': {
        'inline-size': 'auto',
        'min-block-size': V('size-control-md'),
        'justify-content': 'space-between',
        gap: V('spacing-control-sm'),
        'padding-inline': V('spacing-control-md'),
        border: `${V('border-width-sm')} solid ${V('color-border-control')}`,
        'border-radius': V('radius-control'),
        color: V('color-content-primary'),
        'font-size': V('font-size-sm'),
        'text-align': 'start',
      },
      '[aria-haspopup="dialog"][aria-invalid="true"]': {
        'border-color': V('color-feedback-danger'),
        'border-width': V('border-width-mark'),
        'padding-inline': `calc(${V('spacing-control-md')} - ${V('border-width-mark')} + ${V('border-width-sm')})`,
      },
      ':disabled, [aria-disabled="true"]': {
        color: V('color-content-disabled'),
        cursor: 'not-allowed',
      },
      '[aria-haspopup="dialog"]:disabled, [aria-haspopup="dialog"][aria-disabled="true"]': {
        'border-color': V('color-border-disabled'),
      },
    },
  },
  baseUiChips: {
    declarations: {
      display: 'flex',
      'flex-wrap': 'wrap',
      'align-items': 'center',
      flex: '1',
      'min-inline-size': '0',
      gap: V('spacing-control-sm'),
      padding: V('spacing-control-sm'),
    },
  },
  baseUiChip: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'inline-flex',
      'align-items': 'center',
      gap: V('spacing-control-xs'),
      'min-block-size': `calc(${V('size-control-xs')} + 2 * ${V('border-width-sm')})`,
      'padding-inline': `${V('spacing-control-sm')} ${V('spacing-control-xs')}`,
      border: `${V('border-width-sm')} solid ${V('color-border-control')}`,
      'border-radius': V('radius-control'),
      'background-color': 'transparent',
      color: V('color-content-primary'),
      'font-size': V('font-size-sm'),
      'line-height': V('line-height-tight'),
      cursor: 'default',
    },
    pseudos: {
      '[aria-disabled="true"]': {
        'border-color': V('color-border-disabled'),
        color: V('color-content-disabled'),
      },
    },
  },
  baseUiChipRemove: {
    declarations: {
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      flex: 'none',
      'align-self': 'stretch',
      'inline-size': V('size-control-xs'),
      padding: '0',
      border: '0',
      'background-color': 'transparent',
      color: 'inherit',
      'font-family': 'inherit',
      cursor: 'pointer',
    },
    pseudos: {
      ':disabled, [aria-disabled="true"]': {
        color: V('color-content-disabled'),
        cursor: 'not-allowed',
      },
    },
  },
  baseUiListEmpty: {
    declarations: {
      'font-size': V('font-size-sm'),
      color: V('color-content-secondary'),
    },
    pseudos: {
      '[data-empty] > &': {
        padding: `${V('spacing-control-sm')} ${V('spacing-control-md')}`,
      },
    },
  },
}
