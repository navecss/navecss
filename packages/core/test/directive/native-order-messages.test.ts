/**
 * The text of the order warnings: the worked instances byte for byte after the host's frame, the
 * parts in their order, and the forms a value clause takes. Every instance is asserted through
 * both hosts, which frame a warning with the position it is reported at.
 */
import { describe, expect, it } from 'vitest'

import type { AtomDefinition } from '../../src/atoms.ts'

import { warningsViaPostcss, warningsViaText } from '../helpers/native-order.ts'
import { ORDER_INSTANCES } from '../helpers/worked-instances.ts'

const FILE = 'x.css'

/**
 * Each warning as a host frames it: `file:line:column: text`.
 */
function framed(warnings: readonly { column: number; line: number; text: string }[]): string[] {
  return warnings.map(({ column, line, text }) => `${FILE}:${line}:${column}: ${text}`)
}

describe.each(ORDER_INSTANCES)('AC-native-apply-order-25 — $name', (instance) => {
  it('prints through the PostCSS host exactly as written', async () => {
    const warnings = await warningsViaPostcss(
      instance.css,
      instance.extend ? { extend: instance.extend } : {},
    )

    expect(framed(warnings)).toEqual(instance.lines)
  })

  it('prints through the text expander exactly as written', () => {
    const warnings = warningsViaText(
      instance.css,
      instance.extend ? { extend: instance.extend } : {},
    )

    expect(framed(warnings)).toEqual(instance.lines)
  })
})

const CX: Record<string, AtomDefinition> = {
  cx: {
    declarations: {},
    media: { '(width >= 75em)': { declarations: { '--gap': '1px', display: 'none' } } },
  },
}

describe('AC-native-apply-order-25 — the text of a warning is the same in both hosts', () => {
  it.each([
    [
      '.x { @nave hideDesktopUp; display: flex /* why */; }',
      'display: flex comes after "hideDesktopUp", so under @media (width >= 75em) display is flex, not none.',
      'move display: flex above the directive',
    ],
    [
      '.x { @nave cx; --gap: 2px }',
      '--gap: 2px comes after "cx", so under @media (width >= 75em) --gap is 2px, not 1px.',
      'move --gap: 2px above the directive',
    ],
    [
      '.x { @nave cx; --gap:   2px   /* c */  ; }',
      '--gap: 2px comes after "cx", so under @media (width >= 75em) --gap is 2px, not 1px.',
      'move --gap: 2px above the directive',
    ],
  ])('%s prints one text', async (css, sentence, fix) => {
    const viaPostcss = await warningsViaPostcss(css, { extend: CX })
    const viaText = warningsViaText(css, { extend: CX })

    expect(viaPostcss).toEqual(viaText)
    expect(viaText).toHaveLength(1)
    expect(viaText[0]!.text.startsWith(`@nave: ${sentence}`)).toBe(true)
    expect(viaText[0]!.text).toContain(
      `To let "${css.includes('hideDesktopUp') ? 'hideDesktopUp' : 'cx'}" win, ${fix}.`,
    )
    expect(viaText[0]!.text).not.toMatch(/ {2}| [,.]/)
  })

  it('prints no stray space around a comment inside a value', async () => {
    const css = '.x { @nave hideDesktopUp; display: flex /* a */ /* b */; }'

    expect(await warningsViaPostcss(css)).toEqual(warningsViaText(css))
  })
})

const PRINTED: Record<string, AtomDefinition> = {
  cq: {
    declarations: {},
    media: { '(width >= 75em)': { declarations: { content: '"a  b"' } } },
  },
  layoutA: {
    declarations: {},
    media: {
      '(width >= 75em)': {
        declarations: { 'grid-template-areas': '"header  header" "side    main"' },
      },
    },
  },
  ff: {
    declarations: {},
    media: { '(width >= 75em)': { declarations: { 'font-family': 'Foo, serif' } } },
  },
  mm: {
    declarations: {},
    media: { '(width >= 75em)': { declarations: { margin: '0 auto' } } },
  },
}

describe('AC-native-apply-order-25 — a printed value keeps its strings and its tokens apart', () => {
  it.each([
    [
      '.x { @nave cq; content: "a   b"; }',
      'content: "a   b" comes after "cq", so under @media (width >= 75em) content is "a   b", not "a  b".',
    ],
    [
      '.x { @nave cq; content: "a b"; }',
      'content: "a b" comes after "cq", so under @media (width >= 75em) content is "a b", not "a  b".',
    ],
    [
      '.x { @nave layoutA; grid-template-areas: "header header" "side main"; }',
      'grid-template-areas: "header header" "side main" comes after "layoutA", so under @media (width >= 75em) grid-template-areas is "header header" "side main", not "header  header" "side    main".',
    ],
    [
      '.x { @nave ff; font-family: Arial /* c */, serif; }',
      'font-family: Arial, serif comes after "ff", so under @media (width >= 75em) font-family is Arial, serif, not Foo, serif.',
    ],
    [
      '.x { @nave ff; font-family: Arial/* c */, serif; }',
      'font-family: Arial, serif comes after "ff", so under @media (width >= 75em) font-family is Arial, serif, not Foo, serif.',
    ],
    [
      '.x { @nave ff; font-family: Arial, /* c */ serif; }',
      'font-family: Arial, serif comes after "ff", so under @media (width >= 75em) font-family is Arial, serif, not Foo, serif.',
    ],
    [
      '.x { @nave mm; margin: 0/* c */auto; }',
      'margin: 0 auto comes after "mm", so under @media (width >= 75em) margin is 0 auto, not 0 auto.',
    ],
  ])('%s prints %s', async (css, sentence) => {
    const viaPostcss = await warningsViaPostcss(css, { extend: PRINTED })
    const viaText = warningsViaText(css, { extend: PRINTED })

    expect(viaText).toHaveLength(1)
    expect(viaText[0]!.text.startsWith(`@nave: ${sentence}`)).toBe(true)
    expect(viaPostcss).toEqual(viaText)
  })
})

const PINNED: Record<string, AtomDefinition> = {
  pv: {
    declarations: {},
    media: {
      '(width >= 75em)': {
        declarations: {
          background: 'blue',
          color: 'blue',
          'grid-template-columns': '1px',
          margin: '0',
        },
      },
    },
  },
}

describe('AC-native-apply-order-25 — a dropped comment leaves the tokens it separated apart, and no others', () => {
  it.each([
    ['color: rgb( /* c */ 0 0 0)', 'color: rgb(0 0 0)'],
    ['color: rgb(0 0 0)', 'color: rgb(0 0 0)'],
    ['margin: calc((/* c */ 1px) + 0px)', 'margin: calc((1px) + 0px)'],
    ['grid-template-columns: [/* c */ a /* d */] 1px', 'grid-template-columns: [a] 1px'],
    ['margin: 1px/* c */2px', 'margin: 1px 2px'],
    ['margin: 1%/* c */2%', 'margin: 1% 2%'],
    ['color: #fff/* c */#000', 'color: #fff #000'],
    ['color: red/* c */rgb(0 0 0)', 'color: red rgb(0 0 0)'],
    ['background: red/* c */url(a.png)', 'background: red url(a.png)'],
    ['margin: 1px 2px,3px', 'margin: 1px 2px,3px'],
  ])('%s prints %s', async (declaration, printed) => {
    const css = `.x { @nave pv; ${declaration}; }`
    const viaText = warningsViaText(css, { extend: PINNED })
    const viaPostcss = await warningsViaPostcss(css, { extend: PINNED })

    expect(viaText).toHaveLength(1)
    expect(viaText[0]!.text.startsWith(`@nave: ${printed} comes after "pv"`)).toBe(true)
    expect(viaPostcss).toEqual(viaText)
  })
})
