/**
 * A move a warning prints is printed only where the arrangement it produces, checked again, no
 * longer warns on that pair and warns on no new one. Every route to a move is held to it: the
 * nested block moved above the container, a block moved above the directive, an atom moved into a
 * later directive, and an atom named after another. Where no move qualifies the warning prints the
 * marked directive alone, which always clears the pair.
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
  mB: { declarations: {}, media: { '(width >= 60em)': { declarations: { color: 'blue' } } } },
}

/**
 * The text of each warning `css` draws, `extend` being the two atoms above.
 */
async function textsOf(
  run: (css: string, options?: object) => Promise<{ text: string }[]>,
  css: string,
): Promise<string[]> {
  const warnings = await run(css, { extend: EXTEND })
  return warnings.map((warning) => warning.text)
}

/**
 * `css` with the directive a warning prints marked: the printed directive names the same atoms, so
 * it takes the place of the first directive that does.
 */
function marked(css: string, text: string): string {
  const printed = /`(@nave [^`]*)`\s*$/.exec(text)![1]!
  const prelude = printed
    .slice(printed.indexOf('*/') + 2)
    .replace(/;$/, '')
    .trim()
  const directive = printed.replace(/;$/, '')
  return css.replace(`@nave ${prelude}`, () => directive)
}

describe.each(HOSTS)(
  'AC-native-apply-order-26 — a move that only turns the pair round is not printed (%s)',
  (_name, run) => {
    it.each([
      ['.x { & { @nave mA } & { @nave mB } }', 'the second & block', 'mA'],
      ['.x { @nave mA; & { @nave mB } }', 'the & block', 'mA'],
      [
        '.x { @media (width >= 10em) { & { @nave mA } } @media (width >= 10em) { & { @nave mB } } }',
        'the second @media (width >= 10em) block',
        'mA',
      ],
      ['.x { @nave mB; & { @nave mA } }', 'the & block', 'mB'],
      [
        '.x { @media (width >= 10em) { & { @nave mA } & { @nave mB } } }',
        'the second & block',
        'mA',
      ],
    ])('%s prints the marker and no move', async (css, overrider, earlier) => {
      const texts = await textsOf(run, css)

      expect(texts).toHaveLength(1)
      expect(texts[0]).toContain(`${overrider} comes after "${earlier}"`)
      expect(texts[0]).not.toContain('To let')
      expect(texts[0]).toContain(`mark the directive that names "${earlier}"`)
      expect(await textsOf(run, marked(css, texts[0]!))).toEqual([])
    })

    it.each([
      ['.x { @nave mA mB; }', '"mB" comes after "mA"'],
      ['.x { @nave mA; @nave mB; }', '"mB" comes after "mA"'],
      ['.x { @nave mA; @nave mB; @nave mA; }', '"mB" comes after "mA"'],
    ])('%s prints no move when the other order only turns the pair round', async (css, start) => {
      const texts = await textsOf(run, css)

      expect(texts[0]).toContain(start)
      expect(texts.join(' ')).not.toContain('To let')
      expect(await textsOf(run, marked(css, texts[0]!))).not.toContain(texts[0])
    })

    it('still prints the move where it clears the pair', async () => {
      const [text] = await textsOf(run, '.x { & { @nave mA } & { color: blue } }')

      expect(text).toContain('To let "mA" win, move the second & block above the first & block.')
      expect(await textsOf(run, '.x { & { color: blue } & { @nave mA } }')).toEqual([])
    })

    it('still prints the move over the same-rule block that holds no directive', async () => {
      const [text] = await textsOf(run, '.x { @nave mA; & { color: blue } }')

      expect(text).toContain('move the & block above the directive.')
      expect(await textsOf(run, '.x { & { color: blue } @nave mA; }')).toEqual([])
    })

    it('still prints a reorder that clears the pair', async () => {
      const [text] = await textsOf(run, '.x { @nave hideDesktopUp flex; }')

      expect(text).toContain('name it after "flex": `@nave flex hideDesktopUp;`')
    })
  },
)

const CONTAINERS = [
  '& { @nave mA }',
  '&.m { @nave mA }',
  '@media (width >= 60em) { & { @nave mA } }',
]
const LATER_OWN = [
  'color: blue;',
  '& { color: blue }',
  '@media (width >= 30em) { color: blue }',
  '& { @nave mB }',
  '&.m2 { @nave mB }',
  '@media (width >= 30em) { & { @nave mB } }',
  '@media (width >= 60em) { & { @nave mA } }',
]
const LATER_ATOM = ['@nave mB;', '@nave hideDesktopUp;', '@nave mB flex;']

/**
 * A pair in one rule, and the arrangement its printed move makes, when it prints one.
 */
const SAME_RULE: readonly (readonly [string, string | undefined])[] = [
  ['.x { @nave mA; & { color: blue } }', '.x { & { color: blue } @nave mA; }'],
  [
    '.x { @nave mA; @media (width >= 30em) { color: blue } }',
    '.x { @media (width >= 30em) { color: blue } @nave mA; }',
  ],
  ['.x { @nave mA; color: blue; }', '.x { color: blue; @nave mA; }'],
  ['.x { @nave mA; & { @nave mB } }', undefined],
  ['.x { @nave mA; @media (width >= 30em) { & { @nave mB } } }', undefined],
  ['.x { @nave mA mB; }', undefined],
  ['.x { @nave mA; @nave mB; }', undefined],
  ['.x { @nave mA; @nave mB flex; }', undefined],
  ['.x { @nave hideDesktopUp flex; }', '.x { @nave flex hideDesktopUp; }'],
  ['.x { @nave hideDesktopUp; @nave flex; }', '.x { @nave flex hideDesktopUp; }'],
  ['.x { @nave hideDesktopUp flex grid; }', '.x { @nave flex grid hideDesktopUp; }'],
]

describe.each(HOSTS)(
  'AC-native-apply-order-26 — every printed move, applied, leaves nothing; every marker clears (%s)',
  (_name, run) => {
    it.each(
      CONTAINERS.flatMap((container) => [
        ...LATER_OWN.map((later) => [container, later] as const),
        ...LATER_ATOM.map((later) => [container, later] as const),
      ]),
    )('an outward pair, %s then %s', async (container, later) => {
      const css = `.x { ${container} ${later} }`
      const texts = await textsOf(run, css)

      const hasMove = texts.some((text) => text.includes('To let'))

      expect(hasMove ? await textsOf(run, `.x { ${later} ${container} }`) : []).toEqual([])
      for (const text of texts) {
        expect(await textsOf(run, marked(css, text))).not.toContain(text)
      }
    })

    it.each(SAME_RULE)('a pair in one rule, %s', async (css, moved) => {
      const texts = await textsOf(run, css)

      expect(texts.length).toBeGreaterThan(0)
      for (const text of texts) {
        expect(text.includes('To let')).toBe(moved !== undefined)
        expect(await textsOf(run, marked(css, text))).not.toContain(text)
      }
      expect(moved === undefined ? [] : await textsOf(run, moved)).toEqual([])
    })
  },
)
