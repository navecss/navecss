/**
 * R36's probe registry: the hand-built failing-direction thunks that drive the real
 * build-thrown messages `assertHarnessFramingIsClean` (`copy-lint.ts`) reads, plus the fixture
 * helpers they share. Split out of `copy-lint.ts` because the registry is the half that grows
 * — an enumeration widened by every round that finds another unprobed message, against a lint
 * whose own rules are fixed — and it had raised that file's `max-lines` override twice,
 * the second time to a number set by
 * the file's exact length. The eslint override recorded splitting this registry as "the next
 * act, not an option"; this is that act, and both files now sit under the default budget.
 *
 * `assertHarnessFramingIsClean` deliberately did NOT move with it: it is imported by
 * `build-step.ts`, named in `build-step.test.ts`'s wiring table by module path, and
 * re-imported under `vi.doMock` by five of `copy-lint.test.ts`'s module-mock tests. Moving the
 * assertion would have re-pointed a wiring guard and five mock paths to buy nothing; moving
 * only the data leaves `copy-lint.ts`'s export surface byte-identical.
 */

import type { PipelineResult, ResolvedSlot } from './pipeline.ts'

import {
  ADJACENCY,
  type Adjacency,
  assertCoverageFloor,
  assertNoFocusableAdjacentToActionFill,
  assertNoForbiddenAdjacency,
  assertNoOrphanedSemanticSlot,
} from './adjacency.ts'
import {
  assertContrastFloors,
  assertFloorProvenance,
  assertNoSameStepViolations,
  checkSameStepLint,
  type ContrastResult,
  runContrastHarness,
  type SameStepViolation,
} from './contrast.ts'
import { assertNoticeIsEmitted, RETHEMING_NOTICE } from './copy-lint.ts'
import { TINT_SEED_COMMENT_STEM } from './emit.ts'
import { assertNeutralChromaCeilingWithinMargin } from './neutral.ts'

/**
 * Runs `fn`, expecting it to throw, and returns the thrown message. Throws (rather than
 * returning `undefined`) if `fn` does NOT throw, so a fixture that stops reproducing the
 * real failing direction it exists to capture is itself a loud defect, never silently
 * absorbed into "nothing to check".
 */
function capturedFailureMessage(fn: () => void): string {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('capturedFailureMessage: the given function did not throw as expected.')
}

/**
 * A hand-built `ResolvedSlot` pinned to one step (the same-step-lint probe
 * fixture).
 */
function pinnedSlot(slot: string, step: number): ResolvedSlot {
  return {
    slot,
    branch: 'light',
    resolved: { scale: 'neutral', step },
    literal: { l: 0.18, c: 0, h: 0 },
    css: 'oklch(0.18 0 0)',
  }
}

/**
 * The same slot pinned at possibly different steps in each scheme.
 */
function pinnedPair(
  slot: string,
  light: number,
  dark: number,
): { dark: ResolvedSlot; light: ResolvedSlot } {
  return { dark: { ...pinnedSlot(slot, dark), branch: 'dark' }, light: pinnedSlot(slot, light) }
}

/**
 * One printed-message probe: a label plus a thunk guaranteed to throw the real message to
 * check. Every probe drives the REAL exported function through a
 * hand-built failing input, never an invented literal — the defect
 * `assertHarnessFramingIsClean` fixes (two hand-written strings with no
 * producer anywhere in the package).
 */
export interface GuardMessageProbe {
  label: string
  capture: () => string
}

/**
 * The `noticeLabel` the notice probes below pass. Every `assertNoticeIsEmitted` message opens
 * with it, so it is part of the text being read: a plain-prose label naming the notice, the
 * same shape `build-step.ts` passes (never a rule number).
 */
const NOTICE_PROBE_LABEL = 'Retheming notice'

/**
 * The build-thrown messages that state an accessibility position: two from
 * the original measurement of accessibility-stating messages (R21's harness, R38's threshold), four
 * more it found missing (`checkSameStepLint`'s fail-closed branch, `assertFloorProvenance`,
 * `assertNeutralChromaCeilingWithinMargin`, `assertNoOrphanedSemanticSlot`), plus a seventh added
 * in a later round: `checkSameStepLint`'s fail-closed branch and its real 'fail'-output
 * (`assertNoSameStepViolations`) are DIFFERENT branches, and only the former was read. Eight
 * reachable messages remained unprobed after that round ITSELF (nine per that round's own
 * measurement, less the one it added), and that round's own version of this docblock recorded
 * that residual rather than closing it. **Still an enumeration, not a self-updating class** (a
 * known residual from that original measurement) — `runSourceGuards`/`THROWING_GUARDS` are two
 * other places a guard in this family registers, neither mechanically tied to this one; a future
 * guard added there without a probe here repeats this gap.
 *
 * Three more, from its review:
 * `assertNoticeIsEmitted`'s absent-notice, multi-line-notice and not-a-self-contained-comment
 * refusals — three of the four reachable `assertNoticeIsEmitted` messages, all four of which
 * were already inside that earlier round's eight. That leaves five of its residual, on a
 * convention made explicit here rather than left for the next reader to re-derive: the fourth
 * `assertNoticeIsEmitted` message (the composed-comment-line refusal) is permanently excluded
 * rather than probed this round — see `STRUCTURALLY_UNPROBEABLE_GUARD_MESSAGES` below, which
 * is the whole point of that row — and a permanently-excluded message STAYS counted in the
 * residual rather than being discharged from it: it can never move to "probed", so it never
 * leaves "unprobed" either. The five are therefore four ordinarily-probeable messages still
 * open plus this one structurally-excluded message, not five messages all waiting on a future
 * probe.
 *
 * Three more after that: `assertCoverageFloor`, `assertNoForbiddenAdjacency` and
 * `assertNoFocusableAdjacentToActionFill`, the three guards used to show the gap was still
 * live. A conformance phrase written into any of their real messages passed
 * `assertHarnessFramingIsClean()` with the test suite green, because none of the three was in
 * this registry; with these probes, the same edit fails it.
 *
 * **What remains unprobed: five messages**, counted against the original measurement rather
 * than the running count above (that count included `assertNoticeIsEmitted`'s refusals, which
 * the original measurement did not list).
 * - Two cannot be probed by this check at all: `assertDescriptionsAreClean`'s message and
 *   `assertNoticeIsClean`'s framing refusal both quote the phrase they caught, so any input
 *   that makes them throw also makes their message fail this check. `copy-lint.test.ts` pins
 *   that property.
 * - Three can be, and are not yet: `assertNoticeIsClean`'s warranty-wording refusal and
 *   `assertOnStarShape`'s two refusals in `on-star.ts` (the declared resting partner not being
 *   the family's solid-background anchor, and the anchor being a state or foreground role
 *   rather than a resting background). Each needs its own hand-built failing input.
 */
export const ACCESSIBILITY_GUARD_MESSAGE_PROBES: readonly GuardMessageProbe[] = [
  {
    label: "the contrast harness's fail-closed output",
    // R21's fail-closed message (AC-theming-23's own failing direction): the adjacency
    // check runs before `result` is ever read, so an empty PipelineResult is safe here —
    // this is a copy check on the real thrown text, never a contrast computation.
    capture: () => capturedFailureMessage(() => runContrastHarness({} as PipelineResult, [])),
  },
  {
    label: 'the contrast-floor threshold-failure output',
    // One hand-built failing ContrastResult, never a real pipeline run — the real numbers
    // are irrelevant to a copy check.
    capture: () =>
      capturedFailureMessage(() =>
        assertContrastFloors([
          {
            pair: { subject: 'content.primary', against: 'surface.base', class: 'text' },
            scheme: 'light',
            ratio: 1,
            floor: 4.5,
            threshold: 4.545,
            pass: false,
          } satisfies ContrastResult,
        ]),
      ),
  },
  {
    label: 'the same-step lint fail-closed output',
    // An empty adjacency source is the lint's own fail-closed direction (contrast.ts),
    // independent of the pipeline result it is never asked to read for this branch.
    capture: () =>
      capturedFailureMessage(() => checkSameStepLint({} as PipelineResult, 'nave', [])),
  },
  {
    label: 'the floor-provenance mismatch output',
    // Any floor triple that disagrees with the frozen citation trips this — the real
    // numbers are irrelevant to a copy check, only the mismatch is needed.
    capture: () =>
      capturedFailureMessage(() =>
        assertFloorProvenance({ textFloor: 0, nonTextFloor: 0, margin: 0 }),
      ),
  },
  {
    label: 'the neutral chroma-ceiling margin output',
    // A ceiling of 1 (the maximum representable chroma) drives the hue-band spread far past
    // the fixed 1 percent margin; the real shipped ceiling never reaches this branch.
    capture: () => capturedFailureMessage(() => assertNeutralChromaCeilingWithinMargin(1)),
  },
  {
    label: 'the orphaned-semantic-slot output',
    // A slot absent from the shipped adjacency declaration, exclusions and open records —
    // the same construction `contrast.test.ts`'s own AC-theming-26 coverage uses.
    capture: () => capturedFailureMessage(() => assertNoOrphanedSemanticSlot(['content.brandNew'])),
  },
  {
    label: 'the adjacency coverage-floor output',
    // One of the three guards a quality reviewer used to demonstrate this gap: a poisoned
    // wording injected into each of these three real functions still passed
    // assertHarnessFramingIsClean, because none of the three was in this registry. Same
    // fixture as contrast.test.ts's own full-content pin: dropping every `border.control`
    // declaration is C5's minimum-coverage narrowing, caught naming the missing category.
    capture: () =>
      capturedFailureMessage(() =>
        assertCoverageFloor(ADJACENCY.filter((a) => a.subject !== 'border.control')),
      ),
  },
  {
    label: 'the forbidden-adjacency output',
    // R22 entry 1's own single named pair (content.secondary/surface.inverse), same fixture
    // as contrast.test.ts's full-content pin — the smallest construction that trips this
    // guard's real failing direction without touching any other guard's shipped behaviour.
    capture: () =>
      capturedFailureMessage(() =>
        assertNoForbiddenAdjacency([
          { subject: 'content.secondary', against: 'surface.inverse', class: 'text' },
        ] satisfies Adjacency[]),
      ),
  },
  {
    label: 'the focusable-adjacent-to-action-fill output',
    // R22 entry 5: the one focusable slot (border.focus) declared against an action.* fill,
    // same fixture as contrast.test.ts's full-content pin.
    capture: () =>
      capturedFailureMessage(() =>
        assertNoFocusableAdjacentToActionFill([
          ...ADJACENCY,
          { subject: 'border.focus', against: 'action.primary', class: 'non-text' },
        ] satisfies Adjacency[]),
      ),
  },
  {
    label: "the same-step lint's real violation output (build-step.ts's runResultGuards)",
    // The probe above reads checkSameStepLint's FAIL-CLOSED branch only;
    // this is the branch that prints on a real 'fail' hit. Pins content.primary (ADJACENCY
    // row 1's TEXT subject) to the identical step both schemes, same shape as
    // contrast.test.ts's pinnedResult. The third argument is EXPLICIT, never omitted:
    // build-step.test.ts's mocks key on the bare (no-third-argument) call.
    capture: () => {
      const pinned = pinnedSlot('content.primary', 900)
      const result = {
        slots: [pinned, { ...pinned, branch: 'dark' }],
        actionSecondaryForeground: pinnedPair('action.secondary.foreground', 100, 200),
        actionSecondaryBorder: pinnedPair('action.secondary.border', 500, 400),
      } as unknown as PipelineResult
      const sameStep: readonly SameStepViolation[] = checkSameStepLint(result, 'nave', ADJACENCY)
      return capturedFailureMessage(() => assertNoSameStepViolations(sameStep))
    },
  },
  {
    label: "the emitted-notice guard's absent-notice refusal",
    // Review blue row 2. CSS carrying no notice at all is that refusal's own
    // failing direction; the notice argument is the real shipped constant, never a literal.
    capture: () =>
      capturedFailureMessage(() =>
        assertNoticeIsEmitted(':root {\n}', RETHEMING_NOTICE, NOTICE_PROBE_LABEL),
      ),
  },
  {
    label: "the emitted-notice guard's multi-line-notice refusal",
    // A notice with a newline in it: present in the CSS, carried whole by no single line.
    capture: () => {
      const split = `${RETHEMING_NOTICE.slice(0, 10)}\n${RETHEMING_NOTICE.slice(10)}`
      return capturedFailureMessage(() =>
        assertNoticeIsEmitted(
          `:root {\n  ${TINT_SEED_COMMENT_STEM}${split} */\n}`,
          split,
          NOTICE_PROBE_LABEL,
        ),
      )
    },
  },
  {
    label: "the emitted-notice guard's not-a-self-contained-comment refusal",
    // The wrapped-comment shape emit.ts can already produce: the carrying line opens no
    // comment of its own, so the reader sees a line this check cannot read.
    capture: () =>
      capturedFailureMessage(() =>
        assertNoticeIsEmitted(
          `:root {\n  /* wrapped, so\n   * ${RETHEMING_NOTICE} */\n}`,
          RETHEMING_NOTICE,
          NOTICE_PROBE_LABEL,
        ),
      ),
  },
]

/**
 * The one reachable `assertNoticeIsEmitted` message that CANNOT join the registry above, and
 * why — that round's review, blue row 2, whose whole content is that this is a
 * STRUCTURAL exclusion rather than an oversight. Its composed-comment-line refusal interpolates
 * `findConformanceFraming`'s own `${reason}`, and a reason always quotes the forbidden phrase
 * it found ("contains the word \"meets\""). Probing it would therefore feed that phrase straight
 * back into `findConformanceFraming` and report an R36 violation against the guard that just
 * did its job — so anyone closing that earlier round's residual by sweeping in every reachable
 * message gets a red run, and reads it as a real defect in shipped copy.
 *
 * Recorded as thunks rather than prose so the carve-out is MEASURED, not asserted: the test
 * that reads this list drives each entry and requires it to still trip the lint. An entry that
 * stops tripping has stopped being structurally excluded and belongs in the registry above; the
 * test says so and goes red rather than leaving a stale exemption standing.
 *
 * Deliberately NOT a suppression: nothing reads this list to skip a check, and
 * `assertHarnessFramingIsClean` never sees these messages at all. The ground for that is NOT
 * that R36 has no view here. Read literally it condemns this message, which does carry the
 * phrase. The ground is the rule this package already follows next door in
 * `assertNoticeIsClean`, whose interpolated reason is left dirty on purpose: a diagnostic that
 * hides the value it is complaining about is useless, so the quoted phrase is a quotation of
 * the author's own input and never a claim of Nave's. That ground is narrow by construction,
 * which a scope carve-out would not be: it exempts a quotation, not a message. If anything
 * ever DOES read this list to skip a check, it has become a suppression and the exemption
 * returns to the project's accessibility and licensing reviewer.
 */
export const STRUCTURALLY_UNPROBEABLE_GUARD_MESSAGES: readonly GuardMessageProbe[] = [
  {
    label: "the emitted-notice guard's composed-comment-line refusal",
    capture: () =>
      capturedFailureMessage(() =>
        assertNoticeIsEmitted(
          `:root {\n  /* meets ${TINT_SEED_COMMENT_STEM.slice(3)}${RETHEMING_NOTICE} */\n}`,
          RETHEMING_NOTICE,
          NOTICE_PROBE_LABEL,
        ),
      ),
  },
]
