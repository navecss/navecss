/**
 * AC-native-apply-order-18 and AC-native-apply-order-29: the legacy names of CSS properties
 * (`grid-gap` and its two longhands, `word-wrap`, `page-break-*`) and `border` resetting
 * `border-image` are the properties they are for. A name is printed as the source writes it, and
 * a marker naming a legacy name covers what the property it stands for covers.
 */
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { warningsViaPostcss, warningsViaText } from '../helpers/native-order.ts'

const HOSTS = [
  ['the PostCSS host', warningsViaPostcss],
  ['the text expander', (css: string, o?: object) => Promise.resolve(warningsViaText(css, o))],
] as const

/**
 * The atom `m`: `@media (width >= 75em) { <prop>: <value> }`.
 */
function atomM(prop: string, value: string): Record<string, AtomDefinition> {
  return {
    m: { declarations: {}, media: { '(width >= 75em)': { declarations: { [prop]: value } } } },
  }
}

/**
 * The backtick snippets of a warning, in order.
 */
function snippets(text: string): string[] {
  return Array.from(text.matchAll(/`([^`]+)`/g), (match) => match[1]!)
}

describe.each(HOSTS)('AC-native-apply-order-18 — legacy names (%s)', (_name, run) => {
  it.each<readonly [string, string, string, string, string, string]>([
    ['gap', '1rem', 'grid-gap', '2rem', 'gap is 2rem, not 1rem', 'gap'],
    ['row-gap', '1rem', 'grid-row-gap', '2rem', 'row-gap is 2rem, not 1rem', 'row-gap'],
    ['column-gap', '1rem', 'grid-column-gap', '2rem', 'column-gap is 2rem, not 1rem', 'column-gap'],
    [
      'overflow-wrap',
      'anywhere',
      'word-wrap',
      'normal',
      'overflow-wrap is normal, not anywhere',
      'overflow-wrap',
    ],
    [
      'overflow-wrap',
      'anywhere',
      'WORD-WRAP',
      'normal',
      'overflow-wrap is normal, not anywhere',
      'overflow-wrap',
    ],
    ['grid-gap', '1rem', 'gap', '2rem', 'grid-gap is 2rem, not 1rem', 'grid-gap'],
    [
      'word-wrap',
      'anywhere',
      'overflow-wrap',
      'normal',
      'word-wrap is normal, not anywhere',
      'word-wrap',
    ],
    ['row-gap', '1rem', 'grid-gap', '2rem', 'grid-gap: 2rem replaces row-gap', 'row-gap'],
    [
      'gap',
      '1rem',
      'grid-row-gap',
      '2rem',
      'it replaces the row-gap that gap: 1rem sets',
      'row-gap',
    ],
    [
      'break-before',
      'page',
      'page-break-before',
      'auto',
      'page-break-before: auto replaces break-before',
      'break-before',
    ],
    [
      'break-after',
      'page',
      'page-break-after',
      'auto',
      'page-break-after: auto replaces break-after',
      'break-after',
    ],
    [
      'break-inside',
      'avoid',
      'page-break-inside',
      'auto',
      'page-break-inside: auto replaces break-inside',
      'break-inside',
    ],
    [
      'border-image-source',
      'linear-gradient(red, blue)',
      'border',
      '1px solid red',
      'border: 1px solid red replaces border-image-source',
      'border-image-source',
    ],
    [
      'border',
      '1px solid red',
      'border-image-source',
      'none',
      'it replaces the border-image-source that border: 1px solid red sets',
      'border-image-source',
    ],
  ])('%s: %s then %s: %s warns once, says %j and prints the marker %s', async (...row) => {
    const [blockProp, blockValue, laterProp, laterValue, form, marker] = row
    const css = `.x { @nave m; ${laterProp}: ${laterValue}; }`
    const warnings = await run(css, { extend: atomM(blockProp, blockValue) })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.text).toContain(form)
    const printed = snippets(warnings[0]!.text).at(-1)!
    expect(printed).toContain(`nave-allow-override: ${marker} */`)
    const marked = css.replace('@nave m;', () => printed)
    expect(await run(marked, { extend: atomM(blockProp, blockValue) })).toEqual([])
  })

  it.each<readonly [string, string, string, string]>([
    ['gap', '1rem', 'grid-gap', '1rem'],
    ['overflow-wrap', 'anywhere', 'word-wrap', 'anywhere'],
    ['gap', '1rem', 'grid-template-columns', '1fr'],
    ['row-gap', '1rem', 'grid-column-gap', '2rem'],
    ['overflow-wrap', 'anywhere', 'word-break', 'break-all'],
    ['break-before', 'page', 'page-break-after', 'auto'],
    ['border-image-source', 'linear-gradient(red, blue)', 'border-color', 'red'],
    ['font-stretch', 'condensed', 'font-width', 'condensed'],
  ])('%s: %s then %s: %s reports nothing', async (blockProp, blockValue, laterProp, laterValue) => {
    const css = `.x { @nave m; ${laterProp}: ${laterValue}; }`

    expect(await run(css, { extend: atomM(blockProp, blockValue) })).toEqual([])
  })

  it.each([
    ['border-image-source', 'none'],
    ['border-image-slice', '10'],
    ['border-image-width', '1'],
    ['border-image-outset', '0'],
    ['border-image-repeat', 'stretch'],
  ])('border resets %s', async (longhand, value) => {
    const css = '.x { @nave m; border: 1px solid red; }'
    const warnings = await run(css, { extend: atomM(longhand, value) })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.text).toContain(`border: 1px solid red replaces ${longhand}`)
    expect(snippets(warnings[0]!.text).at(-1)).toContain(`nave-allow-override: ${longhand} */`)
  })
})

describe.each(HOSTS)(
  'AC-native-apply-order-29 — markers naming a legacy name (%s)',
  (_name, run) => {
    const extend: Record<string, AtomDefinition> = {
      gapM: { declarations: {}, media: { '(width >= 75em)': { declarations: { gap: '1rem' } } } },
      wrapM: {
        declarations: {},
        media: { '(width >= 75em)': { declarations: { 'overflow-wrap': 'anywhere' } } },
      },
      pbM: {
        declarations: {},
        media: { '(width >= 75em)': { declarations: { 'break-before': 'page' } } },
      },
    }

    /**
     * The order warnings and the marker reports a rule draws.
     */
    async function reports(
      css: string,
    ): Promise<{ marker: number; order: number; text: string[] }> {
      const found = await run(css, { extend })
      const marker = found.filter(
        (w) => w.text.includes('allows nothing') || w.text.includes('Remove'),
      )
      return {
        order: found.length - marker.length,
        marker: marker.length,
        text: found.map((w) => w.text),
      }
    }

    it.each<readonly [string, number, number]>([
      ['.c { @nave /* nave-allow-override: grid-gap */ gapM; grid-gap: 2rem; }', 0, 0],
      ['.c { @nave /* nave-allow-override: gap */ gapM; grid-gap: 2rem; }', 0, 0],
      ['.c { @nave /* nave-allow-override: grid-row-gap */ gapM; grid-gap: 2rem; }', 1, 0],
      ['.c { @nave /* nave-allow-override: word-wrap */ wrapM; word-wrap: normal; }', 0, 0],
      [
        '.c { @nave /* nave-allow-override: page-break-before */ pbM; page-break-before: auto; }',
        0,
        0,
      ],
    ])('%s reports %i order warnings and %i marker reports', async (css, order, marker) => {
      const found = await reports(css)

      expect(found.order).toBe(order)
      expect(found.marker).toBe(marker)
    })

    it('prints column-gap for the part of gap that grid-row-gap leaves', async () => {
      const found = await reports(
        '.c { @nave /* nave-allow-override: grid-row-gap */ gapM; grid-gap: 2rem; }',
      )

      expect(found.text[0]).toContain('nave-allow-override: grid-row-gap column-gap */')
    })
  },
)
