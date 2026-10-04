/**
Field, Fieldset, the choice controls and the number field.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import type { Declarations } from './shared.ts'

import {
  borderControl,
  disabledControl,
  invalidBoundary,
  motionOff,
  placeholder,
  reducedMotion,
  V,
} from './shared.ts'

const choiceBase = (radius: string): Declarations => ({
  'box-sizing': 'border-box',
  display: 'inline-flex',
  'align-items': 'center',
  'justify-content': 'center',
  flex: 'none',
  'inline-size': V('size-icon-sm'),
  'block-size': V('size-icon-sm'),
  border: borderControl,
  'border-radius': radius,
  'background-color': 'transparent',
  color: V('color-content-primary'),
  cursor: 'pointer',
  position: 'relative',
})

/**
The target-size box of a Checkbox or Radio: `size.control.xs` square, centred on the root.
 */
const choiceHitArea: Declarations = {
  content: '""',
  position: 'absolute',
  'inset-block-start': '50%',
  'inset-inline-start': '50%',
  'inline-size': V('size-control-xs'),
  'block-size': V('size-control-xs'),
  'margin-block-start': `calc(${V('size-control-xs')} / -2)`,
  'margin-inline-start': `calc(${V('size-control-xs')} / -2)`,
}

const switchWidth = `calc(2 * ${V('size-icon-md')})`

export const fieldAtoms: Record<string, AtomDefinition> = {
  baseUiField: {
    declarations: {
      display: 'flex',
      'flex-direction': 'column',
      gap: V('spacing-control-xs'),
    },
  },
  baseUiLabel: {
    declarations: {
      'font-size': V('font-size-sm'),
      'font-weight': V('font-weight-medium'),
      color: V('color-content-primary'),
    },
  },
  baseUiFieldDescription: {
    declarations: {
      margin: '0',
      'font-size': V('font-size-sm'),
      color: V('color-content-secondary'),
    },
  },
  baseUiFieldError: {
    declarations: {
      'font-size': V('font-size-sm'),
      color: V('color-feedback-danger-foreground'),
    },
  },
  baseUiFieldset: {
    declarations: {
      margin: '0',
      padding: '0',
      border: '0',
      'min-inline-size': '0',
      display: 'flex',
      'flex-direction': 'column',
      gap: V('spacing-content-sm'),
    },
  },
  baseUiLegend: {
    declarations: {
      padding: '0',
      'font-size': V('font-size-md'),
      'font-weight': V('font-weight-semibold'),
      color: V('color-content-primary'),
    },
  },
  baseUiCheckbox: {
    declarations: choiceBase(V('radius-sm')),
    pseudos: {
      '&[aria-invalid="true"]': invalidBoundary,
      '&[aria-disabled="true"]': disabledControl,
      '&::before': choiceHitArea,
    },
  },
  baseUiCheckboxIndicator: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'block',
      'inline-size': '0.3125rem',
      'block-size': '0.5625rem',
      'margin-block-start': '-0.125rem',
      'border-right': `${V('border-width-mark')} solid currentColor`,
      'border-bottom': `${V('border-width-mark')} solid currentColor`,
      rotate: '45deg',
    },
    pseudos: {
      '[aria-checked="mixed"] > &': {
        'inline-size': '0.5rem',
        'block-size': '0',
        'margin-block-start': '0',
        'border-right-style': 'none',
        rotate: '0deg',
      },
    },
  },
  baseUiRadio: {
    declarations: choiceBase(V('radius-full')),
    pseudos: {
      '&[aria-invalid="true"]': invalidBoundary,
      '&[aria-disabled="true"]': disabledControl,
      '&::before': choiceHitArea,
    },
  },
  baseUiRadioIndicator: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'block',
      'inline-size': '0',
      'block-size': '0',
      border: `${V('border-width-lg')} solid currentColor`,
      'border-radius': V('radius-full'),
    },
  },
  baseUiChoiceGroup: {
    declarations: {
      display: 'flex',
      'flex-direction': 'column',
      gap: V('spacing-control-sm'),
    },
  },
  baseUiSwitch: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'inline-flex',
      'align-items': 'center',
      flex: 'none',
      'inline-size': switchWidth,
      'block-size': V('size-icon-md'),
      padding: V('border-width-sm'),
      border: borderControl,
      'border-radius': V('radius-full'),
      'background-color': 'transparent',
      color: V('color-content-primary'),
      cursor: 'pointer',
      position: 'relative',
    },
    pseudos: {
      '&[aria-invalid="true"]': {
        ...invalidBoundary,
        padding: `calc(2 * ${V('border-width-sm')} - ${V('border-width-mark')})`,
      },
      '&[aria-disabled="true"]': disabledControl,
      '&::before': {
        content: '""',
        position: 'absolute',
        'inset-block-start': '50%',
        'inset-inline-start': '50%',
        'inline-size': switchWidth,
        'block-size': V('size-control-xs'),
        'margin-block-start': `calc(${V('size-control-xs')} / -2)`,
        'margin-inline-start': `calc(-1 * ${V('size-icon-md')})`,
      },
    },
  },
  baseUiSwitchThumb: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'block',
      'inline-size': V('size-icon-sm'),
      'block-size': V('size-icon-sm'),
      'margin-inline-start': '0',
      border: `${V('border-width-sm')} solid currentColor`,
      'border-radius': V('radius-full'),
      'transition-property': 'margin-inline-start, border-width',
      'transition-duration': V('motion-duration-fast'),
      'transition-timing-function': V('motion-easing-standard'),
    },
    pseudos: {
      '[aria-checked="true"] > &': {
        'margin-inline-start': `calc(2 * ${V('size-icon-md')} - 4 * ${V('border-width-sm')} - ${V('size-icon-sm')})`,
        'border-width': `calc(${V('size-icon-sm')} / 2)`,
      },
    },
    media: { [reducedMotion]: { pseudos: { '&': motionOff } } },
  },
  // The invalid border grows from the small width to the mark width. The resting padding of
  // (mark - small) goes to 0 when invalid, so the border and the padding always add up to the same
  // size and nothing inside the group moves. The Switch trades its padding the same way.
  baseUiNumberFieldGroup: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'flex',
      'align-items': 'stretch',
      'min-block-size': V('size-control-md'),
      border: borderControl,
      'border-radius': V('radius-control'),
      padding: `calc(${V('border-width-mark')} - ${V('border-width-sm')})`,
      'background-color': 'transparent',
      color: V('color-content-primary'),
    },
    pseudos: {
      '&:has(> [aria-invalid="true"])': { ...invalidBoundary, padding: '0' },
      '&[data-disabled]': {
        'border-color': V('color-border-disabled'),
        color: V('color-content-disabled'),
      },
    },
  },
  baseUiNumberFieldInput: {
    declarations: {
      flex: '1',
      'min-inline-size': '0',
      'padding-block': '0',
      'padding-inline': V('spacing-control-md'),
      border: '0',
      'background-color': 'transparent',
      color: 'inherit',
      'font-family': 'inherit',
      'font-size': V('font-size-sm'),
    },
    pseudos: { '&::placeholder': placeholder },
  },
  baseUiNumberFieldStepper: {
    declarations: {
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
      '&:disabled, &[aria-disabled="true"]': {
        color: V('color-content-disabled'),
        cursor: 'not-allowed',
      },
    },
  },
  baseUiNumberFieldScrubArea: { declarations: { cursor: 'ew-resize' } },
}
