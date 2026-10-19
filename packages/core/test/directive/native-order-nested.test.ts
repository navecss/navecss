/**
 * Which later content the order check compares with an atom's conditional block: nested selectors
 * on the same element, the cascade (layer, `!important`, specificity), provably disjoint
 * conditions, and the property and value rules. Counts only; the messages are asserted elsewhere.
 */
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { warningsViaPostcss, warningsViaText } from '../helpers/native-order.ts'

const HOSTS = [
  ['the PostCSS host', warningsViaPostcss],
  ['the text expander', (css: string, o?: object) => Promise.resolve(warningsViaText(css, o))],
] as const

const EXTEND: Record<string, AtomDefinition> = {
  hideImp: {
    declarations: {},
    media: { '(width >= 75em)': { declarations: { display: 'none !important' } } },
  },
  mA: { declarations: {}, media: { '(width >= 75em)': { declarations: { color: 'red' } } } },
  mB: { declarations: {}, media: { '(width >= 60em)': { declarations: { color: 'blue' } } } },
  twoState: {
    declarations: {},
    pseudos: { '[data-a]': { color: 'red' }, '[data-b]': { color: 'blue' } },
    media: {
      '(width >= 48em)': { declarations: { color: 'green' } },
      '(width >= 75em)': { declarations: { color: 'black' } },
    },
  },
  twoStateB: {
    declarations: {},
    pseudos: { '[data-a]': { color: 'red' }, '[data-b]': { color: 'blue' } },
    media: {
      '(width >= 48em)': { declarations: { color: 'green' } },
      '(width >= 75em)': { declarations: { color: 'black' } },
    },
  },
  hx: {
    declarations: { 'font-size': '16px' },
    media: { '(width >= 48em)': { declarations: { 'font-size': '30px' } } },
  },
  mLe: {
    declarations: {},
    media: { '(width <= 37.5em)': { declarations: { display: 'none' } } },
  },
}

/**
 * The count of warnings `css` draws from each host, which must agree.
 */
async function countOf(
  css: string,
  run: (css: string, options?: object) => Promise<{ text: string }[]>,
): Promise<number> {
  const warnings = await run(css, { extend: EXTEND })
  return warnings.filter((warning) => warning.text.includes(' comes after ')).length
}

describe.each(HOSTS)('AC-native-apply-order-13 — same element (%s)', (_name, run) => {
  it.each([
    ['focusRing', '&:focus', 'outline-color: red', 1],
    ['focusRing', '.dark &', 'outline-color: red', 1],
    ['focusRing', '&.open', 'outline-color: red', 1],
    ['focusRing', ':is(&.open, & > span)', 'outline-color: red', 1],
    ['focusRing', '&:focus, & > span', 'outline-color: red', 1],
    ['focusRing', '& + &', 'outline-color: red', 1],
    ['hideDesktopUp', ':where(&).open', 'display: grid', 1],
    ['focusRing', '& > span', 'outline-color: red', 0],
    ['focusRing', '& :focus', 'outline-color: red', 0],
    ['focusRing', ':focus', 'outline-color: red', 0],
    ['focusRing', ':not(&)', 'outline-color: red', 0],
    ['focusRing', ':has(&)', 'outline-color: red', 0],
    ['focusRing', ':nth-child(1 of &)', 'outline-color: red', 0],
    ['focusRing', '&::before', 'outline-color: red', 0],
    ['focusRing', ':is(& > span)', 'outline-color: red', 0],
  ])('%s then %s { %s } reports %i', async (atom, selector, declaration, expected) => {
    const css = `.x { @nave ${atom}; ${selector} { ${declaration} } }`
    const warnings = await run(css)

    expect(warnings).toHaveLength(expected)
    expect(warnings.map((w) => w.column)).toEqual(expected === 1 ? [css.indexOf(selector) + 1] : [])
  })
})

describe.each(HOSTS)('AC-native-apply-order-14 — order decides (%s)', (_name, run) => {
  it.each([
    ['.x', 'hideDesktopUp', 'display: grid;', 1],
    ['.x', 'hideDesktopUp', 'display: grid !important;', 0],
    ['.x', 'hideImp', 'display: grid;', 0],
    ['.x', 'hideDesktopUp', '@layer consumer { display: grid; }', 0],
    ['.x', 'focusRing', '&:focus { outline: none }', 1],
    ['.x', 'focusRing', '&:focus-visible { outline: none }', 1],
    ['.x', 'focusRing', '&:focus { outline-style: none }', 1],
    ['.x', 'focusRing', 'outline: 0;', 0],
    ['.s1, #x .s2', 'hideDesktopUp', 'display: grid;', 1],
    ['.s1, #x .s2::before', 'focusRing', '& + & { outline-color: red }', 1],
    ['.x', 'focusRing', '&:focus-visible:hover { outline: none }', 0],
    ['.x', 'focusRing', '.dark &:focus-visible { outline: none }', 0],
    ['.x', 'focusRing', '&:focus:not(:focus-visible) { outline: none }', 0],
    ['.x', 'hideDesktopUp', '&.open { display: grid; }', 0],
    ['.s1, #x .s2', 'hideDesktopUp', '#y & { display: grid; }', 0],
    ['.s1, #x .s2', 'focusRing', '& + & { outline-color: red }', 0],
  ])('%s { @nave %s; %s } reports %i', async (parent, atom, later, expected) => {
    const css = `${parent} { @nave ${atom}; ${later} }`

    expect(await countOf(css, run)).toBe(expected)
  })
})

describe.each(HOSTS)('AC-native-apply-order-15 — conditions (%s)', (_name, run) => {
  it.each([
    ['hidePhoneOnly', '@media (width >= 37.5em)', 0],
    ['hidePhoneOnly', '@media (min-width: 37.5em)', 0],
    ['hidePhoneOnly', '@media (37.5em <= width)', 0],
    ['hidePhoneOnly', '@media (width >= 40em) and (width < 50em)', 0],
    ['hideTabletPortraitUp', '@media (30em < width < 37.5em)', 0],
    ['hideTabletPortraitUp', '@media (width <= 37.5em)', 1],
    ['hidePhoneOnly', '@media (width >= 30em)', 1],
    ['hidePhoneOnly', '@media (width >= 600px)', 1],
    ['hidePhoneOnly', '@media (width >= 37.5rem)', 1],
    ['hidePhoneOnly', '@media (height >= 40em)', 1],
    ['hidePhoneOnly', '@media (width >= 40em), print', 1],
    ['hidePhoneOnly', '@media (width >= 40em) or (orientation: landscape)', 1],
    ['hidePhoneOnly', '@media not all and (width < 37.5em)', 1],
    ['hidePhoneOnly', '@media screen and (width >= 40em)', 1],
    ['hidePhoneOnly', '@media (orientation: landscape)', 1],
    ['hidePhoneOnly', '@container (width >= 40em)', 1],
    ['hidePhoneOnly', '@supports (display: grid)', 1],
  ])('%s then %s reports %i', async (atom, wrapper, expected) => {
    expect(await countOf(`.x { @nave ${atom}; ${wrapper} { display: grid } }`, run)).toBe(expected)
    expect(await countOf(`.x { @nave ${atom}; ${wrapper} { & { display: grid } } }`, run)).toBe(
      expected,
    )
  })

  it.each([
    ['hideDesktopUp', '@media (max-width: 75em)', 1],
    ['hideDesktopUp', '@media (min-width: 75em) and (max-width: 75em)', 1],
    ['hideDesktopUp', '@media (max-width: 74.99em)', 0],
    ['mLe', '@media (min-width: 37.5em)', 1],
    ['mLe', '@media (min-width: 37.51em)', 0],
  ])(
    '%s then %s reads min- and max- as inclusive and reports %i',
    async (atom, wrapper, expected) => {
      expect(await countOf(`.x { @nave ${atom}; ${wrapper} { display: grid } }`, run)).toBe(
        expected,
      )
    },
  )

  it('takes the conjunction of the group rules around the declaration', async () => {
    const css =
      '.x { @nave hidePhoneOnly; @media (width >= 40em) { @media (width < 50em) { display: grid } } }'

    expect(await countOf(css, run)).toBe(0)
  })
})

describe.each(HOSTS)('AC-native-apply-order-16 — what counts as later (%s)', (_name, run) => {
  it.each([
    ['.x { display: grid; @nave hideDesktopUp; }', 0],
    ['.x { &.k { display: grid } @nave hideDesktopUp; }', 0],
    ['.x { @nave hideDesktopUp; @media (orientation: landscape) { display: grid } }', 1],
    ['.x { @nave focusRing; &:focus-visible { @media (x) { outline-color: red } } }', 1],
    ['.x { @nave focusRing; &:focus-visible { & > span { outline-color: red } } }', 0],
    ['.x { @nave hideDesktopUp; @starting-style { display: grid } }', 0],
    ['.x { @nave hideDesktopUp; @scope (.k) { & { display: grid } } }', 0],
    ['.x { @nave focusRing hideDesktopUp flex grid; }', 2],
    ['.x { @nave mA mB; }', 1],
  ])('%s reports %i', async (css, expected) => {
    expect(await countOf(css, run)).toBe(expected)
  })

  it('positions the mA mB warning at mB', async () => {
    const css = '.x { @nave mA mB; }'
    const warnings = await run(css, { extend: EXTEND })

    expect(warnings[0]).toMatchObject({ column: css.indexOf('mB') + 1 })
  })
})

describe.each(HOSTS)(
  'AC-native-apply-order-16 — a directive inside a nested rule counts as what it emits (%s)',
  (_name, run) => {
    const WIDE = 'under @media (width >= 75em)'
    const AFTER = 'comes after "hideDesktopUp"'

    it.each([
      [
        '.x { @nave hideDesktopUp; @media (width >= 75em) { & { @nave flex } } }',
        '@media (width >= 75em) {',
        `the @media (width >= 75em) block ${AFTER}, so ${WIDE} display is flex, not none.`,
        '.x { @media (width >= 75em) { & { @nave flex } } @nave hideDesktopUp; }',
      ],
      [
        '.x { @nave hideDesktopUp; @media (width >= 75em) { & { display: flex } } }',
        '@media (width >= 75em) {',
        `the @media (width >= 75em) block ${AFTER}, so ${WIDE} display is flex, not none.`,
        '.x { @media (width >= 75em) { & { display: flex } } @nave hideDesktopUp; }',
      ],
      [
        '.x { @nave hideDesktopUp; & { @nave flex } }',
        '& {',
        `the & block ${AFTER}, so ${WIDE} display is flex, not none.`,
        '.x { & { @nave flex } @nave hideDesktopUp; }',
      ],
      [
        '.x { @nave hideDesktopUp; &:where(.q) { @nave flex } }',
        '&:where(.q) {',
        `the &:where(.q) block ${AFTER}, so ${WIDE} while also on :where(.q), display is flex, not none.`,
        '.x { &:where(.q) { @nave flex } @nave hideDesktopUp; }',
      ],
      [
        '.x { @nave hideDesktopUp; &:where(.q) { @nave flex } @nave textLeft; }',
        '&:where(.q) {',
        `the &:where(.q) block ${AFTER}, so ${WIDE} while also on :where(.q), display is flex, not none.`,
        '.x { &:where(.q) { @nave flex } @nave hideDesktopUp; @nave textLeft; }',
      ],
    ])(
      '%s warns once, at the nested block, and the printed fixes clear it',
      async (css, at, sentence, fixed) => {
        const warnings = await run(css)

        expect(warnings).toHaveLength(1)
        expect(warnings[0]!.text.startsWith(`@nave: ${sentence} `)).toBe(true)
        expect(warnings[0]).toMatchObject({ line: 1, column: css.indexOf(at) + 1 })
        expect(await run(fixed)).toEqual([])
        const marker = /`(@nave [^`]*)`\s*$/.exec(warnings[0]!.text)![1]!
        expect(marker).toContain('nave-allow-override: display */')
        expect(await run(css.replace(/@nave hideDesktopUp;/, () => marker))).toEqual([])
      },
    )

    it('says the same for the nested directive as for the declaration it emits', async () => {
      const nested = await run('.x { @nave hideDesktopUp; &:where(.q) { @nave flex } }')
      const written = await run('.x { @nave hideDesktopUp; &:where(.q) { display: flex } }')

      expect(nested.map((w) => w.text)).toEqual(written.map((w) => w.text))
    })

    it('keeps the enclosing pseudo-class when the media block is written inside a bare &', async () => {
      const nested = await run(
        '.x { @nave srOnlyFocusable; &:focus-visible { @nave wFullPhoneOnly } }',
      )
      const viaBare = await run(
        '.x { @nave srOnlyFocusable; &:focus-visible { @media (width < 37.5em) { & { width: 100% } } } }',
      )
      const direct = await run(
        '.x { @nave srOnlyFocusable; &:focus-visible { @media (width < 37.5em) { width: 100% } } }',
      )
      const clause =
        'so on :focus-within while also on :focus-visible under @media (width < 37.5em), width is 100%, not auto.'

      expect(nested.at(-1)!.text).toContain(clause)
      expect(viaBare.map((w) => w.text)).toEqual(nested.map((w) => w.text))
      expect(direct.map((w) => w.text)).toEqual(nested.map((w) => w.text))
    })

    it('reads a marker as used when the override sits in a nested directive', async () => {
      const css =
        '.x { @nave /* nave-allow-override: display */ hideDesktopUp; &:where(.q) { @nave flex } @nave textLeft; }'

      expect(await run(css)).toEqual([])
    })

    it("compares a directive inside a nested rule with the outer rule's later content", async () => {
      expect(await run('.x { & { @nave hideDesktopUp } display: flex }')).toHaveLength(1)
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-16 — a nested directive is compared with what the enclosing rules hold after it (%s)',
  (_name, run) => {
    const SENTENCE =
      'comes after "hideDesktopUp", so under @media (width >= 75em) display is flex, not none.'

    it.each([
      [
        '.x { & { @nave hideDesktopUp } display: flex; }',
        'display: flex',
        'To let "hideDesktopUp" win, move display: flex above the & block.',
      ],
      [
        '.x { @media (width >= 75em) { & { @nave hideDesktopUp } } display: flex; }',
        'display: flex',
        'To let "hideDesktopUp" win, move display: flex above the @media (width >= 75em) block.',
      ],
      [
        '.x { & { & { @nave hideDesktopUp } } display: flex; }',
        'display: flex',
        'To let "hideDesktopUp" win, move display: flex above the & block.',
      ],
      [
        '.x { & { & { @nave hideDesktopUp } display: flex; } }',
        'display: flex',
        'To let "hideDesktopUp" win, move display: flex above the & block.',
      ],
    ])(
      '%s warns once, at the later declaration, without the sentence about the previous release',
      async (css, at, fix) => {
        const warnings = await run(css)

        expect(warnings).toHaveLength(1)
        expect(warnings[0]!.text.startsWith(`@nave: ${at} ${SENTENCE}`)).toBe(true)
        expect(warnings[0]!.text).toContain(fix)
        expect(warnings[0]!.text).not.toContain('Before @navecss/core')
        expect(warnings[0]).toMatchObject({ line: 1, column: css.indexOf(at) + 1 })
      },
    )

    it.each([
      '.x { &:hover { @nave hideDesktopUp } display: flex; }',
      '.x { display: flex; & { @nave hideDesktopUp } }',
      '.x { & { @nave hideDesktopUp } color: red; }',
    ])('%s reports nothing', async (css) => {
      expect(await run(css)).toEqual([])
    })

    it('pairs the blocks with a later directive of the enclosing rule too', async () => {
      const warnings = await run('.x { & { @nave hideDesktopUp } @nave flex; }')

      expect(warnings).toHaveLength(1)
      expect(warnings[0]!.text).toContain('"flex" comes after "hideDesktopUp"')
      expect(warnings[0]!.text).not.toContain('Before @navecss/core')
    })

    it('lets the marker on the inner directive silence it, and does not call that marker stale', async () => {
      const css =
        '.x { & { @nave /* nave-allow-override: display */ hideDesktopUp } display: flex; }'

      expect(await run(css)).toEqual([])
    })

    it('prints that marker in the warning, and the printed marker silences it', async () => {
      const css = '.x { & { @nave hideDesktopUp; } display: flex; }'
      const [warning] = await run(css)
      const marked = /`(@nave [^`]*)`\s*$/.exec(warning!.text)![1]!

      expect(marked).toBe('@nave /* nave-allow-override: display */ hideDesktopUp;')
      expect(await run(css.replace('@nave hideDesktopUp;', () => marked))).toEqual([])
    })

    it('still calls a marker on the inner directive stale when nothing overrides it', async () => {
      const found = await run(
        '.x { & { @nave /* nave-allow-override: display */ hideDesktopUp } color: red; }',
      )

      expect(found).toHaveLength(1)
      expect(found[0]!.text).toContain('names display, but nothing after the directive overrides')
    })

    it('reports nothing once the declaration is moved above the block', async () => {
      expect(await run('.x { display: flex; & { @nave hideDesktopUp } }')).toEqual([])
    })
  },
)

describe.each(HOSTS)('AC-native-apply-order-17 — consumer atoms (%s)', (_name, run) => {
  const extend: Record<string, AtomDefinition> = {
    myHide: {
      declarations: {},
      media: { '(width >= 75em)': { declarations: { display: 'none' } } },
    },
    myFlex: { declarations: { display: 'flex' } },
    myHidden: { declarations: { display: 'none' } },
    mySrf: {
      declarations: { position: 'absolute' },
      pseudos: {
        ':focus-visible': { position: 'static' },
        ':focus-within': { position: 'static' },
      },
    },
    myRel: { declarations: { position: 'relative' } },
    hx: EXTEND.hx!,
  }

  it.each([
    ['.x { @nave myHide myFlex; }', 1],
    ['.x { @nave myHide myHidden; }', 0],
    ['.x { @nave mySrf myRel; }', 0],
    ['.c { @nave hx; font-size: 20px }', 1],
  ])('%s reports %i', async (css, expected) => {
    expect(await run(css, { extend })).toHaveLength(expected)
  })
})

describe.each(HOSTS)('AC-native-apply-order-20 — values (%s)', (_name, run) => {
  it.each([
    ['display', 'none', 'NONE', 1],
    ['color', 'red', 'Red', 1],
    ['color', 'red', 'RED', 1],
    ['font-family', 'Arial', 'arial', 1],
    ['border', '1px solid red', '1px SOLID RED', 1],
    ['animation-name', 'Foo', 'foo', 1],
    ['grid-area', 'Main', 'main', 1],
    ['container-name', 'Foo', 'foo', 1],
    ['counter-reset', 'Foo', 'foo', 1],
    ['transition-property', 'Foo', 'foo', 1],
    ['--a', 'Foo', 'foo', 1],
    ['margin', '0 auto', '0    auto', 0],
    ['margin', '0 auto', '0 /* c */ auto', 0],
    ['width', 'var(--w)', 'VAR(--w)', 0],
    ['width', 'calc(1px + 2px)', 'CALC(1px + 2px)', 0],
    ['color', 'rgb(0 0 0)', 'RGB(0 0 0)', 0],
    ['width', 'var(--w)', 'var(--W)', 1],
    ['width', '--Fn(1px)', '--fn(1px)', 1],
    ['width', 'var(--w, 2px)', 'var(--w)', 1],
    ['width', '0', '0px', 1],
    ['width', '10px', '10PX', 1],
    ['color', '#fff', '#FFF', 1],
    ['content', '"a"', '"A"', 1],
    ['gap', '1rem', 'grid-gap: 1rem', 0],
  ])('%s: %s then %s reports %i', async (prop, before, after, expected) => {
    const extend = {
      m: { declarations: {}, media: { '(width >= 75em)': { declarations: { [prop]: before } } } },
    }
    const later = after.includes(':') ? after : `${prop}: ${after}`

    expect(await run(`.x { @nave m; ${later}; }`, { extend })).toHaveLength(expected)
  })

  it('never calls a shorthand equal to a longhand', async () => {
    const extend = {
      m2: {
        declarations: {},
        media: { '(width >= 75em)': { declarations: { 'outline-style': 'none' } } },
      },
    }

    expect(await run('.x { @nave m2; outline: none; }', { extend })).toHaveLength(1)
  })
})

describe.each(HOSTS)(
  'AC-native-apply-order-47 — an atom is not compared with itself (%s)',
  (_name, run) => {
    it('reports nothing for one atom, however many blocks it has', async () => {
      expect(await countOf('.x { @nave twoState; }', run)).toBe(0)
    })

    it('reports two for a later block of the same specificity (control)', async () => {
      expect(await countOf('.x { @nave twoState; &[data-c] { color: pink } }', run)).toBe(2)
    })

    it('reports four for the same atom under another name', async () => {
      expect(await countOf('.x { @nave twoState twoStateB; }', run)).toBe(4)
    })
  },
)

/**
 * The text of each warning.
 */
function texts(warnings: readonly { text: string }[]): string[] {
  return warnings.map((w) => w.text)
}

describe('AC-native-apply-order-16 — two nested directives, and a nested rule written over two lines', () => {
  it('prints the atoms of each of two nested directives, not the first one twice', async () => {
    const css = '.x { @nave hideDesktopUp; &:where(.q) { @nave flex } &:where(.r) { @nave block } }'

    for (const warnings of [warningsViaText(css), await warningsViaPostcss(css)]) {
      expect(warnings).toHaveLength(2)
      expect(warnings[0]!.text).toContain('display is flex, not none')
      expect(warnings[1]!.text).toContain('display is block, not none')
    }
  })

  it('reports a tree written over several lines in line order', async () => {
    const css = '.x {\n  &:hover { @nave hidePhoneOnly block }\n  @nave hideDesktopUp flex;\n}'
    const viaPostcss = await warningsViaPostcss(css)
    const viaText = warningsViaText(css)

    expect(viaText.map((w) => w.line)).toEqual([2, 3])
    expect(viaPostcss).toEqual(viaText)
  })

  it('keeps the enclosing holder for a bare & written over two lines, and takes the nested one otherwise', async () => {
    const bare = '.x { @nave srOnlyFocusable; &:focus-visible { &\n{ @nave wFullPhoneOnly } } }'
    const direct = '.x { @nave srOnlyFocusable; &:focus-visible { @nave wFullPhoneOnly } }'
    const named = '.x { @nave srOnlyFocusable; &:focus-visible { &:where(.q) { margin: 4px } } }'

    expect(texts(warningsViaText(bare))).toEqual(texts(warningsViaText(direct)))
    expect(texts(await warningsViaPostcss(bare))).toEqual(texts(warningsViaText(direct)))
    for (const warnings of [warningsViaText(named), await warningsViaPostcss(named)]) {
      expect(warnings[0]!.text).toContain('while also on :where(.q), margin is 4px, not 0')
    }
  })
})

const OUTWARD_EXTEND: Record<string, AtomDefinition> = {
  fx: { declarations: {}, media: { '(width >= 60em)': { declarations: { color: 'blue' } } } },
  fz: { declarations: {}, media: { '(width >= 30em)': { declarations: { color: 'red' } } } },
  mp: {
    declarations: {},
    media: { '(width >= 60em)': { declarations: {}, pseudos: { ':hover': { color: 'blue' } } } },
  },
}

/**
 * The text of each warning.
 */
function textsOf(warnings: readonly { text: string }[]): string[] {
  return warnings.map((w) => w.text)
}

describe.each(HOSTS)(
  'AC-native-apply-order-16 — a nested directive and later content inside one group (%s)',
  (_name, run) => {
    it.each([
      [
        '.x { @media (width >= 60em) { & { @nave hideDesktopUp } display: flex } }',
        'display: flex',
      ],
      [
        '.x { @media (width >= 60em) { & { & { @nave hideDesktopUp } } display: flex } }',
        'display: flex',
      ],
      [
        '.x { & { @media (width >= 60em) { & { @nave hideDesktopUp } display: flex } } }',
        'display: flex',
      ],
      [
        '.x { @media (width >= 60em) { & { @nave hideDesktopUp } & { display: flex } } }',
        '& { display',
      ],
      [
        '.x { @supports (display: grid) { & { @nave hideDesktopUp } display: flex } }',
        'display: flex',
      ],
      [
        '.x { @media (width >= 60em) { & { @nave hideDesktopUp } } @media (width >= 60em) { display: flex } }',
        '@media (width >= 60em) { display',
      ],
    ])('%s warns once, at the later content', async (css, at) => {
      const warnings = await run(css)

      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatchObject({ column: css.lastIndexOf(at) + 1 })
      expect(warnings[0]!.text).not.toContain('Before @navecss/core')
    })

    it('names the block inside the group in the fix, never the group', async () => {
      const [warning] = await run(
        '.x { @media (width >= 60em) { & { @nave hideDesktopUp } display: flex } }',
      )

      expect(warning!.text).toContain('move display: flex above the & block.')
    })

    it.each([
      '.x { @media (width >= 60em) { & { @nave hideDesktopUp } &.m { display: flex } } }',
      '.x { @media (width >= 60em) { display: flex; & { @nave hideDesktopUp } } }',
    ])('%s reports nothing', async (css) => {
      expect(await run(css)).toEqual([])
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-16 — what the outward pairs read, pinned (%s)',
  (_name, run) => {
    it("puts the groups on the path into the block's condition, so disjoint ones do not warn", async () => {
      expect(
        await run('.x { @media (width < 60em) { & { @nave hideDesktopUp } } display: flex; }'),
      ).toEqual([])
    })

    it("reads the pseudo blocks inside a directive's media block", async () => {
      const [warning] = await run('.x { & { @nave mp } &:hover { color: red } }', {
        extend: OUTWARD_EXTEND,
      })

      expect(warning!.text).toContain(
        'the &:hover block comes after "mp", so on :hover under @media (width >= 60em) color is red, not blue',
      )
    })

    it('names the later directive in the fix', async () => {
      const [warning] = await run('.x { & { @nave hideDesktopUp } @nave flex; }')

      expect(warning!.text).toContain('move the directive that names "flex" above the & block.')
    })

    it('does not read an auto inside a function as the style keyword', async () => {
      const warnings = await run('.x { @nave focusRing; &:focus { outline: 0 foo(auto) } }')

      expect(warnings.some((w) => w.text.includes('keyboard focus indicator'))).toBe(true)
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-26 — a fix that cannot clear a pair is not printed (%s)',
  (_name, run) => {
    it('prints the marker only where the later directive carries blocks that overlap with a different value', async () => {
      const [warning] = await run('.x { & { @nave fx } @nave fz }', { extend: OUTWARD_EXTEND })

      expect(warning!.text).toContain('"fz" comes after "fx"')
      expect(warning!.text).not.toContain('To let')
      expect(warning!.text).toContain('If "fz" is meant to win, mark the directive')
    })

    const CONTAINERS = [
      '& { @nave fx }',
      '&.m { @nave fx }',
      '@media (width >= 60em) { & { @nave fx } }',
    ]
    const LATER = [
      'color: red;',
      '@nave fz;',
      '@nave textLeft;',
      '@media (width >= 30em) { color: red }',
      '& { color: red }',
      '@nave textLeft fz;',
    ]

    /**
     * The warnings of "comes after" kind in `css`.
     */
    async function pairsIn(css: string): Promise<string[]> {
      const warnings = await run(css, { extend: OUTWARD_EXTEND })
      return textsOf(warnings).filter((text) => text.includes('comes after'))
    }

    it.each(CONTAINERS.flatMap((container) => LATER.map((later) => [container, later] as const)))(
      'applying every printed fix of %s then %s clears its warning',
      async (container, later) => {
        const css = `.x { ${container} ${later} }`
        const [text] = await pairsIn(css)
        const marker = /`(@nave [^`]*)`\s*$/.exec(text ?? '')?.[1] ?? ''
        const directive = /@nave [^}]*/.exec(container)![0].trim()
        const hasMove = (text ?? '').includes('To let')
        const moved = hasMove ? `.x { ${later} ${container} }` : '.x { }'
        const markedCss = css.split(directive).join(marker.replace(/;$/, ''))

        expect(await pairsIn(moved)).toEqual([])
        expect(await pairsIn(text === undefined ? '.x { }' : markedCss)).toEqual([])
      },
    )
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-25 — an outward warning names its blocks and its place (%s)',
  (_name, run) => {
    const OPEN = 'so under @media (width >= 75em) display is flex, not none.'
    const MARKED =
      'If it is meant to win, mark the directive that names "hideDesktopUp": `@nave /* nave-allow-override: display */ hideDesktopUp;`'

    it.each([
      [
        '.x { & { @nave hideDesktopUp } & { display: flex } }',
        `@nave: the second & block comes after "hideDesktopUp", ${OPEN} To let "hideDesktopUp" win, move the second & block above the first & block. ${MARKED}`,
      ],
      [
        '.x { & { @nave hideDesktopUp } & { color: red } display: flex; }',
        `@nave: display: flex comes after "hideDesktopUp", ${OPEN} To let "hideDesktopUp" win, move display: flex above the first & block. ${MARKED}`,
      ],
      [
        '.x {\n  :where(.dark)\n  & { @nave hideDesktopUp }\n  display: flex;\n}',
        `@nave: display: flex comes after "hideDesktopUp", so on :where(.dark) & under @media (width >= 75em) display is flex, not none. To let "hideDesktopUp" win, move display: flex above the :where(.dark) & block. ${MARKED}`,
      ],
      [
        '.x { &:where(.q) { @nave hideDesktopUp } display: flex; }',
        `@nave: display: flex comes after "hideDesktopUp", so on :where(.q) under @media (width >= 75em) display is flex, not none. To let "hideDesktopUp" win, move display: flex above the &:where(.q) block. ${MARKED}`,
      ],
      [
        '.x { &.q { @nave hideDesktopUp } &.open { display: flex } }',
        `@nave: the &.open block comes after "hideDesktopUp", so on .q under @media (width >= 75em) while also on .open, display is flex, not none. To let "hideDesktopUp" win, move the &.open block above the &.q block. ${MARKED}`,
      ],
      [
        '.x { &:where(.q) { &:where(.r) { @nave hideDesktopUp } } display: flex; }',
        `@nave: display: flex comes after "hideDesktopUp", so on :where(.q):where(.r) under @media (width >= 75em) display is flex, not none. To let "hideDesktopUp" win, move display: flex above the &:where(.q) block. ${MARKED}`,
      ],
      [
        '.x { @media (width >= 30em) { & { @nave hideDesktopUp } } @media (width >= 30em) { & { display: flex } } }',
        `@nave: the second @media (width >= 30em) block comes after "hideDesktopUp", so under @media (width >= 75em) and @media (width >= 30em) display is flex, not none. To let "hideDesktopUp" win, move the second @media (width >= 30em) block above the first @media (width >= 30em) block. ${MARKED}`,
      ],
    ])('%j prints one text, byte for byte', async (css, text) => {
      const warnings = await run(css)

      expect(warnings.map((w) => w.text)).toEqual([text])
    })

    it('names each of two sibling containers by its place', async () => {
      const warnings = await run(
        '.x { & { @nave hideDesktopUp } & { @nave hideDesktopUp } display: flex; }',
      )

      expect(warnings).toHaveLength(2)
      expect(warnings[0]!.text).toContain('move display: flex above the first & block.')
      expect(warnings[1]!.text).toContain('move display: flex above the second & block.')
    })

    it('says "while also" for a state only once, through a path and a list', async () => {
      const ring = await run('.x { &:where(.q) { @nave focusRing } &:focus { outline: none } }')
      const list = await run(
        '.x { &:where(.a), &:where(.b) { @nave focusRing } &:focus { outline: none } }',
      )

      expect(ring[0]!.text).toContain(
        'the &:focus block comes after "focusRing", so on :where(.q):focus-visible outline: none replaces',
      )
      expect(ring[0]!.text).toContain('move the &:focus block above the &:where(.q) block.')
      expect(list[0]!.text).toContain(
        'so on :is(&:where(.a), &:where(.b)):focus-visible outline: none replaces',
      )
      expect(list[0]!.text).not.toContain('while also')
    })

    it('leaves a same-rule pair with two blocks of one selector as it was', async () => {
      const [warning] = await run(
        '.x { @nave hideDesktopUp; & { color: red } & { display: flex } }',
      )

      expect(warning!.text).toContain('the & block comes after "hideDesktopUp"')
      expect(warning!.text).toContain('move the & block above the directive.')
      expect(textsOf([warning!])[0]).not.toContain('first')
    })
  },
)

describe.each(HOSTS)(
  'AC-native-apply-order-16 — a pseudo-element rule has no outward pair (%s)',
  (_name, run) => {
    it.each([
      '.x::before { & { @nave hideDesktopUp } display: flex; }',
      '.x::before, .y::after { & { @nave hideDesktopUp } display: flex; }',
    ])('%s reports nothing', async (css) => {
      expect(await run(css)).toEqual([])
    })
  },
)
