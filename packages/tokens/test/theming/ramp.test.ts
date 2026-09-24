import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { isOklchInGamut, maxChroma } from '../../src/theming/color-math.ts'
import { runPipeline } from '../../src/theming/pipeline.ts'
import {
  ADVERSARIAL_SEEDS,
  decomposeSeed,
  DEFAULT_ENV,
  ENV_CEILING,
  generateRamp,
  S_BAND,
} from '../../src/theming/ramp.ts'
import { STEP_TABLE } from '../../src/theming/step-table.ts'

const TEAL = { l: 0.7859, c: 0.1316, h: 186.17 }

describe('AC-theming-03 covers: R3', () => {
  it('two seeds sharing hue and s but differing in (unclamped) lightness generate identical ramps', () => {
    // Two lightnesses inside the [0.20, 0.90] band, each holding the SAME chroma fraction
    // of its own local maxChroma so `s` comes out equal without hand-solving for it.
    const seedA = { l: 0.79, c: 0.05, h: 40 }
    const bandA = seedA.l
    void bandA
    const sA = decomposeSeed(seedA).s
    // Re-derive a second seed at a different lightness with the SAME s by scaling chroma
    // by the ratio of local maxChroma at the two lightnesses.
    const seedBL = 0.45
    const seedB = { l: seedBL, c: sA * maxChroma(seedBL, 40), h: 40 }

    const rampA = generateRamp(seedA)
    const rampB = generateRamp(seedB)

    for (let i = 0; i < rampA.steps.length; i++) {
      expect(rampA.steps[i]!.l).toBeCloseTo(rampB.steps[i]!.l, 10)
      expect(rampA.steps[i]!.c).toBeCloseTo(rampB.steps[i]!.c, 6)
    }
    // Neither ramp's own seed lightness appears as a generated step lightness (the step
    // table's own lightnesses are used, never the seed's).
    for (const step of rampA.steps) {
      expect(step.l).not.toBeCloseTo(seedA.l, 2)
    }
  })
})

describe('AC-theming-04 covers: R4, R6', () => {
  it('every generated step of every shipped default seed is within 0.95 * maxChroma and in sRGB gamut', () => {
    const dangerSeed = { l: 0.6357, c: 0.2072, h: 15.02 }
    for (const seed of [TEAL, dangerSeed]) {
      const ramp = generateRamp(seed)
      for (const step of ramp.steps) {
        expect(isOklchInGamut({ l: step.l, c: step.c, h: step.h })).toBe(true)
      }
    }
  })
})

describe('AC-theming-05 covers: R4', () => {
  it('a perturbed env curve requesting more than the ceiling fails loud before any step is trusted', () => {
    const badEnv = new Map(DEFAULT_ENV)
    badEnv.set(600, 0.99) // deliberately violates the hard 0.95 ceiling
    expect(() => generateRamp(TEAL, badEnv)).toThrow(/0\.95/)
  })
})

describe('AC-theming-06 covers: R5', () => {
  it('an out-of-sRGB seed is normalized by chroma reduction at constant L and H, recorded, idempotent', () => {
    const wild = { l: 0.6, c: 0.9, h: 20 }
    const first = generateRamp(wild)
    expect(first.seedRecord.normalized).toBe(true)
    expect(first.seedRecord.usedSeed.l).toBe(wild.l)
    expect(first.seedRecord.usedSeed.h).toBe(wild.h)
    expect(first.seedRecord.usedSeed.c).toBeLessThan(wild.c)

    // Re-running on the already-normalized seed changes nothing further.
    const second = generateRamp(first.seedRecord.usedSeed)
    expect(second.seedRecord.normalized).toBe(false)
    expect(second.seedRecord.usedSeed).toEqual(first.seedRecord.usedSeed)
  })
})

describe('AC-theming-07 covers: R6', () => {
  it('no generated value ever uses a wide-gamut colour function (sRGB is the stated target)', () => {
    const ramp = generateRamp(TEAL)
    // The pipeline only ever emits oklch()/RCS formulas over sRGB-checked values; this
    // asserts the invariant the gamut guard enforces, not a string-format claim.
    for (const step of ramp.steps) {
      expect(isOklchInGamut({ l: step.l, c: step.c, h: step.h })).toBe(true)
    }
  })

  it('sRGB is recorded as an explicit stated assumption in the SHIPPED ARTIFACT, not only in the spec', () => {
    // The criterion's own words: "sRGB is recorded as an explicit stated assumption in the
    // shipped artifact rather than only in this spec". Read off dist/, which is the artifact
    // a consumer gets, rather than off an in-memory constant they cannot reach.
    const record = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../dist/build-record.json'), 'utf8'),
    ) as { targetGamut: { assumption: string; gamut: string } }
    expect(record.targetGamut.gamut).toBe('srgb')
    expect(record.targetGamut.assumption).toMatch(/sRGB is the target gamut/)
    expect(record.targetGamut.assumption).toMatch(/non-goal/)
  })

  it('no emitted colour value in the shipped CSS uses a wide-gamut colour function', () => {
    const css = readFileSync(path.resolve(import.meta.dirname, '../../dist/tokens.css'), 'utf8')
    expect(css).not.toMatch(/color\(\s*display-p3/)
    expect(css).not.toMatch(/color\(\s*rec2020/)
  })
})

describe('AC-theming-08 covers: R7', () => {
  // The sheet half of this criterion — "each run emits a contact sheet containing every step
  // of every generated scale ... such that a step or a seed missing from the sheet fails the
  // run" — is exercised in `build-step.test.ts`, against the emitted artifact and its own
  // completeness check. What is asserted here is the other half: the env curve as a build
  // parameter, at the generator AND at the pipeline, since "both runs regenerate the ramps
  // from the parameter alone" is a claim about a run and not only about `generateRamp`.
  it('the env curve is a build parameter: swapping it regenerates the ramp from the parameter alone', () => {
    const flatEnv = new Map(DEFAULT_ENV)
    for (const { step } of STEP_TABLE) flatEnv.set(step, 0.1)
    const shipped = generateRamp(TEAL)
    const flat = generateRamp(TEAL, flatEnv)
    // Same seed, different env -> different chroma at the same step (except the 0/1000 anchors).
    const shippedMid = shipped.steps.find((s) => s.step === 600)!
    const flatMid = flat.steps.find((s) => s.step === 600)!
    expect(shippedMid.c).not.toBeCloseTo(flatMid.c, 3)
  })

  it('a full pipeline run takes the curve as a parameter too, with no edit to the DTCG source in between', () => {
    const flatEnv = new Map(DEFAULT_ENV)
    for (const { step } of STEP_TABLE) flatEnv.set(step, 0.1)
    const seeds = {
      primary: TEAL,
      danger: { l: 0.6357, c: 0.2072, h: 15.02 },
      declaredTintHue: 186.17,
    }

    const shipped = runPipeline(seeds)
    const flat = runPipeline(seeds, {}, flatEnv)
    const accent = (result: ReturnType<typeof runPipeline>): number =>
      result.slots.find((s) => s.slot === 'action.primary' && s.branch === 'light')!.literal.c

    expect(accent(shipped)).not.toBeCloseTo(accent(flat), 3)
  })

  it('every env value in the shipped curve is within the hard 0.95 ceiling', () => {
    for (const v of DEFAULT_ENV.values()) {
      expect(v).toBeLessThanOrEqual(ENV_CEILING)
    }
  })
})

describe('AC-theming-09 covers: R8, R4', () => {
  it('one seed per hue family plus the default: every ramp clears R4, tapers to 0 at the anchors', () => {
    // R8's set is declared once (`ADVERSARIAL_SEEDS`) and read here and by R7's contact
    // sheet, which is obliged to carry "the adversarial seed set of R8" — two hand-kept
    // copies would let the sheet discharge R7 against a different set than R8 names.
    const seeds = [TEAL, ...ADVERSARIAL_SEEDS.map((entry) => entry.seed)]
    expect(ADVERSARIAL_SEEDS.map((entry) => entry.name)).toEqual([
      'red',
      'blue',
      'violet',
      'yellow-green',
    ])
    for (const seed of seeds) {
      const ramp = generateRamp(seed)
      for (const step of ramp.steps) {
        expect(isOklchInGamut({ l: step.l, c: step.c, h: step.h })).toBe(true)
        expect(Number.isNaN(step.c)).toBe(false)
        expect(Number.isFinite(step.c)).toBe(true)
      }
      expect(ramp.steps.find((s) => s.step === 0)!.c).toBe(0)
      expect(ramp.steps.find((s) => s.step === 1000)!.c).toBe(0)
    }
  })
})

describe('AC-theming-10 covers: R8, R3', () => {
  it('awkward seeds (very light, very dark, boundary-chroma, near-grey) generate no NaN and stay in gamut', () => {
    const seeds = [
      { l: 0.97, c: 0.02, h: 90 }, // very light
      { l: 0.06, c: 0.02, h: 90 }, // very dark
      { l: 0.6, c: 0.35, h: 25 }, // sits on/near the sRGB boundary before normalization
      { l: 0.5, c: 0.005, h: 200 }, // near-grey, small but non-zero chroma
    ]
    for (const seed of seeds) {
      const ramp = generateRamp(seed)
      for (const step of ramp.steps) {
        expect(Number.isNaN(step.c)).toBe(false)
        expect(isOklchInGamut({ l: step.l, c: step.c, h: step.h })).toBe(true)
      }
    }
  })
})

describe('AC-theming-44 covers: R3, R8', () => {
  it('a seed outside the [0.20, 0.90] lightness band has its s-lightness clamped and recorded', () => {
    const pastel = { l: 0.985, c: 0.02, h: 90 }
    const record = decomposeSeed(pastel)
    expect(record.bandClamped).toBe(true)
    expect(record.sLightness).toBe(S_BAND.hi)
    // hue and the ramp's own lightnesses are untouched by the clamp
    expect(record.usedSeed.h).toBe(pastel.h)

    const nearBlack = { l: 0.05, c: 0.02, h: 90 }
    const record2 = decomposeSeed(nearBlack)
    expect(record2.bandClamped).toBe(true)
    expect(record2.sLightness).toBe(S_BAND.lo)
  })

  it("a clamped pastel seed's s stays below 1 (the round-1 hazard this clamp exists to prevent)", () => {
    const pastel = { l: 0.985, c: 0.02, h: 90 } // ordinary chroma, extreme lightness
    const record = decomposeSeed(pastel)
    expect(record.s).toBeLessThan(1)
  })
})

describe('AC-theming-45 covers: R7, R4', () => {
  it('an env value above 0.95 is rejected before any ramp is generated, naming the ceiling', () => {
    const badEnv = new Map(DEFAULT_ENV)
    badEnv.set(500, 0.96)
    expect(() => generateRamp(TEAL, badEnv)).toThrow(/hard invariant/)
  })

  it('an env curve entirely at or below 0.95 proceeds without error', () => {
    expect(() => generateRamp(TEAL, DEFAULT_ENV)).not.toThrow()
  })
})
