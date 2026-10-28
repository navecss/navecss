/**
 * The helper that sets `focusRing` aside, so the signed figures stay figures of the sheet without
 * it. Where the role has blocks of its own `focusRing`'s `outline: none` sits alone in a `& { }`
 * written after them, and the helper must take that rule away whole.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { sha256 } from './support/draft-states.ts'
import { expectedSheet, withoutRing } from './support/feedback-states.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

// The same figure as `COMBINED_SHA256` and `COMBINED_BYTES` in the golden's test: the all-signed
// sheet without `focusRing`.
const COMBINED_SHA256 = '345d7d25fc2abe3bfe620cf79a2c1267f41c211ad3cae658fc2f1b9340e66740'
const COMBINED_BYTES = 37_312

const golden = readFileSync(path.join(PACKAGE_DIR, 'test/fixtures/generated/styles.css'), 'utf8')

const EMPTY_WRAPPER = /&\s*\{\s*\}/g

// A scratch helper that takes out the declaration alone: the ring rule, and `outline: none;`
// wherever it stands.
const declarationOnly = (css: string): string =>
  css.replaceAll(/&:focus-visible\{[^}]*\}\s/g, '').replaceAll(/outline: none; ?/g, '')

describe('AC-native-apply-order-53: withoutRing reads the wrapped form as well as the inline one', () => {
  it('turns the golden into the all-signed sheet without focusRing, on 15 classes', () => {
    const ringless = withoutRing(golden)

    expect(ringless.count).toBe(15)
    expect(ringless.text).toBe(expectedSheet())
    expect(Buffer.byteLength(ringless.text)).toBe(COMBINED_BYTES)
    expect(sha256(ringless.text)).toBe(COMBINED_SHA256)
  })

  it('holds the outline in 14 wrapped rules and one inline declaration, and leaves neither behind', () => {
    const ringless = withoutRing(golden).text

    expect(golden.match(/&\{ outline: none;\n {4}\} /g)).toHaveLength(14)
    expect(golden.match(/ outline: none; /g)).toHaveLength(1)
    expect(ringless).not.toContain('outline: none')
    expect(ringless.match(EMPTY_WRAPPER)).toBeNull()
  })

  it('reds when a helper strips only the declaration and leaves an empty wrapper (control)', () => {
    const scratch = declarationOnly(golden)

    expect(scratch.match(EMPTY_WRAPPER)).toHaveLength(14)
    expect(scratch).not.toBe(expectedSheet())
    expect(sha256(scratch)).not.toBe(COMBINED_SHA256)
  })

  it('does not take a wrapped rule that holds something else (control)', () => {
    const other = '&{ color: red;\n    } '

    expect(withoutRing(`.x { ${other}}`).text).toBe(`.x { ${other}}`)
  })
})
