/**
Toolbar, and the Slider.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import { borderSm, V } from './shared.ts'

const sliderBar = (thickness: string): string =>
  `calc(${V('border-width-lg')} / 2) solid ${thickness}`

const focusRingInset = 'calc(-1 * (var(--nave-border-width-focus, 2px) + 2px))'

export const toolbarSliderAtoms: Record<string, AtomDefinition> = {
  baseUiToolbar: {
    declarations: {
      display: 'flex',
      'align-items': 'center',
      gap: V('spacing-control-xs'),
      padding: V('spacing-control-xs'),
      border: borderSm,
      'border-radius': V('radius-control'),
    },
    pseudos: {
      '&[aria-orientation="vertical"]': { 'flex-direction': 'column', 'align-items': 'stretch' },
    },
  },
  baseUiToolbarGroup: {
    declarations: { display: 'flex', gap: V('spacing-control-xs') },
    pseudos: { '&[data-orientation="vertical"]': { 'flex-direction': 'column' } },
  },
  baseUiToolbarSeparator: {
    declarations: { flex: 'none', 'align-self': 'stretch' },
    pseudos: {
      '&[aria-orientation="vertical"]': {
        'inline-size': '0',
        'border-inline-start': borderSm,
        'margin-inline': V('spacing-control-xs'),
      },
      '&[aria-orientation="horizontal"]': {
        'block-size': '0',
        'border-block-start': borderSm,
        'margin-block': V('spacing-control-xs'),
      },
    },
  },
  baseUiToolbarLink: {
    declarations: {
      display: 'inline-flex',
      'align-items': 'center',
      'padding-inline': V('spacing-control-sm'),
      color: V('color-content-link'),
      'font-size': V('font-size-sm'),
    },
  },
  baseUiSliderControl: {
    declarations: {
      display: 'flex',
      'align-items': 'center',
      'block-size': V('size-control-sm'),
      'touch-action': 'none',
    },
    pseudos: {
      '&[data-orientation="vertical"]': {
        'flex-direction': 'column',
        'inline-size': V('size-control-sm'),
        'block-size': 'auto',
      },
    },
  },
  baseUiSliderTrack: {
    declarations: {
      flex: '1',
      'block-size': '0',
      'border-block': sliderBar(V('color-border-control')),
    },
    pseudos: {
      '&[data-orientation="vertical"]': {
        flex: '1',
        'inline-size': '0',
        'block-size': 'auto',
        'border-block': 'none',
        'border-inline': sliderBar(V('color-border-control')),
      },
    },
  },
  baseUiSliderThumb: {
    declarations: {
      'inline-size': V('size-icon-md'),
      'block-size': V('size-icon-md'),
      'border-radius': V('radius-full'),
      color: V('color-content-primary'),
    },
    pseudos: {
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: '0',
        'box-sizing': 'border-box',
        border: `calc(${V('size-icon-md')} / 2) solid currentColor`,
        'border-radius': V('radius-full'),
      },
      '&:has(:focus-visible)': {
        'outline-style': 'solid',
        'outline-width': 'var(--nave-border-width-focus, 2px)',
        'outline-color': 'var(--nave-color-border-focus, currentColor)',
        'outline-offset': '2px',
      },
      '&:has(:focus-visible)::before': {
        content: '""',
        position: 'absolute',
        'inset-inline': focusRingInset,
        'inset-block-start': `calc(50% - ${V('border-width-lg')} / 2)`,
        'block-size': V('border-width-lg'),
        'background-color': V('color-surface-base'),
      },
      '&[data-orientation="vertical"]:has(:focus-visible)::before': {
        'inset-inline': 'auto',
        'inset-inline-start': `calc(50% - ${V('border-width-lg')} / 2)`,
        'inline-size': V('border-width-lg'),
        'inset-block': focusRingInset,
        'block-size': 'auto',
      },
      '&[data-disabled]': { color: V('color-content-disabled'), cursor: 'not-allowed' },
    },
  },
  baseUiSliderValue: {
    declarations: {
      'font-size': V('font-size-sm'),
      'font-variant-numeric': 'tabular-nums',
      color: V('color-content-secondary'),
    },
  },
}
