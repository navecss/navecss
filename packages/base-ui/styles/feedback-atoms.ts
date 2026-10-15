/**
The feedback and navigation atoms: Toast, Navigation Menu, Scroll Area, Meter and Progress (one value
bar), and Avatar. Separator reuses the Toolbar's separator atom.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import { borderControl, borderSm, motionOff, reducedMotion, V } from './shared.ts'

/**
 * The room a scrollbar's strip takes beside the content, and the ring's band beyond it: the
 * viewport clears both where a scrollbar sits.
 */
const scrollbarGutter = `calc(${V('size-control-xs')} + ${V('spacing-control-xs')})`

/**
 * A centred stroke across the strip: the strip less the stroke, halved. The stroke is drawn as the
 * thumb's two borders, so it survives forced colours.
 */
const stripCentring = `calc((${V('size-control-xs')} - ${V('border-width-lg')}) / 2)`

const halfStroke = `calc(${V('border-width-lg')} / 2) solid ${V('color-border-control')}`

const viewportGutter = (edge: 'block-end' | 'inline-end'): Record<string, string> => ({
  [`padding-${edge}`]: scrollbarGutter,
  [`scroll-padding-${edge}`]: scrollbarGutter,
})

const avatarSize = (size: 'lg' | 'sm', fontSize: string): Record<string, string> => ({
  'inline-size': V(`size-avatar-${size}`),
  'block-size': V(`size-avatar-${size}`),
  'font-size': V(fontSize),
})

const fadeTiming = {
  'transition-property': 'opacity',
  'transition-duration': V('motion-duration-fast'),
  'transition-timing-function': V('motion-easing-decelerate'),
}

const guard = { [reducedMotion]: { pseudos: { '&': motionOff } } }

export const feedbackAtoms: Record<string, AtomDefinition> = {
  baseUiToastViewport: {
    declarations: {
      display: 'flex',
      'flex-direction': 'column',
      gap: V('spacing-content-sm'),
    },
  },
  baseUiToastPlacement: {
    declarations: {
      position: 'fixed',
      'inset-block-end': V('spacing-content-lg'),
      'inset-inline-end': V('spacing-content-lg'),
      'inline-size': '20rem',
      'max-inline-size': `calc(100% - 2 * ${V('spacing-content-lg')})`,
      'z-index': V('layer-toast'),
    },
  },
  baseUiToastRoot: {
    declarations: {
      'box-sizing': 'border-box',
      'background-color': V('color-surface-overlay'),
      color: V('color-content-primary'),
      border: borderSm,
      'border-radius': V('radius-card'),
      'box-shadow': V('shadow-overlay'),
      padding: V('spacing-content-md'),
      'font-size': V('font-size-sm'),
    },
  },
  baseUiToastFade: {
    declarations: fadeTiming,
    pseudos: {
      '[data-starting-style], [data-ending-style]:not([data-swipe-direction])': { opacity: '0' },
      '[data-ending-style]': { 'transition-timing-function': V('motion-easing-accelerate') },
    },
    media: guard,
  },
  baseUiToastLimit: {
    declarations: {},
    pseudos: { '[data-limited]': { display: 'none' } },
  },
  baseUiNavigationMenuList: {
    declarations: {
      display: 'flex',
      'align-items': 'center',
      gap: V('spacing-control-xs'),
      margin: '0',
      padding: '0',
      'list-style': 'none',
    },
  },
  baseUiNavigationMenuTrigger: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      gap: V('spacing-control-sm'),
      'min-block-size': V('size-control-md'),
      'padding-block': '0',
      'padding-inline': V('spacing-control-lg'),
      border: `${V('border-width-sm')} solid transparent`,
      'border-radius': V('radius-control'),
      'background-color': 'transparent',
      color: V('color-content-primary'),
      'font-family': 'inherit',
      'font-size': V('font-size-sm'),
      'font-weight': V('font-weight-medium'),
      'line-height': V('line-height-tight'),
      'white-space': 'nowrap',
      cursor: 'pointer',
      'user-select': 'none',
    },
    pseudos: {
      ':hover:not(:disabled, [aria-disabled="true"]), :active:not(:disabled, [aria-disabled="true"])':
        { 'background-color': V('color-action-highlight') },
    },
  },
  baseUiNavigationMenuIcon: {
    declarations: {
      display: 'inline-flex',
      flex: 'none',
      'transition-property': 'rotate',
      'transition-duration': V('motion-duration-fast'),
      'transition-timing-function': V('motion-easing-standard'),
    },
    pseudos: { '[aria-expanded="true"] > &': { rotate: '180deg' } },
    media: guard,
  },
  baseUiNavigationMenuFade: {
    declarations: fadeTiming,
    pseudos: {
      '[data-starting-style], [data-ending-style]': { opacity: '0' },
      '[data-ending-style]': { 'transition-property': 'none' },
    },
    media: guard,
  },
  baseUiCurrentLink: {
    declarations: { 'padding-block': V('border-width-lg') },
    pseudos: {
      '[aria-current="page"]': {
        'text-decoration-line': 'underline',
        'text-decoration-thickness': V('border-width-lg'),
      },
    },
  },
  baseUiScrollArea: {
    declarations: { display: 'flex', 'flex-direction': 'column' },
  },
  baseUiScrollAreaViewport: {
    declarations: {
      'box-sizing': 'border-box',
      flex: '1',
      'min-block-size': '0',
      padding: V('spacing-control-xs'),
      'scroll-padding': V('spacing-control-xs'),
    },
    pseudos: {
      '[data-has-overflow-y]': viewportGutter('inline-end'),
      '[data-has-overflow-x]': viewportGutter('block-end'),
    },
  },
  baseUiScrollAreaScrollbar: {
    declarations: {
      'box-sizing': 'border-box',
      'background-color': V('color-surface-base'),
    },
    pseudos: {
      '[data-orientation="vertical"]': {
        'inline-size': V('size-control-xs'),
        'padding-inline': stripCentring,
      },
      '[data-orientation="horizontal"]': {
        'block-size': V('size-control-xs'),
        'padding-block': stripCentring,
      },
    },
  },
  baseUiScrollAreaThumb: {
    declarations: { 'box-sizing': 'border-box', 'border-radius': V('radius-full') },
    pseudos: {
      '[data-orientation="vertical"]': { 'border-inline': halfStroke },
      '[data-orientation="horizontal"]': { 'block-size': '100%', 'border-block': halfStroke },
    },
  },
  baseUiScrollAreaCorner: {
    declarations: { 'background-color': V('color-surface-base') },
  },
  baseUiValueBar: {
    declarations: {
      display: 'flex',
      'flex-wrap': 'wrap',
      'align-items': 'center',
      'justify-content': 'space-between',
      gap: V('spacing-control-xs'),
    },
  },
  baseUiValueBarTrack: {
    declarations: {
      'box-sizing': 'border-box',
      flex: '0 0 100%',
      'min-block-size': `calc(${V('border-width-lg')} + 4 * ${V('border-width-sm')})`,
      padding: V('border-width-sm'),
      border: borderControl,
      'border-radius': V('radius-full'),
      display: 'flex',
      'align-items': 'center',
    },
  },
  baseUiValueBarIndicator: {
    declarations: {
      'box-sizing': 'border-box',
      'max-block-size': V('border-width-lg'),
      'border-block': `calc(${V('border-width-lg')} / 2) solid currentColor`,
      'border-radius': V('radius-full'),
      color: V('color-content-primary'),
    },
    pseudos: { '[data-indeterminate]': { display: 'none' } },
  },
  baseUiAvatar: {
    declarations: {
      'box-sizing': 'border-box',
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      flex: 'none',
      'vertical-align': 'middle',
      border: borderSm,
      'border-radius': V('radius-full'),
      'inline-size': V('size-avatar-md'),
      'block-size': V('size-avatar-md'),
      'font-size': V('font-size-sm'),
      'font-weight': V('font-weight-medium'),
      'line-height': V('line-height-none'),
    },
    pseudos: {
      '[data-nave-size="sm"]': avatarSize('sm', 'font-size-xs'),
      '[data-nave-size="lg"]': avatarSize('lg', 'font-size-xl'),
    },
  },
  baseUiAvatarImage: {
    declarations: {
      'inline-size': '100%',
      'block-size': '100%',
      'object-fit': 'cover',
      'border-radius': 'inherit',
    },
  },
  baseUiAvatarFallback: {
    declarations: {
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'inline-size': '100%',
      'block-size': '100%',
      'border-radius': 'inherit',
      'background-color': V('color-surface-sunken'),
      color: V('color-content-primary'),
    },
  },
}
