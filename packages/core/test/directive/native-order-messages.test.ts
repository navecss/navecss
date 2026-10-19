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
