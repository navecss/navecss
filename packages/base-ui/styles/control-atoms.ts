/**
Buttons, toggles, inputs and the select trigger.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import type { Declarations } from './shared.ts'

import { borderControl, disabledControl, invalidBoundary, placeholder, V } from './shared.ts'

const buttonBase: Declarations = {
  'box-sizing': 'border-box',
  display: 'inline-flex',
  'align-items': 'center',
  'justify-content': 'center',
  gap: V('spacing-control-sm'),
  'min-block-size': V('size-control-md'),
  'padding-block': '0',
  'padding-inline': V('spacing-control-lg'),
  border: borderControl,
  'border-radius': V('radius-control'),
  'background-color': V('color-action-secondary'),
  color: V('color-content-primary'),
  'font-family': 'inherit',
  'font-size': V('font-size-sm'),
  'font-weight': V('font-weight-medium'),
  'line-height': V('line-height-tight'),
  'white-space': 'nowrap',
  cursor: 'pointer',
  'user-select': 'none',
}

const buttonSmall: Declarations = {
  'min-block-size': V('size-control-sm'),
  'padding-inline': V('spacing-control-md'),
}

const buttonDisabled: Declarations = {
  'background-color': 'transparent',
  'border-color': V('color-border-disabled'),
  color: V('color-content-disabled'),
  cursor: 'not-allowed',
}

const inputBase: Declarations = {
  'box-sizing': 'border-box',
  'min-block-size': V('size-control-md'),
  'padding-block': '0',
  'padding-inline': V('spacing-control-md'),
  border: borderControl,
  'border-radius': V('radius-control'),
  'background-color': 'transparent',
  color: V('color-content-primary'),
  'font-family': 'inherit',
  'font-size': V('font-size-sm'),
}

const invalidInput: Declarations = {
  ...invalidBoundary,
  'padding-inline': `calc(${V('spacing-control-md')} - ${V('border-width-mark')} + ${V('border-width-sm')})`,
}

export const controlAtoms: Record<string, AtomDefinition> = {
  baseUiButton: {
    declarations: buttonBase,
    pseudos: {
      '&[data-nave-size="sm"]': buttonSmall,
      '&[data-nave-variant="primary"]': {
        'background-color': V('color-action-primary'),
        'border-color': 'transparent',
        color: V('color-on-action-primary'),
      },
      '&[data-nave-variant="primary"]:hover:not(:disabled, [aria-disabled="true"])': {
        'background-color': V('color-action-primary-hover'),
      },
      '&[data-nave-variant="primary"]:active:not(:disabled, [aria-disabled="true"])': {
        'background-color': V('color-action-primary-active'),
      },
      '&:disabled, &[aria-disabled="true"]': buttonDisabled,
    },
  },
  baseUiToggle: {
    declarations: { ...buttonBase, position: 'relative' },
    pseudos: {
      '&[data-nave-size="sm"]': buttonSmall,
      '&[aria-pressed="true"]::after': {
        content: '""',
        position: 'absolute',
        'inset-inline': V('spacing-control-md'),
        'inset-block-end': V('border-width-sm'),
        'border-block-end': `${V('border-width-lg')} solid currentColor`,
      },
      '&:disabled, &[aria-disabled="true"]': buttonDisabled,
    },
  },
  baseUiToggleGroup: {
    declarations: { display: 'flex', gap: V('spacing-control-xs') },
    pseudos: { '&[data-orientation="vertical"]': { 'flex-direction': 'column' } },
  },
  baseUiInput: {
    declarations: inputBase,
    pseudos: {
      '&::placeholder': placeholder,
      '&[aria-invalid="true"]': invalidInput,
      '&:disabled, &[aria-disabled="true"]': disabledControl,
    },
  },
  baseUiSelectTrigger: {
    declarations: {
      ...inputBase,
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      gap: V('spacing-control-sm'),
      'text-align': 'start',
      cursor: 'pointer',
    },
    pseudos: {
      '&[aria-invalid="true"]': invalidInput,
      '&:disabled, &[aria-disabled="true"]': disabledControl,
    },
  },
  baseUiSelectValue: {
    declarations: {},
    pseudos: { '&[data-placeholder]': { color: V('color-content-tertiary') } },
  },
  baseUiSelectIcon: { declarations: { display: 'inline-flex', flex: 'none' } },
}
