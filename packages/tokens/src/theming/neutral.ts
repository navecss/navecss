/**
 * R9/R10: the `neutral` scale's browser-time half. Unlike `primary`/`danger` (build-time
 * literal `oklch()`, R9), `neutral` expands via relative colour syntax that substitutes the
 * HUE channel only (R10) from one emitted input, `--nave-color-tint`. Lightness and chroma
 * are always build-time literals, so the chroma ceiling has to be HUE-INDEPENDENT: a single
 * value that stays inside sRGB at every step's lightness and at every possible hue, which is
 * what makes hue-only substitution safe at any tint (R9's "about 0.011" ceiling).
 *
 * There is no consumer-facing "neutral intensity" parameter (`s_neutral` does not exist):
 * this ceiling is an internal Nave-authored constant, not a flag.
 */

import { contrastRatio, maxChroma, type Oklch } from './color-math.ts'
import { STEP_TABLE } from './step-table.ts'

const HUE_SWEEP_STEP_DEG = 5
/**
 * Safety margin, mirroring R4's general 0.95 ceiling, applied on top of the
 * hue-sweep minimum so the computed constant is not sitting exactly on the boundary.
 */
const SAFETY_FACTOR = 0.95

/**
 * The single hue-independent chroma ceiling neutral steps may use: the minimum, over a
 * dense hue sweep, of `maxChroma(L, h)` across every non-extreme step lightness, scaled
 * by `SAFETY_FACTOR`. Computed once; every neutral step (other than the 0/1000 anchors,
 * which are chroma-zero by construction at any hue) shares this one ceiling.
 */
export function computeNeutralChromaCeiling(): number {
  let min = Infinity
  for (const { l } of STEP_TABLE) {
    if (l <= 0 || l >= 1) continue // chroma is 0 at the anchors regardless of hue
    for (let h = 0; h < 360; h += HUE_SWEEP_STEP_DEG) {
      const cap = maxChroma(l, h)
      if (cap < min) min = cap
    }
  }
  return min * SAFETY_FACTOR
}

/**
 * The clearance margin, as a fraction: a pair clearing its floor by under this fraction FAILS.
 * It is the project's contrast policy rather than a constant of this module, and the reason it
 * exists is that the neutral scale carries chroma up to about 0.011 and its hue may be
 * re-pointed, which moves a neutral pair's ratio by up to 0.6 percent across hue at a fixed
 * lightness: a verdict inside that band is a verdict about one tint rather than about the
 * token. The bound below holds the neutral chroma ceiling to the same number, rather than to a
 * round constant that happens to sit near it.
 */
const HUE_BAND_MARGIN = 0.01

const ACHROMATIC_WHITE: Oklch = { l: 1, c: 0, h: 0 }
const ACHROMATIC_BLACK: Oklch = { l: 0, c: 0, h: 0 }

/**
 * The relative spread (`max / min - 1`) a full hue sweep introduces into the contrast ratio
 * between a chroma-`ceiling`, lightness-`l` neutral step and one achromatic `anchor`. Split
 * out of `computeNeutralHueBandSpread` so the outer function's own loop stays within the
 * complexity/nesting budget every module in this package holds to.
 */
function hueSweepSpreadAt(l: number, ceiling: number, anchor: Oklch): number {
  let min = Infinity
  let max = -Infinity
  for (let h = 0; h < 360; h += HUE_SWEEP_STEP_DEG) {
    const ratio = contrastRatio({ l, c: ceiling, h }, anchor)
    if (ratio < min) min = ratio
    if (ratio > max) max = ratio
  }
  return min > 0 ? max / min - 1 : 0
}

/**
 * The worst-case relative spread a full hue sweep introduces into the contrast ratio
 * between a chroma-`ceiling` neutral step and an achromatic anchor (white or black),
 * maximised over every non-anchor step lightness. It DOMINATES, rather than reproduces, the
 * figures an earlier hand measurement found ("0.696 percent" / "1.634
 * percent" / "2.080 percent"): those are the specific row-8 pair (`border.control` against
 * `surface.base`) at three ceilings, while this takes the worst case over every step
 * lightness and both achromatic anchors, so at the shipped ceiling it reads 0.736 percent
 * against that pair's 0.696. A bound that dominates the measured case is the one worth
 * asserting; saying "the same quantity" would be a stronger claim than the code makes.
 * Computed generically, against a fixed achromatic reference rather than any one declared
 * pair, so this stays a ceiling-level bound and does not widen R21's harness into evaluating
 * the hue sweep itself (one candidate remedy, explicitly not taken here).
 * The project's accessibility and licensing reviewer's ceiling-clearance statement is what
 * this instruments ("if
 * the neutral chroma ceiling rises, the 0.70 percent spread grows against T7's fixed 1
 * percent, and the agreement has to be re-measured rather than inherited").
 */
export function computeNeutralHueBandSpread(ceiling = computeNeutralChromaCeiling()): number {
  let worst = 0
  for (const { l } of STEP_TABLE) {
    if (l <= 0 || l >= 1) continue // chroma is 0 at the anchors regardless of hue
    for (const anchor of [ACHROMATIC_WHITE, ACHROMATIC_BLACK]) {
      const spread = hueSweepSpreadAt(l, ceiling, anchor)
      if (spread > worst) worst = spread
    }
  }
  return worst
}

/**
 * The reason clause for `assertNeutralChromaCeilingWithinMargin`'s thrown
 * message, promoted to a named constant for the same review-diff-visibility reason as the
 * three constants in `adjacency.ts`. Cleared bytes (cleared by the project's licensing and
 * accessibility reviewer); extraction only.
 */
const NEUTRAL_CHROMA_CEILING_MARGIN_REASON =
  'at or past the 1 percent margin this build holds. That margin is a fixed constraint ' +
  "of the palette's design and is not this build's to move: a pair clearing its floor " +
  'only inside that margin is telling you about one tint, not about the token. ' +
  'Re-measure the tinted-neutral arithmetic before shipping a ceiling change. If you ' +
  'believe the margin itself is wrong, open an issue rather than widening it here.'

/**
 * R38 build-time guard: fails the moment
 * the shipped ceiling's own hue-band spread would eat into T7's fixed 1 percent margin,
 * rather than trusting a round `< 0.02` bound (three times the shipped value, itself twice
 * T7's margin at the measured band) to stand in for it. Equivalent to bounding the ceiling
 * itself by a derived `C_max`: `computeNeutralHueBandSpread` is monotonically increasing in
 * `ceiling`, so asserting the spread directly against `HUE_BAND_MARGIN` needs no separate
 * inversion step and stays correct even where that relationship is not exactly linear.
 */
export function assertNeutralChromaCeilingWithinMargin(
  ceiling = computeNeutralChromaCeiling(),
): void {
  const spread = computeNeutralHueBandSpread(ceiling)
  if (spread >= HUE_BAND_MARGIN) {
    throw new Error(
      `Neutral chroma ceiling: the ceiling ${ceiling} produces a worst-case hue-band spread ` +
        `of ${(spread * 100).toFixed(3)} percent in the contrast values derived from it, ${
          NEUTRAL_CHROMA_CEILING_MARGIN_REASON
        }`,
    )
  }
}

export interface NeutralStep {
  step: number
  l: number
  /**
  The build-time literal chroma for this step (hue-independent, safe at every hue).
   */
  c: number
}

/**
 * The neutral ramp's build-time-literal half: lightness and chroma per step, hue omitted
 * (it is substituted at browser time from `--nave-color-tint`, R10).
 */
export function generateNeutralRampLiterals(
  ceiling = computeNeutralChromaCeiling(),
): readonly NeutralStep[] {
  return STEP_TABLE.map(({ step, l }) => ({ step, l, c: l <= 0 || l >= 1 ? 0 : ceiling }))
}

/**
 * Resolves a neutral step to a concrete OKLCH colour under a given tint hue — used both to
 * render the RCS formula's literal components and, in Node, to reconstruct the exact
 * browser-resolved value for a known hue (R21's harness, which must compute pairs exactly
 * rather than approximately).
 */
export function resolveNeutralStep(
  step: number,
  hue: number,
  literals: readonly NeutralStep[] = generateNeutralRampLiterals(),
): Oklch {
  const found = literals.find((s) => s.step === step)
  if (!found) throw new Error(`Neutral step ${step} is not in the shared step table.`)
  return { l: found.l, c: found.c, h: hue }
}

/**
 * The CSS relative-colour-syntax formula for a neutral step: literal L and C, hue taken
 * `from` the tint custom property and nothing else (R10).
 */
export function neutralRcsFormula(step: number, literals: readonly NeutralStep[]): string {
  const found = literals.find((s) => s.step === step)
  if (!found) throw new Error(`Neutral step ${step} is not in the shared step table.`)
  return `oklch(from var(--nave-color-tint) ${roundTo(found.l, 4)} ${roundTo(found.c, 4)} h)`
}

/**
 *
 */
function roundTo(n: number, d: number): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}
