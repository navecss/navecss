/**
Disclosure (Accordion, Collapsible) and Tabs.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import { borderSm, motionOff, reducedMotion, V } from './shared.ts'

const tabBar = `${V('border-width-lg')} solid ${V('color-content-primary')}`

const disclosurePanel = (heightVariable: string): AtomDefinition => ({
  declarations: {
    'box-sizing': 'border-box',
    overflow: 'hidden',
    'padding-inline': V('spacing-control-xs'),
    height: `var(${heightVariable})`,
    'transition-property': 'height',
    'transition-duration': V('motion-duration-base'),
    'transition-timing-function': V('motion-easing-standard'),
  },
  pseudos: {
    '&[data-starting-style], &[data-ending-style]': { height: '0' },
    '& > :first-child': { 'margin-block-start': V('spacing-control-xs') },
    '& > :last-child': { 'margin-block-end': V('spacing-content-md') },
  },
  media: { [reducedMotion]: { pseudos: { '&': motionOff } } },
})

export const disclosureAtoms: Record<string, AtomDefinition> = {
  baseUiDisclosureTrigger: {
    declarations: {
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      'inline-size': '100%',
      padding: `${V('spacing-control-md')} ${V('spacing-control-xs')}`,
      border: '0',
      'background-color': 'transparent',
      color: V('color-content-primary'),
      'font-family': 'inherit',
      'font-size': V('font-size-md'),
      'font-weight': V('font-weight-medium'),
      'text-align': 'start',
      cursor: 'pointer',
    },
    pseudos: {
      '[aria-disabled="true"]': { color: V('color-content-disabled'), cursor: 'not-allowed' },
    },
  },
  baseUiDisclosureIcon: {
    declarations: {},
    pseudos: {
      '& > svg:last-child': {
        flex: 'none',
        'transition-property': 'rotate',
        'transition-duration': V('motion-duration-fast'),
        'transition-timing-function': V('motion-easing-standard'),
      },
      '&[aria-expanded="true"] > svg:last-child': { rotate: '180deg' },
    },
    media: { [reducedMotion]: { pseudos: { '& > svg:last-child': motionOff } } },
  },
  baseUiAccordionHeader: { declarations: { margin: '0' } },
  baseUiAccordionItem: { declarations: { 'border-block-end': borderSm } },
  baseUiAccordionPanel: disclosurePanel('--accordion-panel-height'),
  baseUiCollapsiblePanel: disclosurePanel('--collapsible-panel-height'),
  baseUiTabList: {
    declarations: {
      position: 'relative',
      display: 'flex',
      gap: V('spacing-control-sm'),
      'border-block-end': borderSm,
    },
    pseudos: {
      '[aria-orientation="vertical"]': {
        'flex-direction': 'column',
        'border-block-end-style': 'none',
        'border-inline-end': borderSm,
      },
    },
  },
  baseUiTab: {
    declarations: {
      display: 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      padding: V('spacing-control-md'),
      border: '0',
      'background-color': 'transparent',
      color: V('color-content-primary'),
      'font-family': 'inherit',
      'font-size': V('font-size-sm'),
      'font-weight': V('font-weight-medium'),
      'white-space': 'nowrap',
      cursor: 'pointer',
    },
    pseudos: {
      '[aria-disabled="true"]': { color: V('color-content-disabled'), cursor: 'not-allowed' },
    },
  },
  baseUiTabIndicator: {
    declarations: {
      position: 'absolute',
      'box-sizing': 'content-box',
      left: 'var(--active-tab-left)',
      top: `calc(var(--active-tab-top) + var(--active-tab-height) - ${V('border-width-lg')})`,
      width: 'var(--active-tab-width)',
      height: '0',
      'border-bottom': tabBar,
    },
    pseudos: {
      '[data-orientation="vertical"]': {
        top: 'var(--active-tab-top)',
        left: `calc(var(--active-tab-left) + var(--active-tab-width) - ${V('border-width-lg')})`,
        width: '0',
        height: 'var(--active-tab-height)',
        'border-bottom-style': 'none',
        'border-right': tabBar,
      },
      '[data-orientation="vertical"]:dir(rtl)': {
        left: 'var(--active-tab-left)',
        'border-right-style': 'none',
        'border-left': tabBar,
      },
    },
  },
}
