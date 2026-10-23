/**
 * AC-native-apply-order-25: the PostCSS host and the text expander give the same warnings for the
 * same stylesheet, in count, order, position and text. The inputs are drawn from the criteria that
 * read warnings: the 22 pairs, the same element, the legacy names, the focus clauses, the repeated
 * atom and the longhand over a shorthand block.
 */
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { warningsViaPostcss, warningsViaText } from '../helpers/native-order.ts'

const EXTEND: Record<string, AtomDefinition> = {
  ringX: { declarations: {}, pseudos: { ':focus-visible': { outline: '2px solid blue' } } },
  mBc: {
    declarations: {},
    media: { '(width >= 75em)': { declarations: { 'border-color': 'blue' } } },
  },
  gutter: {
    declarations: { margin: '8px' },
    media: { '(width < 37.5em)': { declarations: { margin: '0' } } },
  },
  hx: {
    declarations: { 'font-size': '16px' },
    media: { '(width >= 48em)': { declarations: { 'font-size': '30px' } } },
  },
  cx: {
    declarations: {},
    media: { '(width >= 75em)': { declarations: { '--gap': '1px', display: 'none' } } },
  },
  gapM: { declarations: {}, media: { '(width >= 75em)': { declarations: { gap: '1rem' } } } },
  wrapM: {
    declarations: {},
    media: { '(width >= 75em)': { declarations: { 'overflow-wrap': 'anywhere' } } },
  },
}

const HIDERS = ['hidePhoneOnly', 'hideTabletPortraitUp', 'hideTabletLandscapeUp', 'hideDesktopUp']
const DISPLAYS = ['flex', 'inlineFlex', 'grid', 'block', 'inlineBlock']

const PAIRS = HIDERS.flatMap((hider) =>
  DISPLAYS.flatMap((display) => [
    `.x { @nave ${hider} ${display}; }`,
    `.x { @nave ${hider}; @nave ${display}; }`,
  ]),
)

const WRITTEN = [
  '.x { @nave hideDesktopUp; display: grid; }',
  '.x { @nave hideDesktopUp; display: flex /* why */; }',
  '.x { @nave hideDesktopUp; display:   flex   /* a */ /* b */  ; }',
  '.x { @nave hideDesktopUp; display: /* a */ flex; }',
  '.x { @nave cx; --gap: 2px }',
  '.x { @nave cx; --gap:   2px   /* c */  ; }',
  '.c { @nave hx; font-size: 20px }',
  '.f { @nave gutter; margin-top: 4px }',
  '.f { @nave gutter; margin: 4px }',
  '.f { @nave gutter; margin: 4px /* c */ 8px }',
  '.c { @nave mBc; border: 0; }',
  '.c { @nave mBc; border-top: 0; }',
  '.card { @nave wFullPhoneOnly; inline-size: 50%; }',
  '.c { @nave ringX; &:focus-visible { outline-color: red } }',
  '.x { @nave hideDesktopUp; &.k { display: grid } }',
  '.x { @nave hideDesktopUp; @media (orientation: landscape) { display: grid } }',
  '.x { @nave hideDesktopUp; @media (orientation: landscape) { display:\n  grid } }',
]

const FOCUS = [
  '.x { @nave focusRing; &:focus { outline: none } }',
  '.x { @nave focusRing; &:focus-visible { outline: 0 solid red } }',
  '.x { @nave focusRing; &:focus-visible { outline-color: red } }',
  '.x { @nave focusRing; &:focus { all: unset } }',
  '.x { @nave srOnlyFocusable; &:focus-visible { clip-path: inset(50%) } }',
  '.x { @nave srOnlyFocusable; &:focus-visible { width: 1px; height: 1px; overflow: hidden } }',
]

const LEGACY = [
  '.x { @nave gapM; grid-gap: 2rem; }',
  '.x { @nave gapM; grid-row-gap: 2rem; }',
  '.x { @nave wrapM; word-wrap: normal; }',
  '.x { @nave wrapM; WORD-WRAP: normal; }',
]

const REPEATED = [
  '.c { @nave hideDesktopUp hideDesktopUp flex; }',
  '.c { @nave hideDesktopUp flex hideDesktopUp; }',
  '.c { @nave hideDesktopUp flex hideDesktopUp flex; }',
  '.c { @nave hideDesktopUp textLeft hideDesktopUp flex; }',
]

const NESTED_DIRECTIVES = [
  '.x { @nave hideDesktopUp; @media (width >= 75em) { & { @nave flex } } }',
  '.x { @nave hideDesktopUp; & { @nave flex } }',
  '.x { @nave hideDesktopUp; &:where(.q) { @nave flex } }',
  '.x { @nave hideDesktopUp; &:where(.q) { @nave flex } @nave textLeft; }',
  '.x { @nave /* nave-allow-override: display */ hideDesktopUp; &:where(.q) { @nave flex } @nave textLeft; }',
  '.x { & { @nave hideDesktopUp } display: flex }',
]

describe.each([
  ['the 22 pairs and their kin', PAIRS],
  ['declarations the rule writes', WRITTEN],
  ['focus atoms', FOCUS],
  ['legacy names', LEGACY],
  ['a repeated atom', REPEATED],
  ['a directive inside a nested rule', NESTED_DIRECTIVES],
])('AC-native-apply-order-25 — the hosts agree on %s', (_name, inputs) => {
  it.each(inputs)('%s', async (css) => {
    const viaPostcss = await warningsViaPostcss(css, { extend: EXTEND })
    const viaText = warningsViaText(css, { extend: EXTEND })

    expect(viaPostcss).toEqual(viaText)
  })
})
