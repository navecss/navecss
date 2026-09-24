/**
 * R3-R8, R31 (seed -> generate ramp phase): seed decomposition, the achromatic
 * branch predicate, the lightness-band clamp, gamut-relative chroma generation,
 * and the R4 gamut guard.
 */

import {
  isOklchInGamut,
  maxChroma,
  normalizeSeed,
  type Oklch,
  type SeedNormalization,
} from './color-math.ts'
import { STEP_TABLE, stepLightness } from './step-table.ts'

/**
 * R7: the crafted envelope, one value per step of the shared table. Rises from 0 at
 * step 0, plateaus at 0.93-0.95 across the 500-700 accent band, falls back to 0 at
 * step 1000. `env(step) <= 0.95` is a HARD INVARIANT (checked in generateRamp), not a
 * tunable — raising it is a gamut change.
 */
export const DEFAULT_ENV: ReadonlyMap<number, number> = new Map([
  [0, 0],
  [50, 0.35],
  [100, 0.55],
  [150, 0.68],
  [200, 0.78],
  [300, 0.88],
  [400, 0.93],
  [500, 0.95],
  [600, 0.95],
  [700, 0.95],
  [800, 0.88],
  [850, 0.78],
  [900, 0.62],
  [950, 0.4],
  [1000, 0],
])

export const ENV_CEILING = 0.95

/**
 * R8: one seed per hue family (a red, a blue, a violet, a yellow-green) in addition to the
 * default teal, because available chroma varies by 3x to 12x across hues at a fixed
 * lightness. Declared once here rather than per caller: R7 obliges the contact sheet to
 * carry "the adversarial seed set of R8", and a sheet whose set had drifted from the
 * generator tests' set would discharge R7 against a different set than R8 names.
 */
export const ADVERSARIAL_SEEDS: readonly { name: string; seed: Oklch }[] = [
  { name: 'red', seed: { l: 0.6, c: 0.15, h: 25 } },
  { name: 'blue', seed: { l: 0.55, c: 0.15, h: 260 } },
  { name: 'violet', seed: { l: 0.55, c: 0.15, h: 300 } },
  { name: 'yellow-green', seed: { l: 0.7, c: 0.15, h: 110 } },
]

/**
R3(b): the band `s` is computed against when the seed's own lightness falls outside it.
 */
export const S_BAND = { lo: 0.2, hi: 0.9 } as const

export interface SeedRecord {
  /**
  True when the seed was normalized (moved) before use, in any of R5's three ways (`normalization`).
   */
  normalized: boolean
  /**
  Which of R5's normalization outcomes fired for this seed (`normalizeSeed`'s own docblock).
   */
  normalization: SeedNormalization
  /**
  True when the lightness used to compute `s` was clamped into R3(b)'s band.
   */
  bandClamped: boolean
  /**
  The seed as actually used (post-normalization).
   */
  usedSeed: Oklch
  /**
  The lightness actually used to compute `s` (post-clamp).
   */
  sLightness: number
  /**
  The intensity scalar (R3). Exactly 0 for an achromatic seed.
   */
  s: number
  /**
   * R3(a): whether this seed selects the achromatic branch (chroma is EXACTLY zero,
   * checked on the normalized seed since normalization only ever reduces chroma and an
   * already-zero seed is already in gamut).
   */
  achromatic: boolean
}

/**
 * Decomposes a seed into its hue and intensity scalar (R3), applying R5's normalization
 * and R3(b)'s lightness-band clamp, and recording both substitutions (never silent).
 */
export function decomposeSeed(seed: Oklch): SeedRecord {
  const { seed: used, normalization, normalized } = normalizeSeed(seed)

  const isAchromatic = used.c === 0
  if (isAchromatic) {
    // R3(a) part 1: no hue is ever read off a zero-chroma seed. `s` is exactly 0.
    return {
      normalized,
      normalization,
      bandClamped: false,
      usedSeed: used,
      sLightness: used.l,
      s: 0,
      achromatic: true,
    }
  }

  const isBandClamped = used.l < S_BAND.lo || used.l > S_BAND.hi
  const sLightness = isBandClamped ? Math.min(Math.max(used.l, S_BAND.lo), S_BAND.hi) : used.l

  const denom = maxChroma(sLightness, used.h)
  const s = denom === 0 ? 0 : Math.min(Math.max(used.c / denom, 0), 1)

  return {
    normalized,
    normalization,
    bandClamped: isBandClamped,
    usedSeed: used,
    sLightness,
    s,
    achromatic: false,
  }
}

interface RampStep {
  step: number
  l: number
  c: number
  h: number
}

export interface Ramp {
  seedRecord: SeedRecord
  steps: readonly RampStep[]
}

/**
 * R3, R4, R31 "generate ramp" phase: `C(step) = s * env(step) * maxChroma(L(step), H(seed))`.
 * Fails loud (R4) if any generated step would exceed the 0.95 ceiling of locally available
 * chroma — reachable only via a hand-perturbed env (AC-theming-05), since R3's clamps and
 * R7's ceiling make it otherwise unreachable through the normal inputs.
 */
export function generateRamp(seed: Oklch, env: ReadonlyMap<number, number> = DEFAULT_ENV): Ramp {
  const seedRecord = decomposeSeed(seed)
  const hue = seedRecord.achromatic ? 0 : seedRecord.usedSeed.h

  const steps: RampStep[] = STEP_TABLE.map(({ step, l }) => {
    const envValue = env.get(step)
    if (envValue === undefined) {
      throw new Error(`The environment curve has no value for step ${step}. Open an issue.`)
    }
    if (envValue > ENV_CEILING) {
      throw new Error(
        `env(${step}) = ${envValue} exceeds the hard invariant ceiling of ${ENV_CEILING}. ` +
          'Raising the 0.95 ceiling is a gamut change, not a curve edit: open an issue.',
      )
    }

    if (seedRecord.achromatic) {
      return { step, l, c: 0, h: 0 }
    }

    const cap = maxChroma(l, hue)
    const c = seedRecord.s * envValue * cap

    const permitted = ENV_CEILING * cap
    if (c > permitted + 1e-9) {
      throw new Error(
        `The scale at hue ${hue} step ${step} requested chroma ${c}, which exceeds the ` +
          `permitted ceiling ${permitted} (0.95 * maxChroma(${l}, ${hue})). Open an issue ` +
          'rather than raising the ceiling here.',
      )
    }
    if (!isOklchInGamut({ l, c, h: hue })) {
      throw new Error(
        `Step ${step} of the scale at hue ${hue} is out of sRGB gamut. Open an issue.`,
      )
    }

    return { step, l, c, h: hue }
  })

  return { seedRecord, steps }
}

/**
Looks up a single step's generated colour from a ramp. Throws on an undefined step (R2).
 */
export function rampStep(ramp: Ramp, step: number): Oklch {
  stepLightness(step) // validates the step exists in the shared table
  const found = ramp.steps.find((s) => s.step === step)
  if (!found) throw new Error(`Step ${step} missing from generated ramp.`)
  return { l: found.l, c: found.c, h: found.h }
}
