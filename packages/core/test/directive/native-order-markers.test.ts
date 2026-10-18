/**
 * The opt-out marker: where it is read, which longhands it covers and for which overriders, and
 * what is reported when it is stale, empty, names no property or is not a marker at all.
 */
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import {
  viaPostcss,
  viaText,
  warningsViaPostcss,
  warningsViaText,
} from '../helpers/native-order.ts'

const EXTEND: Record<string, AtomDefinition> = {
  ringX: { declarations: {}, pseudos: { ':focus-visible': { outline: '2px solid blue' } } },
}

const HOSTS = [
  ['the PostCSS host', warningsViaPostcss, viaPostcss],
  [
    'the text expander',
    (css: string, o?: object) => Promise.resolve(warningsViaText(css, o)),
    (css: string, o?: object) => Promise.resolve(viaText(css, o)),
  ],
] as const

const STALE = (name: string): string =>
  `@nave: the marker on this directive names ${name}, but nothing after the directive overrides ${name} in its atoms' blocks. Remove ${name} from the marker.`

describe.each(HOSTS)(
  'AC-native-apply-order-29 — a marker covers longhands (%s)',
  (_name, warn, expand) => {
    it.each([
      ['.c { @nave /* nave-allow-override: display */ hideDesktopUp; display: grid; }', 0, 0],
      ['.c { @nave hideDesktopUp /* nave-allow-override: display */ flex; }', 0, 0],
      ['.c { @nave hideDesktopUp /* nave-allow-override: display */; display: grid; }', 0, 0],
      [
        '.c { @nave /* nave-allow-override: display -- a grid on wide screens */ hideDesktopUp; display: grid; }',
        0,
        0,
      ],
      [
        '.c { @nave /* nave-allow-override: display */ hideDesktopUp; @nave flex; display: block; @media (x) { display: grid } }',
        0,
        0,
      ],
      [
        '.c { @nave /* nave-allow-override: outline */ focusRing; &:focus { outline-style: none } }',
        0,
        0,
      ],
      [
        '.c { @nave /* nave-allow-override: display */ /* nave-allow-override: width */ hideDesktopUp wFullPhoneOnly; display: grid; width: 1px; }',
        0,
        0,
      ],
      [
        '.c { @nave /* nave-allow-override: outline-color */ focusRing; &:focus-visible { outline-color: red } &:focus { outline: none } }',
        1,
        0,
      ],
      [
        '.c { @nave /* nave-allow-override: outline-color */ ringX; &:focus-visible { outline-color: red } &:focus { outline: none } }',
        1,
        0,
      ],
      [
        '.c { @nave /* nave-allow-override: inline-size */ wFullPhoneOnly; inline-size: 50%; }',
        1,
        1,
      ],
      ['.c { @nave /* nave-allow-override: width */ wFullPhoneOnly; inline-size: 50%; }', 0, 0],
      [
        '.c { @nave /* nave-allow-override: display -- width matters */ hideDesktopUp wFullPhoneOnly; width: 1px; }',
        1,
        1,
      ],
    ])('%s reports %i warnings and %i marker reports', async (css, warnings, reports) => {
      const found = await warn(css, { extend: EXTEND })
      const markerReports = found.filter(
        (w) =>
          (/marker|comment/.test(w.text.slice(0, w.text.indexOf('. '))) &&
            w.text.includes('allows nothing')) ||
          w.text.includes('Remove'),
      )

      expect(found.length - markerReports.length).toBe(warnings)
      expect(markerReports).toHaveLength(reports)
    })

    it('never ships the marker, and the marker changes no byte of the output', async () => {
      const marked = await expand(
        '.c { @nave /* nave-allow-override: display */ hideDesktopUp flex; }',
      )
      const plain = await expand('.c { @nave hideDesktopUp flex; }')

      expect(marked).not.toContain('nave-allow-override')
      expect(postcss.parse(marked).toString().replaceAll(/\s+/g, ' ')).toBe(
        postcss.parse(plain).toString().replaceAll(/\s+/g, ' '),
      )
    })

    it('silences no pseudo-element report', async () => {
      const found = await warn(
        '.p::before { @nave /* nave-allow-override: display */ hideDesktopUp; }',
      )

      expect(found.map((w) => w.text.slice(0, 40))).toEqual([
        '@nave: every selector in this rule ends ',
        '@nave: the marker on this directive name',
      ])
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-30 — a marker reaches nothing else (%s)',
  (_name, warn) => {
    it.each([
      [
        '.c { @nave /* nave-allow-override: display */ flex; @nave hideDesktopUp; display: grid; }',
        1,
        1,
      ],
      ['.c { @nave hideDesktopUp; @nave /* nave-allow-override: display */ flex; }', 1, 1],
      ['.c { /* nave-allow-override: display */ @nave hideDesktopUp; display: grid; }', 1, 0],
      ['.c { @nave hideDesktopUp; display: grid; /* nave-allow-override: display */ }', 1, 0],
      ['.c { @nave hideDesktopUp; /*! nave-allow-override: display */ display: grid; }', 1, 0],
      ['.c { @nave /* allow-override: display */ hideDesktopUp; display: grid; }', 1, 0],
    ])('%s reports %i order and %i marker', async (css, order, markers) => {
      const found = await warn(css)
      const stale = found.filter((w) =>
        w.text.includes('but nothing after the directive overrides'),
      )

      expect(found.length - stale.length).toBe(order)
      expect(stale).toHaveLength(markers)
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-31 — what is wrong with a marker (%s)',
  (_name, warn) => {
    it.each([
      ['.c { @nave /* nave-allow-override: display */ hideDesktopUp; }', [STALE('display')]],
      [
        '.c { @nave /* nave-allow-override: display width */ hideDesktopUp; display: grid; }',
        [STALE('width')],
      ],
      [
        '.c { @nave /* nave-allow-override: flex */ hideDesktopUp; display: grid; }',
        [STALE('flex')],
      ],
      [
        '.c { @nave /* nave-allow-override: */ hideDesktopUp; display: grid; }',
        [
          '@nave: the nave-allow-override marker on this directive names no property, so it allows nothing. Name the property a warning reported, or remove the marker.',
        ],
      ],
      [
        '.c { @nave /* nave-allow-override: -- because */ hideDesktopUp; }',
        [
          '@nave: the nave-allow-override marker on this directive names no property, so it allows nothing. Name the property a warning reported, or remove the marker.',
        ],
      ],
      [
        '.c { @nave /* nave-allow-override: dispaly */ hideDesktopUp; display: grid; }',
        [
          '@nave: the marker on this directive names "dispaly", which is not a CSS property, so it allows nothing. The marker takes property names, such as display, not atom names.',
        ],
      ],
      [
        '.c { @nave /* nave-allow-override: hideDesktopUp */ hideDesktopUp; display: grid; }',
        [
          '@nave: the marker on this directive names "hideDesktopUp", which is not a CSS property, so it allows nothing. The marker takes property names, such as display, not atom names.',
        ],
      ],
    ])('%s reports exactly the marker text', async (css, expected) => {
      const found = await warn(css)
      const reports = found.filter((w) => expected.includes(w.text))

      expect(reports.map((w) => w.text)).toEqual(expected)
    })

    it.each([
      [
        '.c { @nave /* nave-allow-override display */ hideDesktopUp; display: grid; }',
        '/* nave-allow-override display */',
      ],
      [
        '.c { @nave /* nave-allow-overrides: display */ hideDesktopUp; display: grid; }',
        '/* nave-allow-overrides: display */',
      ],
      [
        '.c { @nave /* nave-allow-override : display */ hideDesktopUp; display: grid; }',
        '/* nave-allow-override : display */',
      ],
    ])('%s is not a marker and is not read', async (css, comment) => {
      const found = await warn(css)

      expect(
        found.some((w) =>
          w.text.includes(`the comment ${comment} in this directive is not a marker`),
        ),
      ).toBe(true)
      expect(found.some((w) => w.text.includes('comes after'))).toBe(true)
    })

    it('positions each report at the marker comment', async () => {
      const css = '.c { @nave /* nave-allow-override: display width */ hideDesktopUp; }'
      const found = await warn(css)

      expect(found).toHaveLength(2)
      expect(found.map((w) => w.column)).toEqual([12, 12])
      expect(found.map((w) => w.text)).toEqual([STALE('display'), STALE('width')])
    })

    it('does not call a shorthand stale when only some of its longhands are overridden', async () => {
      expect(
        await warn(
          '.c { @nave /* nave-allow-override: outline */ focusRing; &:focus-visible { outline-color: red } }',
        ),
      ).toEqual([])
    })

    it('computes staleness before any marker applies', async () => {
      expect(
        await warn(
          '.c { @nave /* nave-allow-override: display */ /* nave-allow-override: display */ hideDesktopUp; display: grid; }',
        ),
      ).toEqual([])
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-51 — all covers only an overrider that sets all (%s)',
  (_name, warn) => {
    it.each([
      ['.c { @nave /* nave-allow-override: all */ hideDesktopUp; all: unset; }', 0, 0],
      ['.c { @nave hideDesktopUp; all: unset; }', 1, 0],
      ['.c { @nave /* nave-allow-override: all */ hideDesktopUp; display: grid; }', 1, 1],
      ['.c { @nave /* nave-allow-override: all */ focusRing; &:focus { outline: none } }', 1, 1],
      ['.c { @nave /* nave-allow-override: display */ hideDesktopUp; all: unset; }', 0, 0],
      ['.c { @nave focusRing; &:focus { all: unset } }', 1, 0],
    ])('%s reports %i warnings and %i marker reports', async (css, order, markers) => {
      const found = await warn(css)
      const stale = found.filter((w) =>
        w.text.includes('but nothing after the directive overrides'),
      )

      expect(found.length - stale.length).toBe(order)
      expect(stale).toHaveLength(markers)
    })

    it('never prints a marker naming all, and names outline and outline-offset for all: unset', async () => {
      const [warning] = await warn('.c { @nave focusRing; &:focus { all: unset } }')
      const marker = /`(@nave [^`]*)`\s*$/.exec(warning!.text)![1]!

      expect(marker).toContain('nave-allow-override: outline outline-offset */')
      expect(marker).not.toMatch(/\ball\b/)
    })
  },
)
