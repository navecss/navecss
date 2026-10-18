/**
 * What the output costs a selector list: a rule whose every selector is a pseudo-element gets none
 * of its atoms' blocks, a list that mixes such selectors with others is warned about every wrapped
 * run (they cannot reach the pseudo-element), and a list whose other selectors differ in
 * specificity is warned about every wrapped run (it matches at the highest). The worked instances
 * are asserted byte for byte.
 */
import { describe, expect, it } from 'vitest'

import {
  childrenOf,
  framedWarnings,
  kindsOf,
  viaPostcss,
  viaText,
  warningsViaPostcss,
  warningsViaText,
} from '../helpers/native-order.ts'
import { SHAPE_INSTANCES } from '../helpers/worked-instances.ts'

const HOSTS = [
  ['the PostCSS host', viaPostcss, warningsViaPostcss],
  [
    'the text expander',
    (css: string) => Promise.resolve(viaText(css)),
    (css: string) => Promise.resolve(warningsViaText(css)),
  ],
] as const

describe.each(HOSTS)(
  'AC-native-apply-order-07 — a pseudo-element rule (%s)',
  (_name, run, warn) => {
    it.each([
      [
        '.p::before { content: "x"; @nave hideDesktopUp; display: block; width: 10px }',
        ['content: "x"', 'display: block', 'width: 10px'],
        1,
      ],
      [
        '.badge::after { content: ""; @nave focusRing hideDesktopUp; }',
        ['content: ""', 'outline: none'],
        1,
      ],
      [
        '.p:before { @nave focusRing flex; width: 10px }',
        ['outline: none', 'display: flex', 'width: 10px'],
        1,
      ],
      ['.p::after, .q::marker { @nave hideDesktopUp wFullPhoneOnly; }', [], 1],
      ['.p::part(x):hover { @nave hideDesktopUp; width: 10px }', ['width: 10px'], 1],
      [
        '.p::before { &:hover { color: red } @nave flex; width: 10px }',
        ['&:hover { color: red }', 'display: flex', 'width: 10px'],
        0,
      ],
      ['.p::before { @nave flex; width: 10px }', ['display: flex', 'width: 10px'], 0],
    ])('%s keeps %j bare and reports %i', async (css, kept, count) => {
      const selector = css.slice(0, css.indexOf(' {'))
      expect(childrenOf(await run(css), selector)).toEqual(kept)
      expect(await warn(css)).toHaveLength(count)
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-08 — a list with a pseudo-element selector (%s)',
  (_name, _run, warn) => {
    it.each([
      ['.icon, .link::before { @nave hideDesktopUp; width: 1em; height: 1em; }', 1],
      ['.a, .b::before { @nave hideDesktopUp textLeft; width: 10px }', 2],
      ['.a, .b::before { &:hover { color: blue } @nave flex; }', 1],
      ['.a, .b::before { @nave hideDesktopUp; @nave textLeft; }', 1],
      ['.a, .b::before { &:hover { color: blue } width: 10px; @nave flex textLeft; }', 1],
      ['.a, .b::before { @nave flex; &:hover { color: blue } width: 10px; }', 1],
      ['.a, .b::before { @nave flex; @nave hideDesktopUp; width: 10px; }', 1],
      ['.a, .b::before { @nave hideDesktopUp focusRing; }', 1],
      ['.a, .b::before { @nave hideDesktopUp hideTabletPortraitUp textLeft; }', 1],
      ['.a, .b::before { &:hover { color: blue } @nave hideDesktopUp textLeft; }', 1],
      ['.a, .b::before { @nave flex; width: 10px }', 0],
      ['.a, .b { @nave hideDesktopUp; width: 10px }', 0],
    ])('%s reports %i', async (css, count) => {
      expect(await warn(css)).toHaveLength(count)
    })

    it('names the fix of each row (the move or reorder only where it works)', async () => {
      const [b1] = await warn('.icon, .link::before { @nave hideDesktopUp; width: 1em; }')
      const [b2] = await warn('.a, .b::before { @nave hideDesktopUp focusRing; }')
      const [b3] = await warn(
        '.a, .b::before { &:hover { color: blue } width: 10px; @nave flex textLeft; }',
      )

      expect(b1!.text).toContain('move them above the directive. Or move .link::before')
      expect(b2!.text).toMatch(/ Move \.b::before to a separate rule/)
      expect(b3!.text).toMatch(/ Move \.b::before to a separate rule/)
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-34 — a list whose selectors differ in specificity (%s)',
  (_name, _run, warn) => {
    it.each([
      ['.s1, #x .s2 { @nave hideDesktopUp; color: red }', 1],
      ['.s1, #x .s2 { @nave hideDesktopUp textLeft }', 1],
      ['.s1, #x .s2 { @nave flex; &:hover { color: blue } color: red }', 1],
      ['.s1, #x .s2 { &:hover { color: blue } @nave flex; }', 1],
      ['.s1, #x .s2 { @nave hideDesktopUp; @nave textLeft; }', 1],
      ['.s1, .s2 { @nave hideDesktopUp; color: red }', 0],
      ['.s1, #x .s2 { color: red; @nave hideDesktopUp; }', 0],
      ['.a, .b::before { @nave hideDesktopUp; width: 10px }', 0],
    ])('%s reports %i wrap warnings', async (css, count) => {
      const all = await warn(css)
      const found = all.filter((w) => w.text.includes('which under the selector list'))

      expect(found).toHaveLength(count)
    })

    it('fills the groups and the :is() list as written', async () => {
      const first = await warn('.s1, #x .s2, .s3::before { @nave hideDesktopUp; color: red }')
      const second = await warn('#x .s2, .s1, #y .s3, .s4 .s5 { @nave hideDesktopUp; color: red; }')
      const mixed = first.find((w) => w.text.includes('selector list'))
      const ties = second.find((w) => w.text.includes('selector list'))

      expect(mixed!.text).toContain(
        'write the rule once for each of `.s1, .s3::before` and `#x .s2`',
      )
      expect(mixed!.text).toContain('`:is(.s1, #x .s2), .s3::before`')
      expect(ties!.text).toContain('so where .s1 or .s4 .s5 matches')
      expect(ties!.text).toContain('`#x .s2, #y .s3`, `.s1` and `.s4 .s5`')
    })
  },
)

describe.each(SHAPE_INSTANCES)('AC-native-apply-order-25 — $name', (instance) => {
  it('prints through both hosts exactly as written', async () => {
    expect(framedWarnings(await warningsViaPostcss(instance.css))).toEqual(
      expect.arrayContaining([...instance.lines]),
    )
    expect(framedWarnings(warningsViaText(instance.css))).toEqual(
      expect.arrayContaining([...instance.lines]),
    )
  })
})

describe('AC-native-apply-order-07 — kinds', () => {
  it('leaves the declarations of a pseudo-element rule unwrapped', () => {
    expect(
      kindsOf(viaText('.p::before { content: "x"; @nave hideDesktopUp focusRing; }'), '.p::before'),
    ).toEqual(['decl content', 'decl outline'])
  })
})
