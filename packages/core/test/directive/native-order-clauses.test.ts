/**
 * The focus clauses a warning carries where the later declaration takes something from a focus
 * atom, the place a block holds and, when the overrider has a place of its own, that too, and the
 * sentence about the previous release.
 */
import { describe, expect, it } from 'vitest'

import { MIGRATION_VERSION } from '../../src/directive/migration.ts'
import { REVEAL_CLAUSE, RING_CLAUSE } from '../../src/directive/order-focus.ts'
import { warningsViaPostcss, warningsViaText } from '../helpers/native-order.ts'

const HOSTS = [
  ['the PostCSS host', warningsViaPostcss],
  ['the text expander', (css: string, o?: object) => Promise.resolve(warningsViaText(css, o))],
] as const

const RING = 'ring'
const REVEAL = 'reveal'

describe.each(HOSTS)('AC-native-apply-order-28 — focus clauses (%s)', (_name, run) => {
  it.each([
    ['focusRing', '&:focus-visible { outline-color: red }', 1, undefined],
    ['focusRing', '&:focus { outline: none }', 1, RING],
    ['focusRing', '&:focus { outline-style: none }', 1, RING],
    ['focusRing', '&:focus { outline-width: 0 }', 1, RING],
    ['focusRing', '&:focus { outline-color: transparent }', 1, RING],
    ['focusRing', '&:focus { outline: 2px red }', 1, RING],
    ['focusRing', '&:focus { outline: 0 }', 1, RING],
    ['focusRing', '&:focus-visible { outline: 0 solid red }', 1, RING],
    ['focusRing', '&:focus-visible { outline: solid 0 }', 1, RING],
    ['focusRing', '&:focus-visible { outline: 2px solid rgb(255 0 0) }', 1, undefined],
    ['focusRing', '&:focus-visible { outline: 2px solid hsl(0 100% 50%) }', 1, undefined],
    ['focusRing', '&:focus-visible { outline: calc(0px + 2px) solid red }', 1, undefined],
    [
      'focusRing',
      '&:focus-visible { outline: 2px solid color-mix(in srgb, transparent, red) }',
      1,
      undefined,
    ],
    ['focusRing', '&:focus { outline: calc(0px) solid red }', 1, undefined],
    ['focusRing', '&:focus { outline-width: calc(0px) }', 1, undefined],
    ['focusRing', '&:focus { outline-color: rgb(0 0 0 / 0) }', 1, undefined],
    ['focusRing', '&:focus { outline-color: #0000 }', 1, undefined],
    ['focusRing', '&:focus { outline-width: initial }', 1, undefined],
    ['focusRing', '&:focus { outline-color: unset }', 1, undefined],
    ['focusRing', '&:focus { outline: 0 solid rgb(255 0 0) }', 1, RING],
    ['focusRing', '&:focus { outline: rgb(0 0 0) 2px }', 1, RING],
    ['focusRing', '&:focus { outline: 2px solid transparent }', 1, RING],
    ['focusRing', '&:focus-visible { outline: none }', 1, RING],
    ['focusRing', '&:focus-within { outline: none }', 1, RING],
    ['focusRing', '&:hover { outline: none }', 1, RING],
    ['focusRing', '&:focus { outline: 2px dashed red }', 1, undefined],
    ['focusRing', '&:focus { outline: auto }', 1, undefined],
    ['focusRing', '&:focus { outline: 0 auto }', 1, undefined],
    ['focusRing', '&:focus-visible { outline: auto 0 }', 1, undefined],
    ['focusRing', '&:focus { outline: 0 auto red }', 1, undefined],
    ['focusRing', '&:focus { outline: 2px AUTO transparent }', 1, undefined],
    ['focusRing', '&:focus { outline-style: auto }', 1, undefined],
    ['focusRing', '&:focus { outline: 0 dotted }', 1, RING],
    ['focusRing', '&:focus-visible { outline-offset: -2px }', 1, undefined],
    ['focusRing', '&:focus { outline-style: var(--s) }', 1, undefined],
    ['focusRing', '&:focus { outline-width: env(--w) }', 1, undefined],
    ['focusRing', '&:focus-visible { outline-style: unset }', 1, RING],
    ['focusRing', '&:focus { outline: initial }', 1, RING],
    ['focusRing', '&:focus { all: unset }', 1, RING],
    ['focusRing', '&:focus-visible { outline: revert }', 1, undefined],
    ['focusRing', '&:focus { outline: inherit }', 1, undefined],
    ['focusRing', '&:focus { outline-style: revert-layer }', 1, undefined],
    ['focusRing', 'outline: 0;', 0, undefined],
    ['srOnlyFocusable', '&:focus-visible { position: fixed }', 2, undefined],
    ['srOnlyFocusable', '&:focus-visible { clip-path: inset(50%) }', 2, REVEAL],
    ['srOnlyFocusable', '&:focus { clip-path: inset(50%) }', 2, REVEAL],
    ['srOnlyFocusable', '&:focus-visible { width: 1px; height: 1px; overflow: hidden }', 6, REVEAL],
    [
      'srOnlyFocusable',
      '&:focus-visible { width: 1px; height: 1px } &:focus-visible { overflow: hidden }',
      6,
      undefined,
    ],
    ['srOnlyFocusable', '&:focus-visible { all: unset }', 2, undefined],
    ['srOnlyFocusable', '&:focus-visible { width: 1px }', 2, undefined],
    ['srOnlyFocusable', '&:focus-visible { position: absolute }', 2, undefined],
  ])('%s then %s reports %i with clause %s', async (atom, later, count, clause) => {
    const warnings = await run(`.x { @nave ${atom}; ${later} }`)
    const carried = warnings.filter(
      (w) => w.text.includes(RING_CLAUSE) || w.text.includes(REVEAL_CLAUSE),
    )
    const expectedClause = clause === RING ? RING_CLAUSE : REVEAL_CLAUSE

    expect(warnings).toHaveLength(count)
    expect(carried).toHaveLength(clause === undefined ? 0 : count)
    for (const warning of carried) expect(warning.text).toContain(expectedClause)
  })

  it.each([
    ['&:focus { outline-style: auto; outline-width: 0 }', 2, 0],
    ['&:focus { outline-width: 0; outline-style: AUTO }', 2, 0],
    ['&:focus { outline: auto; outline-color: transparent }', 2, 0],
    ['&:focus { outline-style: dotted; outline-width: 0 }', 2, 1],
    ['&:focus { outline-width: 0 } &:hover { outline-style: auto }', 2, 1],
  ])(
    'focusRing then %s reports %i, %i of them with the ring clause',
    async (later, count, ring) => {
      const warnings = await run(`.x { @nave focusRing; ${later} }`)

      expect(warnings).toHaveLength(count)
      expect(warnings.filter((w) => w.text.includes(RING_CLAUSE))).toHaveLength(ring)
    },
  )

  it.each([
    ['.x { & { @nave focusRing } &:focus-visible { outline: none } }', 1, RING],
    ['.x { & { @nave focusRing } &:hover { outline: none } }', 1, RING],
    ['.x { & { & { @nave focusRing } } &:focus { outline-width: 0 } }', 1, RING],
    [
      '.x { @media (width >= 1px) { & { @nave focusRing } } &:focus-visible { all: unset } }',
      1,
      RING,
    ],
    ['.x { & { @nave focusRing } & { &:focus-visible { outline-color: transparent } } }', 1, RING],
    ['.x { & { @nave focusRing } &:focus-visible { outline-color: red } }', 1, undefined],
    ['.x { & { @nave focusRing } &:focus-visible { outline: 0 auto } }', 1, undefined],
    [
      '.x { & { @nave focusRing } &:focus-visible { outline: 2px solid rgb(255 0 0) } }',
      1,
      undefined,
    ],
    ['.x { & { @nave focusRing } &:focus-visible { outline-style: var(--s) } }', 1, undefined],
    ['.x { &:hover { @nave focusRing } &:focus-visible { outline: none } }', 0, undefined],
    ['.x { & { @nave srOnlyFocusable } &:focus-visible { clip-path: inset(50%) } }', 2, REVEAL],
    [
      '.x { & { @nave srOnlyFocusable } &:focus-visible { width: 1px; height: 1px; overflow: hidden } }',
      6,
      REVEAL,
    ],
    [
      '.x { & { & { @nave srOnlyFocusable } } &:focus-within { clip-path: inset(50%) } }',
      2,
      REVEAL,
    ],
    ['.x { & { @nave srOnlyFocusable } &:focus-visible { width: 1px } }', 2, undefined],
    ['.x { & { @nave srOnlyFocusable } &:focus-visible { clip-path: inset(25%) } }', 2, undefined],
    ['.x { & { @nave srOnlyFocusable } clip-path: inset(50%); }', 0, undefined],
  ])(
    'a directive in a nested rule, then the enclosing rule: %s reports %i with clause %s',
    async (css, count, clause) => {
      const warnings = await run(css)
      const carried = warnings.filter(
        (w) => w.text.includes(RING_CLAUSE) || w.text.includes(REVEAL_CLAUSE),
      )
      const expectedClause = clause === RING ? RING_CLAUSE : REVEAL_CLAUSE

      expect(warnings).toHaveLength(count)
      expect(carried).toHaveLength(clause === undefined ? 0 : count)
      for (const warning of carried) expect(warning.text).toContain(expectedClause)
      for (const warning of warnings) expect(warning.text).not.toContain('Before @navecss/core')
    },
  )

  it.each([
    [
      '.x { @media (width >= 60em) { & { @nave focusRing } &:focus-visible { outline: none } } }',
      1,
      RING,
    ],
    ['.x::before { & { @nave focusRing } &:focus-visible { outline: none } }', 0, undefined],
    [
      '.x { @media (width >= 60em) { & { @nave srOnlyFocusable } &:focus-visible { clip-path: inset(50%) } } }',
      2,
      REVEAL,
    ],
    [
      '.x::before { & { @nave srOnlyFocusable } &:focus-visible { clip-path: inset(50%) } }',
      0,
      undefined,
    ],
  ])(
    'a directive in a nested rule, then the same enclosing group or a pseudo-element rule: %s reports %i with clause %s',
    async (css, count, clause) => {
      const warnings = await run(css)
      const carried = warnings.filter(
        (w) => w.text.includes(RING_CLAUSE) || w.text.includes(REVEAL_CLAUSE),
      )

      expect(warnings).toHaveLength(count)
      expect(carried).toHaveLength(clause === undefined ? 0 : count)
    },
  )

  it('reports none for the atoms srOnlyFocusable shares nothing with', async () => {
    expect(await run('.x { @nave srOnlyFocusable srOnly; }')).toEqual([])
    expect(await run('.x { @nave srOnlyFocusable relative; }')).toEqual([])
  })

  it('puts the clause right after the so sentence and before the previous-release sentence', async () => {
    const [warning] = await run('.x { @nave focusRing; &:focus { outline: none } }')
    const text = warning!.text

    expect(text.indexOf(RING_CLAUSE)).toBeGreaterThan(text.indexOf('replaces outline-style'))
    expect(text.indexOf(RING_CLAUSE)).toBeLessThan(text.indexOf('Before @navecss/core'))
    expect(text).not.toMatch(/marker keeps/)
  })
})

describe.each(HOSTS)('AC-native-apply-order-49 — a place of its own (%s)', (_name, run) => {
  const extend = {
    mA: { declarations: {}, media: { '(width >= 75em)': { declarations: { color: 'red' } } } },
    mB: { declarations: {}, media: { '(width >= 60em)': { declarations: { color: 'blue' } } } },
  }

  it.each([
    [
      '.skip { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
      'so on :focus-visible position is fixed',
      1,
    ],
    [
      '.skip { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
      'so on :focus-within while also on :focus-visible, position is fixed',
      1,
    ],
    [
      '.c { @nave hideTabletPortraitUp; @media (width < 75em) { display: grid } }',
      'so under @media (width >= 37.5em) while also under @media (width < 75em), display is grid',
      1,
    ],
    [
      '.x { @nave hideDesktopUp; @media (orientation: landscape) { display: grid } }',
      'while also under @media (orientation: landscape)',
      1,
    ],
    [
      '.x { @nave mA mB; }',
      '"mB" comes after "mA", so under @media (width >= 75em) while also under @media (width >= 60em),',
      1,
    ],
    ['.x { @nave focusRing; &:hover { outline: none } }', 'while also on :hover', 1],
    ['.x { @nave focusRing; &.open { outline-color: red } }', 'while also on .open', 1],
    [
      '.x { @nave focusRing; &:focus-within { outline: none } }',
      'so on :focus-visible outline: none replaces',
      1,
    ],
    [
      '.x { @nave focusRing; &:focus-visible { outline-color: red } }',
      'so on :focus-visible outline-color is red',
      1,
    ],
    [
      '.x { @nave hideDesktopUp; display: grid; }',
      'so under @media (width >= 75em) display is grid',
      1,
    ],
    ['.c { @nave hideDesktopUp flex; }', 'so under @media (width >= 75em) display is flex', 1],
  ])('%s says %s', async (css, phrase) => {
    const warnings = await run(css, { extend })

    expect(warnings.some((w) => w.text.includes(phrase))).toBe(true)
  })

  it('composes the own place with the shorthand form and the ring clause', async () => {
    const [warning] = await run('.x { @nave focusRing; &:hover { outline: none } }')

    expect(warning!.text).toContain(
      `on :focus-visible while also on :hover, outline: none replaces outline-style, outline-width and outline-color. ${RING_CLAUSE}`,
    )
  })
})

describe.each(HOSTS)(
  'AC-native-apply-order-32 — the previous-release sentence (%s)',
  (_name, run) => {
    const extend = {
      mA: { declarations: {}, media: { '(width >= 75em)': { declarations: { color: 'red' } } } },
      mB: { declarations: {}, media: { '(width >= 60em)': { declarations: { color: 'blue' } } } },
    }
    const SENTENCE = `Before @navecss/core ${MIGRATION_VERSION} `

    it.each([
      ['.c { @nave hideDesktopUp flex; }', true],
      ['.x { @nave hideDesktopUp; display: grid; }', true],
      ['.x { @nave focusRing; &:focus { outline: none } }', true],
      ['.card { @nave wFullPhoneOnly; inline-size: 50%; }', true],
      ['.x { @nave mA mB; }', false],
    ])('%s carries it: %s', async (css, isCarried) => {
      const [warning] = await run(css, { extend })

      expect(warning!.text.includes(SENTENCE)).toBe(isCarried)
    })

    it('puts it after the focus clause and before the fix', async () => {
      const [warning] = await run('.x { @nave focusRing; &:focus { outline: none } }')
      const { text } = warning!

      expect(text.indexOf(RING_CLAUSE)).toBeLessThan(text.indexOf(SENTENCE))
      expect(text.indexOf(SENTENCE)).toBeLessThan(text.indexOf('To let'))
    })
  },
)

/**
 * The text of each warning.
 */
function texts(warnings: readonly { text: string }[]): string[] {
  return warnings.map((w) => w.text)
}

describe('AC-native-apply-order-28 and AC-native-apply-order-25 — a comment in a declaration the reveal sentence reads does not change the sentence', () => {
  it.each([
    [
      '.x { @nave srOnlyFocusable; &:focus-visible { clip-path: inset(50%) /* c */; } }',
      '.x { @nave srOnlyFocusable; &:focus-visible { clip-path: inset(50%); } }',
    ],
    [
      '.x { @nave srOnlyFocusable; &:focus-visible { clip-path: inset(/* c */ 50%); } }',
      '.x { @nave srOnlyFocusable; &:focus-visible { clip-path: inset(50%); } }',
    ],
    [
      '.x { @nave srOnlyFocusable; &:focus-visible { width: 1px /* c */; height: 1px; overflow: hidden; } }',
      '.x { @nave srOnlyFocusable; &:focus-visible { width: 1px; height: 1px; overflow: hidden; } }',
    ],
    [
      '.x { @nave srOnlyFocusable; &:focus-visible { width: 1px; height: 1px; overflow: hidden /* c */; } }',
      '.x { @nave srOnlyFocusable; &:focus-visible { width: 1px; height: 1px; overflow: hidden; } }',
    ],
  ])('%s says what its comment-free twin says, in both hosts', async (css, bare) => {
    const expected = texts(warningsViaText(bare))

    expect(expected.some((t) => t.includes('hides again what "srOnlyFocusable" reveals'))).toBe(
      true,
    )
    expect(texts(warningsViaText(css))).toEqual(expected)
    expect(texts(await warningsViaPostcss(css))).toEqual(expected)
  })

  it('reads nested parentheses in the outline shorthand as one block, in both hosts', async () => {
    const css = '.x { @nave focusRing; &:focus { outline: calc((1px) + 0px) solid red } }'

    for (const warnings of [warningsViaText(css), await warningsViaPostcss(css)]) {
      expect(warnings).toHaveLength(1)
      expect(warnings[0]!.text).not.toContain('keyboard focus indicator')
    }
  })
})
