/**
 * The text of the order warnings: the worked instances byte for byte after the host's frame, the
 * parts in their order, and the forms a value clause takes. Every instance is asserted through
 * both hosts, which frame a warning with the position it is reported at.
 */
import { describe, expect, it } from 'vitest'

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
