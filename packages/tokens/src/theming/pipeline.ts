/**
 * G1 theming pipeline (the accepted theming specification), R31's mandated order:
 *   seed -> generate ramp -> apply per-step overrides -> resolve semantics
 *
 * Exported as a module `build.ts` calls (the project's principal engineer's
 * implementation-shape request): this is what makes `AC-theming-37`'s three-call ordering
 * test possible without a subprocess harness, and what the consumer-invocable entry point
 * wraps.
 */

import type { Oklch } from './color-math.ts'

import { formatOklch } from './color-math.ts'
import {
  computeNeutralChromaCeiling,
  generateNeutralRampLiterals,
  neutralRcsFormula,
  type NeutralStep,
  resolveNeutralStep,
} from './neutral.ts'
import { DEFAULT_ENV, generateRamp, type Ramp, rampStep, type SeedRecord } from './ramp.ts'
import {
  ACTION_SECONDARY_BORDER,
  ACTION_SECONDARY_FOREGROUND,
  resolveSlotMapping,
  SEMANTIC_SLOTS,
  type SlotMapping,
  type StepRef,
} from './semantics.ts'

export interface Seeds {
  primary: Oklch
  danger: Oklch
  /**
   * The tint's declared default hue, used only when `primary` is achromatic (R13's
   * achromatic clause: the tint never inherits an undefined hue). Ignored otherwise —
   * the tint's default then derives from the primary seed's own hue.
   */
  declaredTintHue: number
}

/**
 * R31's three scale names, the ONE canonical home. `overrides.ts`'s
 * runtime validator and `PerStepOverrides`'s compile-time key set used to name these three
 * strings independently, with nothing checking the two agreed; the type is now DERIVED from
 * this array (one canonical home per fact) rather than declared a second time.
 */
export const OVERRIDE_SCALE_NAMES = ['danger', 'neutral', 'primary'] as const

/**
 * R31: per-step overrides, applied to a generated ramp before semantics resolve. Keyed by
 * scale then step number.
 */
export type PerStepOverrides = Partial<
  Record<(typeof OVERRIDE_SCALE_NAMES)[number], Record<number, number>>
>

interface PipelineRecords {
  primary: SeedRecord
  danger: SeedRecord
  /**
  True when R3(a)'s achromatic branch fires (selected by the `primary` seed alone).
   */
  achromaticBranch: boolean
  tintHue: number
}

export interface ResolvedSlot {
  slot: string
  branch: 'dark' | 'light'
  /**
  The scale + step this slot resolves to after following any alias chain.
   */
  resolved: { scale: 'danger' | 'neutral' | 'primary'; step: number }
  /**
   * The concrete OKLCH colour this slot resolves to under the pipeline's own tint hue
   * (for `neutral`-derived slots, the value reconstructed exactly per R10 — real for the
   * shipped default's tint, not a browser-time unknown; the emitted CSS still carries the
   * RCS formula, not this literal, per R9/R11).
   */
  literal: Oklch
  /**
   * The CSS value this slot emits: an `oklch()` literal (primary/danger) or an RCS
   * formula reading `--nave-color-tint` (neutral), per R9/R10/R11.
   */
  css: string
}

export interface PipelineResult {
  records: PipelineRecords
  primaryRamp: Ramp
  dangerRamp: Ramp
  neutralLiterals: readonly NeutralStep[]
  /**
   * Every resolved slot, both branches, for every slot in `SEMANTIC_SLOTS` plus the two
   * action.secondary companions (declared foreground, companion border) which are not
   * separate slot NAMES but resolved values components need.
   */
  slots: readonly ResolvedSlot[]
  actionSecondaryForeground: { dark: ResolvedSlot; light: ResolvedSlot }
  actionSecondaryBorder: { dark: ResolvedSlot; light: ResolvedSlot }
}

/**
 * The generated ramps and literals a slot resolves against — bundled so the resolver
 * functions below stay under the project's max-params budget.
 */
interface GenerationContext {
  primaryRamp: Ramp
  dangerRamp: Ramp
  neutralLiterals: readonly NeutralStep[]
  tintHue: number
  isAchromaticBranch: boolean
}

/**
 * Follows an alias chain (iteratively — a cycle is a build defect, not a stack hazard)
 * down to a concrete `{ scale, step }`.
 */
function resolveStepRef(
  ref: StepRef,
  branch: 'dark' | 'light',
  isAchromaticBranch: boolean,
): { scale: 'danger' | 'neutral' | 'primary'; step: number } {
  let current = ref
  for (let depth = 0; depth < 10; depth++) {
    if (!('alias' in current)) return current
    const target = resolveSlotMapping(current.alias, isAchromaticBranch)
    current = target[branch]
  }
  throw new Error('Alias chain too deep — likely a cycle in the semantic mapping.')
}

/**
 *
 */
function cssForResolved(
  resolved: { scale: 'danger' | 'neutral' | 'primary'; step: number },
  ctx: GenerationContext,
): { css: string; literal: Oklch } {
  if (resolved.scale === 'neutral') {
    const colour = resolveNeutralStep(resolved.step, ctx.tintHue, ctx.neutralLiterals)
    return { css: neutralRcsFormula(resolved.step, ctx.neutralLiterals), literal: colour }
  }
  const ramp = resolved.scale === 'primary' ? ctx.primaryRamp : ctx.dangerRamp
  const colour = rampStep(ramp, resolved.step)
  return { css: formatOklch(colour), literal: colour }
}

/**
 *
 */
function resolveOne(
  slot: string,
  ref: StepRef,
  branch: 'dark' | 'light',
  ctx: GenerationContext,
): ResolvedSlot {
  const resolved = resolveStepRef(ref, branch, ctx.isAchromaticBranch)
  const { css, literal } = cssForResolved(resolved, ctx)
  return { slot, branch, resolved, css, literal }
}

/**
 *
 */
function applyOverrides<T extends { c: number; step: number }>(
  steps: readonly T[],
  overrides: Record<number, number> | undefined,
): readonly T[] {
  if (!overrides) return steps
  return steps.map((s) => {
    const override = overrides[s.step]
    return override === undefined ? s : { ...s, c: override }
  })
}

/**
Steps 1-3 of R31: seed -> generate ramp -> apply per-step overrides.
 */
function generateRamps(
  seeds: Seeds,
  overrides: PerStepOverrides,
  env: ReadonlyMap<number, number>,
): GenerationContext {
  const primaryGenerated = generateRamp(seeds.primary, env)
  const dangerGenerated = generateRamp(seeds.danger, env)

  const finalPrimaryRamp: Ramp = {
    ...primaryGenerated,
    steps: applyOverrides(primaryGenerated.steps, overrides.primary),
  }
  const finalDangerRamp: Ramp = {
    ...dangerGenerated,
    steps: applyOverrides(dangerGenerated.steps, overrides.danger),
  }
  const neutralLiterals = applyOverrides(
    generateNeutralRampLiterals(computeNeutralChromaCeiling()),
    overrides.neutral,
  )

  const isAchromaticBranch = finalPrimaryRamp.seedRecord.achromatic
  const tintHue = isAchromaticBranch
    ? seeds.declaredTintHue
    : finalPrimaryRamp.seedRecord.usedSeed.h

  return {
    primaryRamp: finalPrimaryRamp,
    dangerRamp: finalDangerRamp,
    neutralLiterals,
    tintHue,
    isAchromaticBranch,
  }
}

/**
Step 4 of R31 (resolve semantics): every named slot, both branches.
 */
function resolveAllSlots(ctx: GenerationContext): ResolvedSlot[] {
  const slots: ResolvedSlot[] = []
  for (const slotName of SEMANTIC_SLOTS) {
    const mapping: SlotMapping = resolveSlotMapping(slotName, ctx.isAchromaticBranch)
    for (const branch of ['light', 'dark'] as const) {
      slots.push(resolveOne(slotName, mapping[branch], branch, ctx))
    }
  }
  return slots
}

/**
 *
 */
function resolveActionSecondaryCompanions(
  ctx: GenerationContext,
): Pick<PipelineResult, 'actionSecondaryBorder' | 'actionSecondaryForeground'> {
  const fgRef: StepRef = { alias: ACTION_SECONDARY_FOREGROUND }
  const borderRef: StepRef = { alias: ACTION_SECONDARY_BORDER }
  return {
    actionSecondaryForeground: {
      light: resolveOne('action.secondary.foreground', fgRef, 'light', ctx),
      dark: resolveOne('action.secondary.foreground', fgRef, 'dark', ctx),
    },
    actionSecondaryBorder: {
      light: resolveOne('action.secondary.border', borderRef, 'light', ctx),
      dark: resolveOne('action.secondary.border', borderRef, 'dark', ctx),
    },
  }
}

/**
 * Runs the full pipeline in R31's mandated order. `overrides` are applied to the ramp
 * (per-step, before semantics resolve) — clobbering either the override or the generation
 * order is exactly what `AC-theming-37` exists to catch. `env` is R7's build parameter,
 * carried through so a run with a modified curve regenerates from the parameter alone
 * (`AC-theming-08`) rather than only the generator being re-callable with one.
 */
export function runPipeline(
  seeds: Seeds,
  overrides: PerStepOverrides = {},
  env: ReadonlyMap<number, number> = DEFAULT_ENV,
): PipelineResult {
  const ctx = generateRamps(seeds, overrides, env)

  const records: PipelineRecords = {
    primary: ctx.primaryRamp.seedRecord,
    danger: ctx.dangerRamp.seedRecord,
    achromaticBranch: ctx.isAchromaticBranch,
    tintHue: ctx.tintHue,
  }

  const slots = resolveAllSlots(ctx)
  const companions = resolveActionSecondaryCompanions(ctx)

  return {
    records,
    primaryRamp: ctx.primaryRamp,
    dangerRamp: ctx.dangerRamp,
    neutralLiterals: ctx.neutralLiterals,
    slots,
    ...companions,
  }
}
