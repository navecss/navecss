/**
 * The fixes and markers a warning prints work: applying the printed fix reports nothing for the
 * pair, applying the printed marked directive silences exactly that warning, and the marker names
 * the longhands left, as a shorthand only where it holds all of one.
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
}

const HOSTS = [
  ['the PostCSS host', warningsViaPostcss],
  ['the text expander', (css: string, o?: object) => Promise.resolve(warningsViaText(css, o))],
] as const

/**
 * The text of the backtick snippets of a warning, in order.
 */
function snippets(text: string): string[] {
  return Array.from(text.matchAll(/`([^`]+)`/g), (match) => match[1]!)
}

/**
 * `css` with its first directive replaced by `directive`.
 */
function withDirective(css: string, directive: string): string {
  return css.replace(/@nave [^;]*;/, () => directive)
}

describe.each(HOSTS)('AC-native-apply-order-26 — fixes and markers (%s)', (_name, run) => {
  it.each([
    ['.c { @nave hideDesktopUp flex; }', '.c { @nave flex hideDesktopUp; }', 'display'],
    [
      '.c { @nave hideDesktopUp flex textLeft; }',
      '.c { @nave flex hideDesktopUp textLeft; }',
      'display',
    ],
    ['.c { @nave hideDesktopUp flex grid; }', '.c { @nave flex grid hideDesktopUp; }', 'display'],
    ['.c { @nave hideDesktopUp; @nave flex; }', '.c { @nave flex hideDesktopUp; }', 'display'],
    [
      '.c { @nave hideDesktopUp hideDesktopUp flex; }',
      '.c { @nave flex hideDesktopUp hideDesktopUp; }',
      'display',
    ],
    [
      '.c { @nave hideDesktopUp; display: grid; }',
      '.c { display: grid; @nave hideDesktopUp; }',
      'display',
    ],
    [
      '.c { @nave focusRing; &:focus { outline: none } }',
      '.c { &:focus { outline: none } @nave focusRing; }',
      'outline',
    ],
    [
      '.c { @nave focusRing; &:focus-visible { outline-color: red } }',
      '.c { &:focus-visible { outline-color: red } @nave focusRing; }',
      'outline-color',
    ],
  ])('%s: the printed fix and the printed marker both work', async (css, fixed, marker) => {
    const [warning] = await run(css, { extend: EXTEND })
    const [, printedMarker] = [snippets(warning!.text)[0], snippets(warning!.text).at(-1)!]

    expect(printedMarker).toContain(`nave-allow-override: ${marker} `)
    expect(await run(fixed, { extend: EXTEND })).toEqual([])
    expect(await run(withDirective(css, printedMarker), { extend: EXTEND })).toEqual([])
  })

  it('marks the first directive, the one that names the atom, for two directives', async () => {
    const [warning] = await run('.c { @nave hideDesktopUp; @nave flex; }')

    expect(warning!.text).toContain('mark the directive that names "hideDesktopUp"')
    expect(snippets(warning!.text).at(-1)).toBe(
      '@nave /* nave-allow-override: display */ hideDesktopUp;',
    )
  })

  it('keeps the width marker of a directive and adds display', async () => {
    const css =
      '.c { @nave /* nave-allow-override: width */ hideDesktopUp wFullPhoneOnly; display: grid; width: 1px; }'
    const [warning] = await run(css)

    expect(warning!.text).toContain('move display: grid above the directive')
    expect(snippets(warning!.text).at(-1)).toContain('nave-allow-override: width display */')
  })
})

describe.each(HOSTS)(
  'AC-native-apply-order-48 — the atom goes after the last overrider (%s)',
  (_name, run) => {
    it.each([
      ['.c { @nave hideDesktopUp flex grid; }', 2, '@nave flex grid hideDesktopUp;'],
      [
        '.c { @nave hideDesktopUp flex textLeft grid; }',
        2,
        '@nave flex textLeft grid hideDesktopUp;',
      ],
      [
        '.c { @nave hideDesktopUp flex grid textLeft; }',
        2,
        '@nave flex grid hideDesktopUp textLeft;',
      ],
      ['.c { @nave hideDesktopUp flex; }', 1, '@nave flex hideDesktopUp;'],
      [
        '.c { @nave hideDesktopUp hideDesktopUp flex; }',
        2,
        '@nave flex hideDesktopUp hideDesktopUp;',
      ],
      [
        '.c { @nave hideDesktopUp flex hideDesktopUp; }',
        1,
        '@nave flex hideDesktopUp hideDesktopUp;',
      ],
      [
        '.c { @nave hideDesktopUp flex hideDesktopUp flex; }',
        3,
        '@nave flex flex hideDesktopUp hideDesktopUp;',
      ],
      [
        '.c { @nave hideDesktopUp textLeft hideDesktopUp flex; }',
        2,
        '@nave textLeft flex hideDesktopUp hideDesktopUp;',
      ],
    ])('%s', async (css, count, fix) => {
      const warnings = await run(css)

      expect(warnings).toHaveLength(count)
      for (const warning of warnings) expect(snippets(warning.text)[0]).toBe(fix)
      expect(await run(css.replace(/@nave [^;]*;/, () => fix))).toEqual([])
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-52 — the marker names the longhands left (%s)',
  (_name, run) => {
    it.each([
      ['.c { @nave focusRing; &:focus { outline: none } }', ['outline']],
      ['.c { @nave focusRing; &:focus-visible { outline-color: red } }', ['outline-color']],
      ['.c { @nave focusRing; &:focus { outline-style: none } }', ['outline-style']],
      [
        '.c { @nave /* nave-allow-override: outline-color */ focusRing; &:focus { outline: none } }',
        ['outline-style', 'outline-width'],
      ],
      [
        '.c { @nave /* nave-allow-override: outline-color */ ringX; &:focus { outline: none } }',
        ['outline-style', 'outline-width'],
      ],
      ['.c { @nave mBc; border: 0; }', ['border-color']],
      ['.c { @nave mBc; border-top: 0; }', ['border-top-color']],
      ['.card { @nave wFullPhoneOnly; inline-size: 50%; }', ['width']],
    ])('%s names %j', async (css, names) => {
      const warnings = await run(css, { extend: EXTEND })
      const marker = snippets(warnings[0]!.text).at(-1)!

      expect(warnings).toHaveLength(1)
      for (const name of names) expect(marker).toContain(name)
      expect(await run(withDirective(css, marker), { extend: EXTEND })).toEqual([])
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-50 — a longhand over part of a shorthand block (%s)',
  (_name, run) => {
    it.each([
      [
        '.f { @nave gutter; margin-top: 4px }',
        'it replaces the margin-top that margin: 0 sets',
        'margin-top',
      ],
      [
        '.c { @nave ringX; &:focus-visible { outline-color: red } }',
        'its outline-color: red replaces the outline-color that outline: 2px solid blue sets',
        'outline-color',
      ],
      [
        '.c { @nave mBc; border-top: 0; }',
        'it replaces the border-top-color that border-color: blue sets',
        'border-top-color',
      ],
      ['.f { @nave gutter; margin: 4px }', 'margin is 4px, not 0', 'margin'],
      ['.c { @nave mBc; border: 0; }', 'border: 0 replaces border-color', 'border-color'],
    ])('%s says %s', async (css, form, marker) => {
      const [warning] = await run(css, { extend: EXTEND })

      expect(warning!.text).toContain(form)
      expect(snippets(warning!.text).at(-1)).toContain(`nave-allow-override: ${marker} `)
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-27 — one warning per block and overrider (%s)',
  (_name, run) => {
    it('is one warning in the shorthand form for F3', async () => {
      const warnings = await run('.c { @nave focusRing; &:focus { outline: none } }')

      expect(warnings).toHaveLength(1)
      expect(warnings[0]!.text).toContain(
        'on :focus-visible outline: none replaces outline-style, outline-width and outline-color',
      )
    })

    it('is one for each block whose margin it overrides', async () => {
      expect(
        await run('.c { @nave srOnlyFocusable; &:focus-visible { margin: 4px } }'),
      ).toHaveLength(2)
    })
  },
)
