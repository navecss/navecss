/**
 * AC-native-apply-order-33, Tier A: the first-minor fixtures. For every input the migration
 * covers, the output of the release before this one (committed in
 * `fixtures/migration-old-placement.ts`, generated once from `git archive` of that release)
 * and the output the plugin prints now are not equivalent, except for the one row whose outcome
 * the move leaves alone. The fixture lives with the migration module and is removed with it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  OLD_PLACEMENT,
  OLD_PLACEMENT_COMMAND,
  OLD_PLACEMENT_COMMIT,
} from './fixtures/migration-old-placement.ts'
import { isEquivalent } from './helpers/css-equivalence.ts'
import { MIGRATION_ROWS, type MigrationRow } from './helpers/migration-rows.ts'
import { viaPostcss, viaText } from './helpers/native-order.ts'

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/migration-old-placement.ts')
const OLD = new Map(OLD_PLACEMENT.map((row) => [row.id, row]))

/**
 * Orders two strings, for a comparison of lists whose order is not the point.
 */
function byText(a: string, b: string): number {
  return a.localeCompare(b)
}

/**
 * The committed output of the release before this change for `row`, from the host asked for: the
 * text expander's where it differs from the PostCSS host's, the PostCSS host's otherwise.
 */
function oldOutput(row: MigrationRow, host: 'postcss' | 'text'): string {
  const old = OLD.get(row.id)
  if (old === undefined) throw new Error(`the fixture holds no row "${row.id}"`)
  return host === 'text' ? (old.text ?? old.postcss) : old.postcss
}

describe('AC-native-apply-order-33 - the committed fixture', () => {
  it('names the commit it was generated from and the command that generated it', () => {
    const header = readFileSync(FIXTURE, 'utf8').split('*/', 1)[0]!

    expect(OLD_PLACEMENT_COMMIT).toMatch(/^256384a7[\da-f]{32}$/)
    expect(OLD_PLACEMENT_COMMAND).toContain('git archive 256384a7')
    expect(OLD_PLACEMENT_COMMAND).toContain('scripts/generate-migration-old-placement.ts')
    expect(header).toContain(OLD_PLACEMENT_COMMIT)
    expect(header).toContain(OLD_PLACEMENT_COMMAND)
  })

  it('holds exactly the rows the migration covers: 22 pairs, 4 focus shapes, 5 shapes, 2 more', () => {
    expect(MIGRATION_ROWS).toHaveLength(33)
    expect(OLD.keys().toArray().toSorted(byText)).toEqual(
      MIGRATION_ROWS.map((row) => row.id).toSorted(byText),
    )
  })

  it('holds a text-expander output apart from the PostCSS host’s for three rows, whose last declaration has no semicolon', () => {
    const apart = OLD_PLACEMENT.filter((row) => row.text !== undefined).map((row) => row.id)

    expect(apart.toSorted(byText)).toEqual(
      [
        '.s1, #x .s2 { @nave hideDesktopUp; color: red } .s1.k { color: blue }',
        '.p::before { content: "x"; @nave hideDesktopUp; display: block; width: 10px }',
        '.a, .b::before { content: "x"; @nave hideDesktopUp; width: 10px }',
      ].toSorted(byText),
    )
    expect(apart.every((id) => /[^;]\s+@media/.test(OLD.get(id)!.text!))).toBe(true)
  })

  it('is read by the equivalence it is judged with: an output is equivalent to itself, not to another', () => {
    const [first, second] = MIGRATION_ROWS
    expect(isEquivalent(oldOutput(first!, 'postcss'), oldOutput(first!, 'postcss'))).toBe(true)
    expect(isEquivalent(oldOutput(first!, 'postcss'), oldOutput(second!, 'postcss'))).toBe(false)
  })
})

describe.each(MIGRATION_ROWS.map((row) => [row.id, row] as const))(
  'AC-native-apply-order-33 - %s',
  (_id, row) => {
    const options = row.extend === undefined ? {} : { extend: row.extend }
    const verdict = row.equivalent ? 'is equivalent to' : 'is not equivalent to'

    it(`the PostCSS host's output ${verdict} the committed one`, async () => {
      const now = await viaPostcss(row.input, options)

      expect(isEquivalent(now, oldOutput(row, 'postcss'))).toBe(row.equivalent)
    })

    it(`the text expander's output ${verdict} the committed one`, () => {
      const now = viaText(row.input, options)

      expect(isEquivalent(now, oldOutput(row, 'text'))).toBe(row.equivalent)
    })
  },
)
