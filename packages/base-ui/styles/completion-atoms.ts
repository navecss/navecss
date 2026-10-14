/**
The overlay completion atoms: the highlight fill and the active-option band, the scrim, the popup,
tooltip and tab-indicator motion, and the arrow's logical sides.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import { motionOff, reducedMotion, V } from './shared.ts'

export const completionAtoms: Record<string, AtomDefinition> = {
  baseUiItemHighlight: {
    declarations: {
      'border-radius': V('radius-sm'),
    },
    pseudos: {
      '[data-highlighted]:not([aria-disabled="true"])': {
        'background-color': V('color-action-highlight'),
      },
    },
  },
  baseUiActiveOption: {
    declarations: {
      position: 'relative',
    },
    pseudos: {
      '[data-highlighted]::before': {
        content: '""',
        position: 'absolute',
        inset: 'calc(-1 * (var(--nave-border-width-focus, 2px) + 2px))',
        'border-style': 'solid',
        'border-width': 'var(--nave-border-width-focus, 2px)',
        'border-color': 'var(--nave-color-border-focus, currentColor)',
        'border-radius': `calc(${V('radius-sm')} + var(--nave-border-width-focus, 2px) + 2px)`,
        'pointer-events': 'none',
      },
    },
  },
  baseUiBackdrop: {
    declarations: {
      position: 'fixed',
      inset: '0',
      'background-color': V('color-backdrop-modal'),
      'transition-property': 'opacity',
      'transition-duration': V('motion-duration-fast'),
      'transition-timing-function': V('motion-easing-decelerate'),
    },
    pseudos: {
      '[data-starting-style], [data-ending-style]': {
        opacity: '0',
      },
      '[data-ending-style]': {
        'transition-timing-function': V('motion-easing-accelerate'),
      },
    },
    media: { [reducedMotion]: { pseudos: { '&, &[data-instant]': motionOff } } },
  },
  baseUiPopupMotion: {
    declarations: {
      'transition-property': 'opacity',
      'transition-duration': V('motion-duration-fast'),
      'transition-timing-function': V('motion-easing-decelerate'),
    },
    pseudos: {
      '[data-starting-style], [data-ending-style]': {
        opacity: '0',
      },
      '[data-ending-style]': {
        'transition-timing-function': V('motion-easing-accelerate'),
      },
      '[data-instant]': {
        'transition-duration': V('motion-duration-instant'),
      },
    },
    media: { [reducedMotion]: { pseudos: { '&, &[data-instant]': motionOff } } },
  },
  baseUiPopupFade: {
    declarations: {
      'transition-property': 'opacity',
      'transition-duration': V('motion-duration-fast'),
      'transition-timing-function': V('motion-easing-decelerate'),
    },
    pseudos: {
      '[data-starting-style], [data-ending-style]': {
        opacity: '0',
      },
      '[data-ending-style]': {
        'transition-timing-function': V('motion-easing-accelerate'),
      },
    },
    media: { [reducedMotion]: { pseudos: { '&, &[data-instant]': motionOff } } },
  },
  baseUiTooltipMotion: {
    declarations: {
      'transition-property': 'opacity',
      'transition-duration': V('motion-duration-fast'),
      'transition-timing-function': V('motion-easing-decelerate'),
    },
    pseudos: {
      '[data-starting-style], [data-ending-style]': {
        opacity: '0',
      },
      '[data-ending-style]': {
        'transition-timing-function': V('motion-easing-accelerate'),
      },
      '[data-instant]': {
        'transition-duration': V('motion-duration-instant'),
      },
    },
    media: { [reducedMotion]: { pseudos: { '&, &[data-instant]': motionOff } } },
  },
  baseUiTabIndicatorMotion: {
    declarations: {
      'transition-property': 'left, top, width, height',
      'transition-duration': V('motion-duration-base'),
      'transition-timing-function': V('motion-easing-standard'),
    },
    media: { [reducedMotion]: { pseudos: { '&, &[data-instant]': motionOff } } },
  },
  baseUiArrowInline: {
    declarations: {},
    pseudos: {
      '[data-side="inline-start"], [data-side="inline-end"]': {
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
      '[data-side="inline-start"]': {
        'inset-inline-end': '-4px',
        rotate: '-45deg',
      },
      '[data-side="inline-end"]': {
        'inset-inline-start': '-4px',
        rotate: '135deg',
      },
      '[data-side="inline-start"]:dir(rtl)': {
        rotate: '135deg',
      },
      '[data-side="inline-end"]:dir(rtl)': {
        rotate: '-45deg',
      },
    },
  },
}
