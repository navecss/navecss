/**
 * How a warning prints a block, a selector and a condition, the same in both hosts: a comment in a
 * selector or a prelude is dropped, ordinals run past the tenth, two spellings of one condition are
 * one, and a condition that holds a comma or an `or` is parenthesised.
 */
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { warningsViaPostcss, warningsViaText } from '../helpers/native-order.ts'

const HOSTS = [
  ['the PostCSS host', warningsViaPostcss],
  ['the text expander', (css: string, o?: object) => Promise.resolve(warningsViaText(css, o))],
] as const

const EXTEND: Record<string, AtomDefinition> = {
  mA: { declarations: {}, media: { '(width >= 75em)': { declarations: { color: 'red' } } } },
}

/**
 * The text of each warning `css` draws.
 */
async function textsOf(
  run: (css: string, options?: object) => Promise<{ text: string }[]>,
  css: string,
): Promise<string[]> {
  const warnings = await run(css, { extend: EXTEND })
  return warnings.map((warning) => warning.text)
}

describe.each(HOSTS)(
  'AC-native-apply-order-25 — a comment in a selector or a prelude is not printed (%s)',
  (_name, run) => {
    it.each([
      [
        '.x { &:where(.q /* c */) { @nave hideDesktopUp } &:where(.q) { display: flex } }',
        '.x { &:where(.q) { @nave hideDesktopUp } &:where(.q) { display: flex } }',
      ],
      [
        '.x { @media /* c */ (width >= 60em) { & { @nave hideDesktopUp } } display: flex }',
        '.x { @media (width >= 60em) { & { @nave hideDesktopUp } } display: flex }',
      ],
      [
        '.x { @nave hideDesktopUp; @media /* c */ (width < 100em) { display: flex } }',
        '.x { @nave hideDesktopUp; @media (width < 100em) { display: flex } }',
      ],
      [
        '.x { @nave hideDesktopUp; &:where(.q /* c */) { display: flex } }',
        '.x { @nave hideDesktopUp; &:where(.q) { display: flex } }',
      ],
    ])('%s prints what it prints without the comment', async (css, plain) => {
      const texts = await textsOf(run, css)

      expect(texts).toHaveLength(1)
      expect(texts).toEqual(await textsOf(run, plain))
      expect(texts[0]).not.toContain('/* c */')
      expect(texts[0]).not.toContain(' )')
    })

    it('numbers the two blocks of one selector in both hosts, the comment or not', async () => {
      const [text] = await textsOf(
        run,
        '.x { &:where(.q /* c */) { @nave hideDesktopUp } &:where(.q) { display: flex } }',
      )

      expect(text).toContain('the second &:where(.q) block comes after "hideDesktopUp"')
      expect(text).toContain('so on :where(.q) under @media (width >= 75em) display is flex')
      expect(text).toContain('move the second &:where(.q) block above the first &:where(.q) block.')
    })
  },
)

describe.each(HOSTS)('AC-native-apply-order-25 — ordinals past the tenth (%s)', (_name, run) => {
  it.each([
    [9, 'ninth'],
    [10, 'tenth'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [24, '24th'],
    [101, '101st'],
    [111, '111th'],
    [112, '112th'],
    [113, '113th'],
  ])('names the container written as block number %i the %s', async (place, name) => {
    const before = '& { color: red } '.repeat(place - 1)
    const [text] = await textsOf(run, `.x { ${before}& { @nave hideDesktopUp } display: flex }`)

    expect(text).toContain(`move display: flex above the ${name} & block.`)
  })
})

describe('AC-native-apply-order-16 — a directive straight inside a group', () => {
  it('draws no order warning in the text expander: the host refuses the directive', () => {
    expect(
      warningsViaText('.x { @media (width >= 60em) { @nave hideDesktopUp; display: flex } }'),
    ).toEqual([])
  })
})

describe.each(HOSTS)(
  'AC-native-apply-order-25 — two spellings of one condition are one (%s)',
  (_name, run) => {
    it.each([
      '.x { @media (width>=75em) { & { @nave hideDesktopUp } display: flex } }',
      '.x { @media (width >= 75em) { & { @nave hideDesktopUp } display: flex } }',
      '.x { @media ( width>=75em ) { & { @nave hideDesktopUp } display: flex } }',
    ])('%s names the condition once', async (css) => {
      const [text] = await textsOf(run, css)

      expect(text!.match(/@media/g)).toHaveLength(1)
    })

    it('says no "while also" for the later content under the same condition spelled another way', async () => {
      const [text] = await textsOf(
        run,
        '.x { @media (width>=75em) { & { @nave hideDesktopUp } @media (width >= 75em) { display: flex } } }',
      )

      expect(text).not.toContain('while also')
      expect(text).not.toContain('and @media')
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-25 — a condition that holds a comma or an or is parenthesised (%s)',
  (_name, run) => {
    it('prints an or in the place clause, byte for byte', async () => {
      expect(
        await textsOf(
          run,
          '.x { @media (width >= 60em) or (width < 30em) { & { @nave mA } } color: blue }',
        ),
      ).toEqual([
        '@nave: color: blue comes after "mA", so under @media (width >= 75em) and (@media (width >= 60em) or (width < 30em)) color is blue, not red. To let "mA" win, move color: blue above the @media (width >= 60em) or (width < 30em) block. If it is meant to win, mark the directive that names "mA": `@nave /* nave-allow-override: color */ mA;`',
      ])
    })

    it('prints a comma list in the "while also" clause, byte for byte', async () => {
      expect(
        await textsOf(
          run,
          '.x { @nave mA; @media (width < 30em), (width > 80em) { color: blue } }',
        ),
      ).toEqual([
        '@nave: the @media (width < 30em), (width > 80em) block comes after "mA", so under @media (width >= 75em) while also under (@media (width < 30em), (width > 80em)), color is blue, not red. Before @navecss/core 0.5.0 "mA" won, because an atom\'s blocks were placed last in the rule. To let "mA" win, move the @media (width < 30em), (width > 80em) block above the directive. If it is meant to win, mark the directive that names "mA": `@nave /* nave-allow-override: color */ mA;`',
      ])
    })

    it.each([
      [
        '@supports (display: grid) or (display: flex)',
        '(@supports (display: grid) or (display: flex))',
      ],
      ['@media (width < 30em) OR (width > 80em)', '(@media (width < 30em) OR (width > 80em))'],
      ['@media (width < 30em) Or (width > 80em)', '(@media (width < 30em) Or (width > 80em))'],
    ])('parenthesises %s', async (group, printed) => {
      const [text] = await textsOf(run, `.x { @nave mA; ${group} { color: blue } }`)

      expect(text).toContain(`while also under ${printed},`)
    })

    it.each([
      ['@media (width >= 60em) and (width < 90em)', '@media (width >= 60em) and (width < 90em)'],
      ['@media ((width < 30em) or (width > 80em))', '@media ((width < 30em) or (width > 80em))'],
      ['@supports (--x: "a or b")', '@supports (--x: "a or b")'],
    ])('leaves %s bare', async (group, printed) => {
      const [text] = await textsOf(run, `.x { @nave mA; ${group} { color: blue } }`)

      expect(text).toContain(`while also under ${printed},`)
    })
  },
)
