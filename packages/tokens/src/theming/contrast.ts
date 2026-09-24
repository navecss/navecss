/**
 * R21 (the contrast-check harness) + R38 (the threshold binding) + R39 (the same-step
 * lint). Floors are transcribed from the project's signed-off contrast threshold table
 * — cited, not re-derived (one canonical home per fact): T1 (every text
 * pair 4.5:1), T2 (every non-text pair 3:1, self-imposed), T6 (the reference rendering,
 * `contrastRatio` in `color-math.ts`), T7 (a pair clearing its floor by under 1% FAILS).
 *
 * R22's own declarations (the derived pair set, its coverage floor and its "must NOT be
 * authored" entries) live in `adjacency.ts`, imported here as the one shared input.
 */

import type { PipelineResult, ResolvedSlot } from './pipeline.ts'

import { ADJACENCY, type Adjacency } from './adjacency.ts'
import { contrastRatio } from './color-math.ts'

export const TEXT_FLOOR = 4.5
export const NON_TEXT_FLOOR = 3
// T7: a pair clearing its floor by under 1 percent FAILS. Exported so an independent
// cross-check (`color-math.test.ts`) can assert against the SAME signed margin rule
// rather than transcribing its own copy of the number.
export const MARGIN = 1.01

/**
 * The three floor values `TEXT_FLOOR`/`NON_TEXT_FLOOR`/`MARGIN` above are supposed to equal.
 * They are not derived in this file and they are not a tuning knob: they are the project's
 * contrast policy, fixed 2026-08-12, and the reasons are recorded here so this file needs
 * nothing else to be read.
 *
 * 4.5 for text, with no large-text exemption: WCAG 2.2 SC 1.4.3 allows 3:1 for large text, but
 * that allowance is a property of RENDERED text and a colour token carries no type size, so no
 * pair here may claim it. 3 for non-text, per SC 1.4.11, including a filled control against the
 * surface behind it: a floor this project adopts on itself because it cannot see the rendered
 * control, not a claim that the success criterion demands 3:1 for a labelled button. 1.01 as
 * the clearance margin: the neutral scale carries chroma up to about 0.011 and its hue may be
 * re-pointed, which moves a neutral pair's ratio by up to 0.6 percent across hue at a fixed
 * lightness, so a verdict that clears its floor only inside that band is a verdict about one
 * tint rather than about the token. One percent is the rounded floor.
 *
 * What this record buys: an edit to the three constants above that is not ALSO an edit to this
 * record fails `assertFloorProvenance`, instead of landing as a silent divergence a doc comment
 * cannot catch. What it cannot do is notice that the policy itself changed. Editing both sides
 * to agree passes this guard, and that is not the way to change a floor: open an issue instead.
 */
const FLOOR_PROVENANCE = {
  textFloor: 4.5,
  nonTextFloor: 3,
  margin: 1.01,
} as const

/**
 * The three floor constants the guard below checks, as a value. Parameterising them is what
 * makes its FAILING direction reachable from a test: read straight off module scope they can
 * only ever be their shipped selves, so the check could be driven nowhere but green, and a
 * guard only ever seen passing is a guard nothing has tested. Its sibling one file over,
 * `assertNeutralChromaCeilingWithinMargin(ceiling = ...)`, already has this shape.
 */
export interface FloorConstants {
  textFloor: number
  nonTextFloor: number
  margin: number
}

const LIVE_FLOORS: FloorConstants = {
  textFloor: TEXT_FLOOR,
  nonTextFloor: NON_TEXT_FLOOR,
  margin: MARGIN,
}

/**
 * R38 build-time guard: fails the moment the three floor
 * constants above and this file's own frozen provenance record disagree, naming the signed
 * entry either side is supposed to transcribe. Defaults to the live constants, which is what
 * the build runs it on.
 */
export function assertFloorProvenance(floors: FloorConstants = LIVE_FLOORS): void {
  if (
    floors.textFloor !== FLOOR_PROVENANCE.textFloor ||
    floors.nonTextFloor !== FLOOR_PROVENANCE.nonTextFloor ||
    floors.margin !== FLOOR_PROVENANCE.margin
  ) {
    throw new Error(
      `Contrast floors: the floor constants in this file (text ${floors.textFloor}, ` +
        `non-text ${floors.nonTextFloor}, margin ${floors.margin}) no longer match the ` +
        `frozen record they are checked against. These three numbers are not this build's ` +
        `to move: they are the project's contrast policy, and this check exists so a change ` +
        `to them cannot land as a silent divergence. Revert the constant that moved. If you ` +
        `believe the policy itself should change, open an issue and say so there; do not ` +
        `update the frozen record to match the code.`,
    )
  }
}

/**
Looks up a resolved slot by name and scheme, throwing if the pipeline never emitted it.
 */
function findSlot(
  slots: readonly ResolvedSlot[],
  name: string,
  branch: 'light' | 'dark',
): ResolvedSlot {
  const found = slots.find((s) => s.slot === name && s.branch === branch)
  if (!found) throw new Error(`Slot not found for contrast check: ${name} (${branch})`)
  return found
}

export interface ContrastResult {
  pair: Adjacency
  scheme: 'light' | 'dark'
  ratio: number
  /**
  The threshold the signed table RECORDS for this pair's class (T1/T2).
   */
  floor: number
  /**
  The threshold actually APPLIED: the recorded floor plus T7's 1% margin.
   */
  threshold: number
  pass: boolean
}

/**
 * The slot set the harness resolves pairs against: every emitted semantic slot plus
 * `action.secondary`'s declared foreground and companion border, which are resolved values
 * rather than slot names of their own (R23 write-back 5, R18a round 9) and which R22
 * nevertheless declares pairs on. Shared with R39's lint below, so the two guards read the
 * SAME slot surface — a lint reading a narrower set than the harness is a lint that cannot
 * see a slot the harness judges.
 */
function harnessSlots(result: PipelineResult): readonly ResolvedSlot[] {
  return [
    ...result.slots,
    result.actionSecondaryForeground.light,
    result.actionSecondaryForeground.dark,
    result.actionSecondaryBorder.light,
    result.actionSecondaryBorder.dark,
  ]
}

/**
 * R21: a number for every declared pair, per shipped scheme, over the resolved `neutral`
 * values reconstructed exactly for `tintHue` (R10) — never approximated, no headless
 * browser. R38: compares against T1/T2's floors with T7's 1% margin. Fails closed when the
 * pair-declaration set is empty; parameterised over that set (`AC-theming-23`'s fail-closed
 * half is a CONSTRUCTED case, exercised by removing the source rather than by running the
 * pipeline as it ships).
 */
export function runContrastHarness(
  result: PipelineResult,
  adjacency: readonly Adjacency[] = ADJACENCY,
): ContrastResult[] {
  if (adjacency.length === 0) {
    throw new Error(
      'Contrast check: the pair-declaration source is empty, so there are no colour pairs to ' +
        'measure. This fails the build rather than reporting a clean run, because an untested ' +
        'palette is not a passing one. Restore the declarations; if you believe an empty set ' +
        'is correct here, open an issue rather than removing this check.',
    )
  }

  const allSlots = harnessSlots(result)

  const out: ContrastResult[] = []
  for (const scheme of ['light', 'dark'] as const) {
    for (const pair of adjacency) {
      const subject = findSlot(allSlots, pair.subject, scheme)
      const against = findSlot(allSlots, pair.against, scheme)
      const ratio = contrastRatio(subject.literal, against.literal)
      const floor = pair.class === 'text' ? TEXT_FLOOR : NON_TEXT_FLOOR
      const threshold = floor * MARGIN
      out.push({ pair, scheme, ratio, floor, threshold, pass: ratio >= threshold })
    }
  }
  return out
}

/**
 * R38 (`AC-theming-24`): the threshold comparison R21 computes but never enforces. Fails
 * the run naming every failing pair, scheme, computed ratio and recorded threshold (never
 * fail-fast on the first). Generic over `ContrastResult[]`, so a literal and a tinted
 * `neutral` pair fail identically; an exempt pair is never in `ADJACENCY` so it can never
 * reach here.
 */
export function assertContrastFloors(results: readonly ContrastResult[]): void {
  const failing = results.filter((r) => !r.pass)
  if (failing.length === 0) return
  // The message reports BOTH numbers because they are different numbers: the recorded
  // floor is the signed table's (T1/T2) and the applied threshold is that floor plus T7's
  // 1% margin. Reporting the floor alone produced "computed 4.52 below threshold 4.5",
  // which is false on its face for a pair that failed on the margin rather than the floor.
  const lines = failing.map(
    (r) =>
      `${r.pair.subject} vs ${r.pair.against} (${r.scheme}): computed ${r.ratio}, below the ` +
      `applied threshold ${roundTo(r.threshold, 4)} (the recorded floor ${r.floor} plus a 1 ` +
      'percent margin; a pair clearing only inside that margin counts as failing)',
  )
  throw new Error(
    `Contrast check: ${failing.length} colour pair(s) fall below the floor this build ` +
      `applies:\n${lines.join('\n')}\nRe-point the failing slot. If you believe the floor ` +
      'itself is wrong, open an issue rather than lowering it here.',
  )
}

/**
 * Rounds for DISPLAY only — never for the comparison itself, which runs on the unrounded
 * threshold.
 */
function roundTo(n: number, d: number): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

/**
 * R39: a slot pinned to the SAME step in both schemes must not appear on either side of a
 * text-classified pair (scale-agnostic, role-agnostic). Fails closed when the
 * pair-declaration set is empty.
 */
function groupSlotsByName(
  slots: readonly ResolvedSlot[],
): Map<string, { dark?: ResolvedSlot; light?: ResolvedSlot }> {
  const bySlot = new Map<string, { dark?: ResolvedSlot; light?: ResolvedSlot }>()
  for (const slot of slots) {
    const entry = bySlot.get(slot.slot) ?? {}
    entry[slot.branch] = slot
    bySlot.set(slot.slot, entry)
  }
  return bySlot
}

/**
Slots resolving to the identical `{ scale, step }` in both schemes — R39's target.
 */
function findPinnedSlots(slots: readonly ResolvedSlot[]): Set<string> {
  const pinned = new Set<string>()
  for (const [name, { light, dark }] of groupSlotsByName(slots)) {
    if (!light || !dark) continue
    const isSamePin =
      light.resolved.scale === dark.resolved.scale && light.resolved.step === dark.resolved.step
    if (isSamePin) pinned.add(name)
  }
  return pinned
}

export type SameStepSource = 'nave' | 'consumer'
type SameStepSeverity = 'fail' | 'report'
export interface SameStepViolation {
  slot: string
  description: string
  severity: SameStepSeverity
}

/**
 * Fails for Nave's own defaults, reports (never fails) for a consumer's build — same
 * predicate, only severity differs. No suppression flag or allowlist here; the one lawful
 * exemption is the project's accessibility and licensing reviewer's.
 */
export function checkSameStepLint(
  result: PipelineResult,
  source: SameStepSource = 'nave',
  adjacency: readonly Adjacency[] = ADJACENCY,
): SameStepViolation[] {
  if (adjacency.length === 0) {
    throw new Error(
      'Same-step lint: the pair-declaration source is empty. Those declarations are what ' +
        'mark a pair as text or non-text, which is the only thing this lint reads, so with ' +
        'nothing declared there is nothing to check. That is not the same as nothing being ' +
        'wrong, so this fails rather than reporting a clean run. Restore the declarations, ' +
        'or open an issue.',
    )
  }

  // R21's harness and this lint read the SAME slot surface (`harnessSlots`). Reading only
  // `result.slots` here left action.secondary's declared foreground and companion border
  // out of the pinned set while R22 declares a text pair on the foreground.
  const pinned = findPinnedSlots(harnessSlots(result))
  const severity: SameStepSeverity = source === 'nave' ? 'fail' : 'report'
  const hits = new Map<string, SameStepViolation>()
  const record = (slot: string, description: string): void =>
    void hits.set(`${slot}:${description}`, { slot, description, severity })

  for (const pair of adjacency) {
    if (pair.class !== 'text') continue
    if (pinned.has(pair.subject)) {
      record(pair.subject, `${pair.subject} (subject of ${pair.subject}/${pair.against})`)
    }
    if (pinned.has(pair.against)) {
      record(pair.against, `${pair.against} (background of ${pair.subject}/${pair.against})`)
    }
  }
  return hits.values().toArray()
}

/**
 * R39's real violation output: fails naming every 'fail'-severity same-step hit, verbatim
 * and unfiltered (a 'report'-severity hit, source `'consumer'`, never reaches this — see
 * `checkSameStepLint` above). Extracted from `build-step.ts`'s `runResultGuards`
 * (`copy-lint.ts`'s `ACCESSIBILITY_GUARD_MESSAGE_PROBES`) so the
 * copy-check probe drives this REAL exported function through a hand-built violations
 * array, rather than holding a second, separately-maintained copy of the message text.
 */
export function assertNoSameStepViolations(sameStep: readonly SameStepViolation[]): void {
  const failing = sameStep.filter((violation) => violation.severity === 'fail')
  if (failing.length > 0) {
    const lines = failing.map((violation) => violation.description)
    throw new Error(
      `${failing.length} slot(s) resolve to the same palette step in both the light and the ` +
        `dark scheme while sitting on one side of a pair marked as text:\n${lines.join('\n')}` +
        '\nRe-point the listed slot(s) so each pair keeps a light/dark step difference, or ' +
        'open an issue.',
    )
  }
}
