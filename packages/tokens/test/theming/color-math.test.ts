import { describe, expect, it } from 'vitest'

import {
  contrastRatio,
  formatOklch,
  isOklchInGamut,
  maxChroma,
  normalizeSeed,
  type Oklch,
  oklchToSrgb,
  srgbToOklch,
} from '../../src/theming/color-math.ts'
import {
  assertContrastFloors,
  type ContrastResult,
  MARGIN,
  NON_TEXT_FLOOR,
} from '../../src/theming/contrast.ts'
import { CHROMATIC_MAPPING } from '../../src/theming/semantics.ts'
import { stepLightness } from '../../src/theming/step-table.ts'

/**
 * The step `CHROMATIC_MAPPING` currently ships for a slot in the dark scheme. Fails LOUD
 * rather than degrading to "nothing to check" if the mapping ever stops giving the slot a
 * direct neutral step: a cross-check that quietly finds nothing to assert is the same
 * silent-drift failure this file's dark border.control anchor is about, one level up.
 */
function shippedDarkStep(slot: string): number {
  const mapping = CHROMATIC_MAPPING[slot]
  if (mapping === undefined) {
    throw new Error(`${slot} is no longer in CHROMATIC_MAPPING; this anchor needs re-pointing.`)
  }
  const ref = mapping.dark
  if (!('step' in ref)) {
    throw new Error(
      `${slot} (dark) is now an alias rather than a direct step; this anchor needs re-pointing.`,
    )
  }
  return ref.step
}

/**
 * The LIGHT-scheme sibling of `shippedDarkStep`: the light
 * `border.control` assertion below transcribes step500's lightness on purpose (the same
 * reason `shippedDarkStep`'s own module comment gives), and transcription alone has no
 * tripwire back to `CHROMATIC_MAPPING` — exactly the gap that let the DARK half go stale
 * once before it was caught. This function
 * is that tripwire's read half for the light scheme.
 */
function shippedLightStep(slot: string): number {
  const mapping = CHROMATIC_MAPPING[slot]
  if (mapping === undefined) {
    throw new Error(`${slot} is no longer in CHROMATIC_MAPPING; this anchor needs re-pointing.`)
  }
  const ref = mapping.light
  if (!('step' in ref)) {
    throw new Error(
      `${slot} (light) is now an alias rather than a direct step; this anchor needs re-pointing.`,
    )
  }
  return ref.step
}

// Supports AC-theming-04, AC-theming-06, AC-theming-09: cross-checked against the SIGNED
// threshold table so the pipeline's own
// AC-tagged tests are not the first place this math is exercised.
describe('color-math (validates against the signed threshold table)', () => {
  it('reproduces the signed border.control LIGHT ratio, plus a mid-lightness arithmetic case, at zero chroma', () => {
    // These literals are TRANSCRIBED from the signed step table on purpose: pinning
    // 4.1115 is what cross-checks the transcription, and reading the value back out of
    // `step-table.ts` would make the assertion agree with itself. The dark anchor below
    // has the opposite job (track the mapping) and so reads the mapping instead.
    const white = { l: 1, c: 0, h: 0 }
    const step500 = { l: 0.59, c: 0, h: 0 }
    const step400 = { l: 0.72, c: 0, h: 0 }
    const step900 = { l: 0.18, c: 0, h: 0 }
    expect(contrastRatio(step500, white)).toBeCloseTo(4.1115, 3)
    // This is the tripwire this transcription lacked. step500's lightness is
    // hardcoded above on purpose (see the comment at the top of this test); what was
    // missing is a check that step500 is STILL the step light border.control ships. Read
    // from CHROMATIC_MAPPING, not transcribed a second time — a lawful mapping move now
    // goes red HERE, naming this file, at the moment someone is already editing the
    // mapping, rather than leaving this test to advertise a pair it no longer describes
    // (the exact staleness already found on the dark half).
    expect(stepLightness(shippedLightStep('border.control'))).toBeCloseTo(step500.l, 6)
    // step400 vs step900 is a mid-lightness arithmetic case, not the shipped dark
    // border.control pair: a later change moved dark border.control to step
    // 500 (against surface.base dark, step 900), so this no longer reproduces any
    // shipped border.control pair. The dark border.control cross-check is the next test
    // below, restored as a floor-clearing assertion read off `CHROMATIC_MAPPING` rather
    // than as a transcribed ratio, so it does not mint a new signed figure here.
    expect(contrastRatio(step400, step900)).toBeCloseTo(7.5807, 3)
  })

  it("the DARK border.control / surface.base pair CHROMATIC_MAPPING currently ships clears the signed non-text floor with T7's margin, at zero chroma", () => {
    // THE STEPS ARE READ FROM `CHROMATIC_MAPPING`, NOT TRANSCRIBED. The assertion this
    // replaces was arithmetic over hardcoded literals with no link to the mapping, so when
    // the mapping later moved dark border.control from step 400 to step 500 nothing went
    // red and the test went on advertising a pair it no longer described. A literal
    // restatement of "step 500 vs step 900" would reproduce that defect exactly one move
    // later; reading the mapping is what makes this anchor follow it.
    //
    // No ratio is pinned and no figure is minted: the assertion is only that the pair the
    // mapping ships clears the ALREADY-SIGNED non-text floor (T2, `NON_TEXT_FLOOR`) plus
    // T7's 1% margin (`MARGIN`). Both are imported from `contrast.ts` rather than copied.
    //
    // Computed at ZERO CHROMA, like the light-scheme assertion above. The shipped neutrals
    // carry the R10 tint, so this is the achromatic idealisation of the shipped pair, not
    // the tinted pair itself — a different object. The tinted pair is judged by R21/R38
    // against the real resolved values in `build-step.ts`; nothing here restates or
    // replaces that verdict.
    const ratio = contrastRatio(
      { l: stepLightness(shippedDarkStep('border.control')), c: 0, h: 0 },
      { l: stepLightness(shippedDarkStep('surface.base')), c: 0, h: 0 },
    )
    const threshold = NON_TEXT_FLOOR * MARGIN
    // The verdict is computed HERE, so `assertContrastFloors` below is not re-deciding it -
    // that function filters on exactly this boolean, and feeding it a `pass` this test set
    // proves plumbing, not content. It is kept for the SHAPE, so a change to
    // `ContrastResult` reaches this cross-check too; the gate's own failing direction is
    // covered in `contrast.test.ts` (four sites), not here. The load-bearing assertion is
    // the comparison itself, made explicitly on the line below.
    const isAboveThreshold = ratio >= threshold
    const result: ContrastResult = {
      pair: { subject: 'border.control', against: 'surface.base', class: 'non-text' },
      scheme: 'dark',
      ratio,
      floor: NON_TEXT_FLOOR,
      threshold,
      pass: isAboveThreshold,
    }
    expect(isAboveThreshold, `computed ${ratio} below the applied threshold ${threshold}`).toBe(
      true,
    )
    expect(() => assertContrastFloors([result])).not.toThrow()
  })

  it('maxChroma is 0 at the lightness extremes and positive in the middle, for any hue', () => {
    expect(maxChroma(0, 186)).toBe(0)
    expect(maxChroma(1, 186)).toBe(0)
    expect(maxChroma(0.5, 186)).toBeGreaterThan(0)
  })

  it('isOklchInGamut agrees with maxChroma: exactly at the cap is in, just above is out', () => {
    const cap = maxChroma(0.6, 40)
    expect(isOklchInGamut({ l: 0.6, c: cap, h: 40 })).toBe(true)
    expect(isOklchInGamut({ l: 0.6, c: cap * 1.2, h: 40 })).toBe(false)
  })

  it('normalizeSeed reduces chroma at constant L and H, once, for an out-of-gamut seed', () => {
    const wild = { l: 0.6, c: 0.9, h: 20 } // far outside sRGB at any hue
    const { seed, normalized } = normalizeSeed(wild)
    expect(normalized).toBe(true)
    expect(seed.l).toBe(wild.l)
    expect(seed.h).toBe(wild.h)
    expect(seed.c).toBeLessThan(wild.c)
    expect(isOklchInGamut(seed)).toBe(true)
  })

  it('normalizeSeed is a no-op for an already in-gamut seed', () => {
    const safe = { l: 0.7859, c: 0.1316, h: 186.17 }
    const { seed, normalized } = normalizeSeed(safe)
    expect(normalized).toBe(false)
    expect(seed).toEqual(safe)
  })

  it('formatOklch renders a valid oklch() literal', () => {
    expect(formatOklch({ l: 0.7859, c: 0.1316, h: 186.17 })).toBe('oklch(0.7859 0.1316 186.17)')
  })

  it('the brand teal seed renders as a teal (high G, high-ish B, low R) in sRGB', () => {
    const rgb = oklchToSrgb({ l: 0.7859, c: 0.1316, h: 186.17 })
    expect(rgb.g).toBeGreaterThan(rgb.r)
    expect(rgb.b).toBeGreaterThan(rgb.r)
  })
})

// The forward and inverse chains are two independent transcriptions of Ottosson's
// constants, and nothing else in the suite compares them: every other test runs the
// generating direction only, so a typo in either matrix would go unseen until a
// consumer seed arrived through the inverse. A round trip is the check that they agree.
describe('color-math round trip (OKLCH -> sRGB -> OKLCH)', () => {
  const SEEDS: readonly { name: string; seed: Oklch }[] = [
    { name: 'brand teal (the shipped primary)', seed: { l: 0.7859, c: 0.1316, h: 186.17 } },
    { name: 'shipped danger', seed: { l: 0.6357, c: 0.2072, h: 15.02 } },
    // One per hue family, mirroring R8's reasoning: available chroma varies 3x to 12x
    // across hues, so a single-hue round trip would not exercise the matrices' range.
    { name: 'red', seed: { l: 0.55, c: 0.18, h: 25 } },
    { name: 'blue', seed: { l: 0.45, c: 0.15, h: 260 } },
    { name: 'violet', seed: { l: 0.5, c: 0.16, h: 310 } },
    { name: 'yellow-green', seed: { l: 0.85, c: 0.14, h: 125 } },
  ]

  for (const { name, seed } of SEEDS) {
    it(`recovers ${name} through sRGB to within display precision`, () => {
      const back = srgbToOklch(oklchToSrgb(seed))
      expect(back.l).toBeCloseTo(seed.l, 6)
      expect(back.c).toBeCloseTo(seed.c, 6)
      expect(back.h).toBeCloseTo(seed.h, 4)
    })
  }

  it('an achromatic colour round-trips to zero chroma, the R3(a) branch predicate', () => {
    // Hue is undefined at c === 0 and callers must not read it, so only chroma is asserted.
    // Approximate, not exact: `oklchToSrgb` on the way there is not itself guaranteed to
    // produce a bit-exact r === g === b triple (independent per-channel rounding through three
    // different matrix rows), so `srgbToOklch`'s exact-equality short-circuit below does not
    // always fire on a ROUND-TRIPPED grey. It does fire on a grey given directly (the next
    // test), which is the shape every real seed ingest path actually produces.
    const back = srgbToOklch(oklchToSrgb({ l: 0.6, c: 0, h: 0 }))
    expect(back.c).toBeCloseTo(0, 6)
    expect(back.l).toBeCloseTo(0.6, 6)
  })

  it('an sRGB grey given DIRECTLY (not round-tripped from OKLCH) also converts to EXACTLY zero chroma', () => {
    // The actual defect: `linearSrgbToOklab`'s published matrix constants do not sum to
    // exactly zero at 10-significant-figure precision, so a genuinely achromatic sRGB input
    // (r === g === b) used to leave a residual chroma around 1e-7 and an arbitrary hue —
    // every hex/rgb() grey except pure black picked up a phantom tint invisible to the eye
    // but present in the emitted CSS, and missed the achromatic branch predicate above.
    for (const grey of [0, 0.2, 0.5, 128 / 255, 0.9, 1]) {
      const oklch = srgbToOklch({ b: grey, g: grey, r: grey })
      expect(oklch.c).toBe(0)
      expect(oklch.h).toBe(0)
    }
  })

  it('recovers a hex brand colour, the rung-1b input this exists for', () => {
    // #27d4c6, the brand teal as spec line 20 states it, hand-converted there to
    // oklch(78.59% 0.1316 186.17). This asserts the conversion the spec recorded.
    const hex = { r: 0x27 / 255, g: 0xd4 / 255, b: 0xc6 / 255 }
    const oklch = srgbToOklch(hex)
    expect(oklch.l).toBeCloseTo(0.7859, 3)
    expect(oklch.c).toBeCloseTo(0.1316, 3)
    expect(oklch.h).toBeCloseTo(186.17, 1)
  })
})
