import type { AtomName } from '@navecss/core/atoms'

import { toClassName } from '@navecss/core/atoms'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildStyles } from '../scripts/build-styles.ts'
import { focusRingAtoms } from '../styles/atoms.ts'
import { isFocusRingDeclaration } from './support/focus.ts'
import { flatten, PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'
import { focusRingClasses } from './support/table-p.ts'

const fixture = (name: string): string =>
  readFileSync(path.join(PACKAGE_DIR, 'test/fixtures/generated', name), 'utf8')

const GOLDEN = 'styles.css'
const INDEPENDENT_BUILD = 'independent-build.css'
// The same agreed bytes built a second time, independently of this package's atoms, with the
// Slider block and the hit areas both in and before `focusRing` is composed in. Held by hash so
// the copy cannot drift from what was agreed.
const INDEPENDENT_BUILD_SHA256 = 'f1520ca5ff0af53aa37065dc6431add6b935b30f455679d5585ddb4503526cca'

// To regenerate the golden when a change to the stylesheet is intended:
//   pnpm --filter @navecss/base-ui run build
//   cp packages/base-ui/dist/styles.css packages/base-ui/test/fixtures/generated/styles.css

const rulesOf = (css: string): string[] => css.split(/\n(?=\s*\.nave-base-ui-)/)

const firstDifferingRule = (built: string, golden: string): string | undefined => {
  const mine = rulesOf(built)
  const differing = rulesOf(golden).find((rule, index) => mine[index] !== rule)
  return differing === undefined ? undefined : /\.nave-base-ui-[\w-]+/.exec(differing)?.[0]
}

const withoutFocusRing = (css: string): unknown[][] =>
  flatten(css)
    .filter((item) => !isFocusRingDeclaration(item))
    .map((item) => [item.atRules, item.selectors, item.property, item.value])

describe('AC-base-ui-bridge-41: the golden of the built stylesheet reds on drift', () => {
  it('is byte-identical to the committed golden', async () => {
    expect(await buildStyles()).toBe(fixture(GOLDEN))
  })

  it('is what dist/styles.css holds', async () => {
    expect(readStylesheet()).toBe(await buildStyles())
  })

  it('reds when a value in the arrow left rule changes, at that rule', () => {
    const golden = fixture(GOLDEN)
    const drifted = golden.replace('right: -4px; rotate: -45deg', 'right: -5px; rotate: -45deg')

    expect(drifted).not.toBe(golden)
    expect(firstDifferingRule(drifted, golden)).toBe('.nave-base-ui-arrow')
  })

  it("reds when the input's invalid rule is deleted, at that rule", () => {
    const golden = fixture(GOLDEN)
    const rule = golden.indexOf('.nave-base-ui-input {')
    const start = golden.indexOf('&[aria-invalid="true"]{', rule)
    const end = golden.indexOf('}', start) + 1
    const drifted = golden.slice(0, start) + golden.slice(end)

    expect(drifted).not.toBe(golden)
    expect(firstDifferingRule(drifted, golden)).toBe('.nave-base-ui-input')
  })
})

describe('AC-base-ui-bridge-03: the built stylesheet is the agreed one', () => {
  it('holds the independent build byte for byte', () => {
    expect(createHash('sha256').update(fixture(INDEPENDENT_BUILD)).digest('hex')).toBe(
      INDEPENDENT_BUILD_SHA256,
    )
  })

  it('has the same ordered (at-rule path, selector path, property, value) list once focusRing is set aside', () => {
    expect(withoutFocusRing(readStylesheet())).toEqual(withoutFocusRing(fixture(INDEPENDENT_BUILD)))
    expect(flatten(fixture(INDEPENDENT_BUILD)).some((item) => isFocusRingDeclaration(item))).toBe(
      false,
    )
  })

  it('sets aside only focusRing: an outline declaration anywhere else is not excused (control)', () => {
    const stray = readStylesheet().replace(
      '.nave-base-ui-title { margin: 0;',
      '.nave-base-ui-title { outline: none; margin: 0;',
    )

    expect(withoutFocusRing(stray)).not.toEqual(withoutFocusRing(fixture(INDEPENDENT_BUILD)))
  })

  it('composes focusRing on exactly the atoms Table T2 names', () => {
    const classes = focusRingAtoms.map((name) => toClassName(name as AtomName))

    expect(new Set(classes)).toEqual(new Set(focusRingClasses))
    expect(classes).toHaveLength(focusRingClasses.length)
  })
})
