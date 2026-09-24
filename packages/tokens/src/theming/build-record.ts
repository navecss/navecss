/**
 * The BUILD RECORD: the artifact half of the "recorded in the build output" clause that
 * R3(a) part 3, R3(b), R5 (rider 1), R6, `AC-theming-03`, `AC-theming-06`, `AC-theming-07`,
 * `AC-theming-43` and `AC-theming-44` all attach to. Those clauses are obligations on an
 * ARTIFACT a consumer can read — "so the consumer whose CTA moved can find the reason in an
 * artifact they can read rather than only in devtools" (`AC-theming-43`) — and `SeedRecord`
 * satisfied them only in memory, where nothing a consumer owns can reach it.
 *
 * Emitted as `dist/build-record.json`. It records what the build DID (inputs as given,
 * resolved values, substitutions and their reasons, the stated target gamut) and states no
 * contrast, conformance or quality verdict of any kind (one canonical home per fact).
 */

import type { MeasuredOpenSlots } from './adjacency.ts'
import type { Oklch } from './color-math.ts'
import type { PipelineResult, Seeds } from './pipeline.ts'
import type { Ramp, SeedRecord } from './ramp.ts'
import type { SeedInput, SeedInputs } from './seed-input.ts'

import { ACHROMATIC_BRANCH_SLOTS } from './semantics.ts'

/**
 * R6: sRGB is the target gamut, stated as an EXPLICIT ASSUMPTION in the shipped artifact
 * rather than only in the spec (`AC-theming-07`). Wide-gamut output is a deliberate v1
 * non-goal; a future wide-gamut output regenerates the ramp rather than reusing it.
 */
const TARGET_GAMUT = {
  gamut: 'srgb',
  assumption:
    'sRGB is the target gamut, stated as an explicit assumption. Every generated ' +
    'value is expressible in sRGB and no wide-gamut colour function is emitted. Wide-gamut ' +
    '(display-p3) output is a deliberate v1 non-goal: a future wide-gamut output regenerates ' +
    'the ramp rather than reusing this one.',
} as const

interface SeedBuildRecord {
  /**
   * The seed AS GIVEN to the build (R5 rider 1; the accepted token-build specification's R20).
   * Typed to express every form R5 accepts, never coerced into one form's shape: a seed given as a
   * CSS string carries the string verbatim and the form it was read as, a seed authored as an OKLCH
   * triple (Nave's own defaults) carries the triple. See `seed-input.ts`.
   */
  input: SeedInput
  /**
  The seed as actually USED, post-normalization and after any substitution below.
   */
  resolved: Oklch
  /**
  The intensity scalar R3 decomposes the seed into, and the lightness it was computed at.
   */
  intensityScalar: number
  sLightness: number
  substitutions: {
    lightnessBandClamped: { applied: boolean; reason?: string | undefined }
    normalized: { applied: boolean; reason?: string | undefined }
  }
  /**
   * R3(a): whether this seed is exactly achromatic. The BRANCH it selects is a property of
   * the `primary` seed alone and is recorded once, at the top level.
   */
  achromatic: boolean
  /**
   * `AC-theming-03`: whether the seed's OWN colour appears at any step of the ramp it
   * generates, and at which. R3 says to state the consequence that it is not guaranteed to,
   * and for the default teal it does not — so this reads `false` in the shipped record and
   * is the record's own statement of it rather than a claim a reader has to re-derive.
   */
  seedColourAppearsInRamp: boolean
  seedColourStep?: number | undefined
}

export interface BuildRecord {
  spec: string
  targetGamut: typeof TARGET_GAMUT
  seeds: Record<'danger' | 'primary', SeedBuildRecord>
  /**
  R3(a) part 3: the branch RECORDS ITSELF, naming the seed and the substitution.
   */
  achromaticBranch: {
    reason?: string | undefined
    seed?: Oklch | undefined
    selected: boolean
    substitutedSlots: readonly string[]
  }
  tint: {
    /**
    The hue `--nave-color-tint` defaults to, and where it came from (R13's achromatic clause).
     */
    hue: number
    source: 'declared-default' | 'primary-seed'
  }
  /**
   * `assertNoOrphanedSemanticSlot`'s typed `open` report, made readable
   * here instead of discarded by its one caller (`runSourceGuards`, `build-step.ts`). A slot
   * resolving through the OPEN channel — neither declared nor a settled exclusion — no
   * longer passes as silently as a settled exclusion in Nave's own build; this is that
   * report surface.
   *
   * OPTIONAL, and the absence is load-bearing: this
   * key's ABSENCE means the guard did not run on this build path at all, and its PRESENCE
   * means the guard genuinely ran, with the array's own contents (possibly empty) as the
   * real result. The consumer build path (`consumer-build.ts`) never runs
   * `runSourceGuards`, so it never has a real measurement to report and omits this key
   * entirely, rather than reporting `[]` — the exact value that, on the path where this key
   * IS populated, means "measured, and nothing is open". An empty array and an absent key are
   * not interchangeable: only the latter says "not measured". The value type is
   * `MeasuredOpenSlots`, not a bare `readonly string[]` (🔵 nit): only
   * `assertNoOrphanedSemanticSlot` can produce one, so a future caller cannot claim
   * "measured" by passing a `[]` literal without ever running the guard.
   *
   * 🔵 nit: an absent key is ALSO what any producer of this JSON shape that never had this
   * field would emit — indistinguishable from "not measured" on the bytes alone. Vacuous
   * today: `composeBuildRecord` is this file's only producer, and every call site is either
   * measured (`build-step.ts`) or omits the key outright (`consumer-build.ts`), so there is
   * no third producer to collide with. If this JSON shape ever gets a second producer (a
   * cached artifact reused across a version bump, a hand-authored fixture, a future build
   * path), that producer must set this key or the two absent-key meanings become genuinely
   * ambiguous on disk.
   */
  openAdjacencySlots?: MeasuredOpenSlots
}

const NORMALIZED_REASON =
  'seed chroma reduced at constant lightness and hue to bring it inside sRGB, once, at ' +
  'ingest; naive per-channel clipping and any lightness-adjusting map are rejected'

const MAPPED_TO_WHITE_REASON =
  'seed lightness is at or above 1, where no sRGB colour has any chroma, so it was mapped ' +
  'to white, once, at ingest, as CSS Color 4 gamut mapping does'

const MAPPED_TO_BLACK_REASON =
  'seed lightness is at or below 0, where no sRGB colour has any chroma, so it was mapped ' +
  'to black, once, at ingest, as CSS Color 4 gamut mapping does'

const BAND_CLAMP_REASON =
  'the lightness used to compute the intensity scalar was clamped into the band [0.20, 0.90]; ' +
  "the seed's own lightness, hue and the emitted ramp lightnesses are untouched"

const ACHROMATIC_REASON =
  'the primary seed carries exactly zero chroma, which is a legal input rather than an error ' +
  'and selects the achromatic branch of the semantic mapping: the slots below are re-pointed ' +
  'at the neutral ramp at the resolve-semantics stage'

const SAME_COLOUR_TOLERANCE = 1e-4

/**
 * The step of `ramp` whose generated colour IS the seed's own, if any — the checkable half
 * of R3's "the seed's own colour is not guaranteed to appear at any step".
 */
function findSeedColourStep(seed: Oklch, ramp: Ramp): number | undefined {
  const found = ramp.steps.find(
    (step) =>
      Math.abs(step.l - seed.l) < SAME_COLOUR_TOLERANCE &&
      Math.abs(step.c - seed.c) < SAME_COLOUR_TOLERANCE,
  )
  return found?.step
}

/**
 * Which reason sentence names the normalization outcome that actually fired, or `undefined`
 * when the seed was not normalized at all.
 */
function normalizedReason(normalization: SeedRecord['normalization']): string | undefined {
  switch (normalization) {
    case 'chroma-reduced': {
      return NORMALIZED_REASON
    }
    case 'mapped-to-black': {
      return MAPPED_TO_BLACK_REASON
    }
    case 'mapped-to-white': {
      return MAPPED_TO_WHITE_REASON
    }
    default: {
      return undefined
    }
  }
}

/**
 *
 */
function seedBuildRecord(input: SeedInput, record: SeedRecord, ramp: Ramp): SeedBuildRecord {
  const seedColourStep = findSeedColourStep(record.usedSeed, ramp)
  return {
    input,
    resolved: record.usedSeed,
    intensityScalar: record.s,
    sLightness: record.sLightness,
    substitutions: {
      lightnessBandClamped: {
        applied: record.bandClamped,
        reason: record.bandClamped ? BAND_CLAMP_REASON : undefined,
      },
      normalized: {
        applied: record.normalized,
        reason: normalizedReason(record.normalization),
      },
    },
    achromatic: record.achromatic,
    seedColourAppearsInRamp: seedColourStep !== undefined,
    seedColourStep,
  }
}

/**
 * Composes the build record for one pipeline run. Pure: it reads what the pipeline already
 * resolved and writes no file — `build-step.ts` owns the single write phase. `seedInputs`
 * carries the seed AS GIVEN for any seed that arrived as a CSS string (R20); a seed with no
 * entry there was authored as the OKLCH triple `seeds` holds, and is recorded as exactly that.
 */
export function composeBuildRecord(
  seeds: Seeds,
  result: PipelineResult,
  openAdjacencySlots?: MeasuredOpenSlots,
  seedInputs: SeedInputs = {},
): BuildRecord {
  const isBranch = result.records.achromaticBranch
  const primaryInput: SeedInput = seedInputs.primary ?? { form: 'oklch', value: seeds.primary }
  const dangerInput: SeedInput = seedInputs.danger ?? { form: 'oklch', value: seeds.danger }
  return {
    // build-record.json is packed and shipped, so this value may only name a document the
    // reader can open. It names this package's own README, and says only that the contract is
    // documented there: the README is where the theming contract is published, it is not
    // itself a specification document, and this string must not imply that it is.
    spec: 'documented in this package\'s README ("Theming")',
    targetGamut: TARGET_GAMUT,
    seeds: {
      primary: seedBuildRecord(primaryInput, result.records.primary, result.primaryRamp),
      danger: seedBuildRecord(dangerInput, result.records.danger, result.dangerRamp),
    },
    achromaticBranch: {
      reason: isBranch ? ACHROMATIC_REASON : undefined,
      seed: isBranch ? result.records.primary.usedSeed : undefined,
      selected: isBranch,
      substitutedSlots: isBranch ? ACHROMATIC_BRANCH_SLOTS : [],
    },
    tint: {
      hue: result.records.tintHue,
      source: isBranch ? 'declared-default' : 'primary-seed',
    },
    // Omit the key entirely when nothing measured it,
    // rather than defaulting to `[]` — see the field's own docblock above for why the two are
    // not interchangeable.
    ...(openAdjacencySlots !== undefined && { openAdjacencySlots }),
  }
}
