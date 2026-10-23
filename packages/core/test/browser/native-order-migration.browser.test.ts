/**
 * AC-native-apply-order-33, Tier B: in Chromium, the output of the release before this change
 * (committed in `fixtures/migration-old-placement.ts`) computes the old value for each row and
 * the output the plugin prints now computes the new one. Where a warning carries the sentence
 * "Before @navecss/core ... won", the old value is the value the overridden block sets, so the
 * sentence is true of the old output. The fixture lives with the migration module.
 */
import { describe, expect, it } from 'vitest'

import { expandText } from '../../src/directive/expand-text.ts'
import { OLD_PLACEMENT } from '../fixtures/migration-old-placement.ts'
import { ELEMENT_COLOR, MIGRATION_ROWS, type MigrationRow } from '../helpers/migration-rows.ts'
import { computed, mountPlacement, viaPostcssInPage } from './native-order-mount.ts'

const OLD_ROWS = new Map(OLD_PLACEMENT.map((row) => [row.id, row]))

/**
 * What a value of the row's table stands for on the element: its own `color` for `currentColor`.
 */
async function expected(row: MigrationRow, value: string): Promise<string> {
  if (value !== ELEMENT_COLOR) return value
  const element = await mountPlacement('', row.measure)
  return getComputedStyle(element).color
}

describe.each(MIGRATION_ROWS.map((row) => [row.id, row] as const))(
  'AC-native-apply-order-33 - %s',
  (_id, row) => {
    const { property } = row.measure
    const old = OLD_ROWS.get(row.id)!

    it('the committed PostCSS output computes the old value', async () => {
      expect(await computed(old.postcss, row.measure, property)).toBe(await expected(row, row.was))
    })

    it('the committed text-expander output computes the old value', async () => {
      expect(await computed(old.text ?? old.postcss, row.measure, property)).toBe(
        await expected(row, row.textWas ?? row.was),
      )
    })

    it('the PostCSS host’s output now computes the new value', async () => {
      expect(
        await computed(await viaPostcssInPage(row.input, row.extend), row.measure, property),
      ).toBe(row.now)
    })

    it('the text expander’s output now computes the new value', async () => {
      const css = expandText(row.input, row.extend === undefined ? {} : { extend: row.extend }).css

      expect(await computed(css, row.measure, property)).toBe(row.now)
    })
  },
)

describe('AC-native-apply-order-33 - the measurements can tell the outputs apart', () => {
  it('the viewport the row names is the one the media queries read', async () => {
    await mountPlacement('', { focused: false, html: '<p>x</p>', selector: 'p', width: 375 })

    expect(globalThis.matchMedia('(width < 37.5em)').matches).toBe(true)
    expect(globalThis.matchMedia('(width >= 75em)').matches).toBe(false)
  })
})
