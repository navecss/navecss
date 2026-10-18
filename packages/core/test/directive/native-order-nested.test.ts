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
}

/**
 * The count of warnings `css` draws from each host, which must agree.
 */
async function countOf(
  css: string,
  run: (css: string, options?: object) => Promise<unknown[]>,
): Promise<number> {
  const warnings = await run(css, { extend: EXTEND })
  return warnings.length
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
    ['display', 'none', 'NONE', 0],
    ['color', 'red', 'Red', 0],
    ['margin', '0 auto', '0    auto', 0],
    ['margin', '0 auto', '0 /* c */ auto', 0],
    ['width', 'var(--w)', 'VAR(--w)', 0],
    ['width', 'calc(1px + 2px)', 'CALC(1px + 2px)', 0],
    ['width', 'var(--w)', 'var(--W)', 1],
    ['width', 'var(--w, 2px)', 'var(--w)', 1],
    ['width', '0', '0px', 1],
    ['width', '10px', '10PX', 1],
    ['color', '#fff', '#FFF', 1],
    ['content', '"a"', '"A"', 1],
  ])('%s: %s then %s reports %i', async (prop, before, after, expected) => {
    const extend = {
      m: { declarations: {}, media: { '(width >= 75em)': { declarations: { [prop]: before } } } },
    }

    expect(await run(`.x { @nave m; ${prop}: ${after}; }`, { extend })).toHaveLength(expected)
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
