/**
 * AC-native-order-migration-removal-05, Tier B: in Chromium, the output the plugin prints for
 * each row computes the row's value, from the PostCSS host and from the text expander alike. The
 * rows are the 33 of `helpers/native-order-outcome-rows.ts` (the criterion before this one
 * pins them); the last test checks the viewport the rows name is the one the media queries read.
 */
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
import { OUTCOME_ROWS } from '../helpers/native-order-outcome-rows.ts'
import { computed, mountPlacement, viaPostcssInPage } from './native-order-mount.ts'

describe.each(OUTCOME_ROWS.map((row) => [row.id, row] as const))(
  'AC-native-order-migration-removal-05 - %s',
  (_id, row) => {
    const { property } = row.measure

    it('the PostCSS host’s output computes the value', async () => {
      expect(
        await computed(await viaPostcssInPage(row.input, row.extend), row.measure, property),
      ).toBe(row.now)
    })

    it('the text expander’s output computes the value', async () => {
      const css = expandText(row.input, row.extend === undefined ? {} : { extend: row.extend }).css

      expect(await computed(css, row.measure, property)).toBe(row.now)
    })
  },
)

describe('AC-native-order-migration-removal-05 - the measurements can tell the outputs apart', () => {
  it('the viewport the row names is the one the media queries read', async () => {
    await mountPlacement('', { focused: false, html: '<p>x</p>', selector: 'p', width: 375 })

    expect(globalThis.matchMedia('(width < 37.5em)').matches).toBe(true)
    expect(globalThis.matchMedia('(width >= 75em)').matches).toBe(false)
  })
})
