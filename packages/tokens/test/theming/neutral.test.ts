import { describe, expect, it } from 'vitest'

import { isOklchInGamut } from '../../src/theming/color-math.ts'
import {
  assertNeutralChromaCeilingWithinMargin,
  computeNeutralChromaCeiling,
  computeNeutralHueBandSpread,
  generateNeutralRampLiterals,
  neutralRcsFormula,
  resolveNeutralStep,
} from '../../src/theming/neutral.ts'

describe('AC-theming-11 covers: R9, R37 (neutral half)', () => {
  it('the neutral chroma ceiling is a single small hue-independent constant', () => {
    const ceiling = computeNeutralChromaCeiling()
    expect(ceiling).toBeGreaterThan(0)
    expect(ceiling).toBeLessThan(0.02)
  })

  // The `< 0.02` bound above is a loose sanity check only
  // (roughly three times the shipped value); the REAL bound is T7's fixed 1 percent margin,
  // applied to the ceiling's own worst-case hue-band spread rather than to a round chroma
  // number that happens to sit near it.

  it("the shipped ceiling's own hue-band spread clears with headroom under T7's fixed 1 percent margin", () => {
    const spread = computeNeutralHueBandSpread()
    expect(spread).toBeGreaterThan(0)
    expect(spread).toBeLessThan(0.01)
  })

  it('assertNeutralChromaCeilingWithinMargin passes at the shipped ceiling', () => {
    expect(() => assertNeutralChromaCeilingWithinMargin()).not.toThrow()
  })

  it("assertNeutralChromaCeilingWithinMargin fails once the ceiling's spread exceeds the margin this build holds", () => {
    // The suite's own former bound (0.02) is itself past the margin at this ceiling
    // (roughly 2.2 percent spread, measured) — exactly the regression this item replaces a
    // loose round number with a derived one to catch.
    expect(() => assertNeutralChromaCeilingWithinMargin(0.02)).toThrow(
      /at or past the 1 percent margin this build holds/,
    )
    // A second, stable anchor: the message's opening stem carries no cleared prose, unlike
    // the margin clause above (kept, not replaced — it pins that clause in its own right).
    expect(() => assertNeutralChromaCeilingWithinMargin(0.02)).toThrow(/^Neutral chroma ceiling:/)
  })

  it('the ceiling stays in gamut at every hue, at every non-extreme step lightness (R9)', () => {
    const literals = generateNeutralRampLiterals()
    for (const step of literals) {
      if (step.l <= 0 || step.l >= 1) continue
      for (let h = 0; h < 360; h += 15) {
        expect(isOklchInGamut({ l: step.l, c: step.c, h })).toBe(true)
      }
    }
  })

  it('the 0 and 1000 anchors are chroma-zero (white and black tint invariantly)', () => {
    const literals = generateNeutralRampLiterals()
    expect(literals.find((s) => s.step === 0)!.c).toBe(0)
    expect(literals.find((s) => s.step === 1000)!.c).toBe(0)
  })
})

describe('AC-theming-12 covers: R10', () => {
  it('the RCS formula only ever takes hue `from` the tint source; L and C are numeric literals', () => {
    const literals = generateNeutralRampLiterals()
    const formula = neutralRcsFormula(600, literals)
    expect(formula).toMatch(/^oklch\(from var\(--nave-color-tint\) [\d.]+ [\d.]+ h\)$/)
  })

  it('reconstructing the tinted value in Node equals the browser-resolved value exactly, at any hue', () => {
    const literals = generateNeutralRampLiterals()
    for (const hue of [0, 90, 186.17, 270]) {
      const resolved = resolveNeutralStep(600, hue, literals)
      const step600 = literals.find((s) => s.step === 600)!
      expect(resolved.l).toBe(step600.l)
      expect(resolved.c).toBe(step600.c)
      expect(resolved.h).toBe(hue)
    }
  })

  it("every tinted value's lightness is unchanged from its untinted lightness at every hue", () => {
    const literals = generateNeutralRampLiterals()
    const step500 = literals.find((s) => s.step === 500)!
    for (const hue of [0, 45, 186.17, 300]) {
      expect(resolveNeutralStep(500, hue, literals).l).toBe(step500.l)
    }
  })
})

// Pins the FULL cleared thrown message, independently typed rather than
// imported from the source constant, so a copy edit to NEUTRAL_CHROMA_CEILING_MARGIN_REASON
// makes this hardcoded string mismatch and this test go red — closing the gap the existing
// stem-only anchor (`/produces a worst-case hue-band spread of/`) leaves open.
describe('full-content pin for the cleared neutral chroma ceiling message', () => {
  it('assertNeutralChromaCeilingWithinMargin: the full message at ceiling 0.02', () => {
    let message = ''
    try {
      assertNeutralChromaCeilingWithinMargin(0.02)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe(
      'Neutral chroma ceiling: the ceiling 0.02 produces a worst-case hue-band spread of ' +
        '2.227 percent in the contrast values derived from it, at or past the 1 percent ' +
        "margin this build holds. That margin is a fixed constraint of the palette's " +
        "design and is not this build's to move: a pair clearing its floor only inside " +
        'that margin is telling you about one tint, not about the token. Re-measure the ' +
        'tinted-neutral arithmetic before shipping a ceiling change. If you believe the ' +
        'margin itself is wrong, open an issue rather than widening it here.',
    )
  })
})
