/**
 * R22: the "must"/"must NOT" ANALYSIS over the declared adjacency set. The DECLARATION itself
 * (`ADJACENCY`, materialized from `tokens.json`'s `$extensions.dev.navecss.theming.adjacency`
 * block) lives in `./adjacency-source.ts` and is re-exported below; this
 * file stays the coverage/forbidden-pair/orphan-slot analysis. Split from `contrast.ts`
 * (R21/R38/R39-only) and again from its own source-materialization half, on file-budget
 * grounds — no public-surface change for any existing importer.
 */

import { type Adjacency, ADJACENCY } from './adjacency-source.ts'
import { SEMANTIC_SLOTS } from './semantics.ts'

export type { Adjacency, MeasuredOpenSlots, OrphanCheckResult } from './adjacency-source.ts'
export {
  ADJACENCY,
  ADJACENCY_EXCLUSIONS,
  ADJACENCY_OPEN,
  assertNoOrphanedSemanticSlot,
} from './adjacency-source.ts'

/**
 * C5 (Cédric's signed ruling, N1 + C5 + N3): R22's coverage
 * list is the referenced MINIMUM declaration set; the nine names below are its categories.
 * `AC-theming-25`/`AC-theming-53`: a present category going missing is narrowing (gated);
 * adding beyond the minimum is ordinary (ungated).
 */
const MINIMUM_COVERAGE_CATEGORIES = [
  'contentOnSurface',
  'inversePair',
  'onActionOnAction',
  'textOnFeedback',
  'sunken',
  'borderControl',
  'borderFocus',
  'filledAction',
  'filledFeedback',
] as const

export type CoverageCategory = (typeof MINIMUM_COVERAGE_CATEGORIES)[number]

/**
 * Which of the nine minimum categories the given adjacency set covers. Shared by
 * `AC-theming-25` (does today's shipped set cover the floor) and `AC-theming-53` (does a
 * proposed set still cover it, C5's narrowing check).
 */
export function coverageCategories(
  adjacency: readonly Adjacency[] = ADJACENCY,
): Record<CoverageCategory, boolean> {
  return {
    contentOnSurface: adjacency.some(
      (a) => a.subject.startsWith('content.') && a.against.startsWith('surface.'),
    ),
    inversePair: adjacency.some(
      (a) => a.subject === 'content.inverse' && a.against === 'surface.inverse',
    ),
    onActionOnAction: adjacency.some((a) => a.subject === 'on-action.primary'),
    textOnFeedback: adjacency.some((a) => a.subject.startsWith('on-feedback.')),
    sunken: adjacency.some((a) => a.against === 'surface.sunken'),
    borderControl: adjacency.some((a) => a.subject === 'border.control'),
    borderFocus: adjacency.some((a) => a.subject === 'border.focus'),
    filledAction: adjacency.some((a) => a.subject === 'action.primary' && a.class === 'non-text'),
    filledFeedback: adjacency.some(
      (a) => a.subject === 'feedback.danger' && a.class === 'non-text',
    ),
  }
}

/**
 * The reason clause for `assertCoverageFloor`'s thrown message, promoted
 * to a named constant so a future copy edit is a one-place diff a reviewer sees. Cleared
 * bytes (cleared by the project's licensing and accessibility reviewer, applied path);
 * extraction changes no resolved byte, only its location. Any re-wording, including
 * shortening, returns to that reviewer; re-wrapping the same words does not.
 */
const COVERAGE_FLOOR_VIOLATION_REASON =
  'missing from the declared adjacency set. This set has a required minimum: every ' +
  'category in it keeps at least one declared pair, so that dropping coverage is a ' +
  'visible decision rather than a quiet one. Restore the declaration. If you believe ' +
  'the category should no longer be required, that is a decision for the maintainers ' +
  'and not a change to make here: open an issue naming the category and why, and ' +
  'leave the removal out of the pull request until that issue is answered.'

/**
 * `AC-theming-53` (R22, C5): fails naming the category the moment a proposed adjacency set
 * REMOVES one of the nine minimum categories. Never fails on an ADDITION beyond the minimum:
 * C5 binds narrowing alone, and widening is an ordinary spec edit.
 */
export function assertCoverageFloor(adjacency: readonly Adjacency[] = ADJACENCY): void {
  const coverage = coverageCategories(adjacency)
  for (const category of MINIMUM_COVERAGE_CATEGORIES) {
    if (!coverage[category]) {
      throw new Error(
        `Adjacency coverage violation: the required coverage category "${category}" is ${
          COVERAGE_FLOOR_VIOLATION_REASON
        }`,
      )
    }
  }
}

/**
 * The shipped `surface.*` count that `border.control`'s and
 * `border.focus`'s per-surface tests both quantify over (`contrast.test.ts`) — same shape as
 * `contrast.ts`'s `FLOOR_PROVENANCE`: a transcribed count with only a comment
 * citing it has no tripwire back to the declaration, so a sixth shipped surface would
 * under-count silently at both call sites rather than failing anywhere naming why.
 *
 * Asserts the COUNT only, never membership: it compares `surfaces.length` against the frozen
 * `count` below and cannot see whether its members are the right five. What makes those five
 * right is that they are what the shipped build declares (this record's own `citation`),
 * never the signed table, which lives in a repo this build cannot read — that rules out
 * comparing against it, not against strengthening this local pin. A membership check is
 * constructible (the names exist today only as this record's prose) but is not built today.
 *
 * The `citation` field below is cleared copy from the project's licensing and accessibility
 * reviewer, transcribed byte-exact. Any re-wording, including shortening, returns to that
 * reviewer; re-wrapping the same words does not.
 */
const SHIPPED_SURFACE_PROVENANCE = {
  count: 5,
  citation:
    'Two documented contrast requirements quantify over the shipped surfaces: ' +
    'border.control against every surface.* a control sits on, and border.focus ' +
    'against every shipped surface.* and against the action.* fills it can land on. ' +
    'This record pins the surface.* half of both and nothing else: the five surface ' +
    'slots the shipped build declares (surface.base, surface.raised, surface.overlay, ' +
    'surface.sunken, surface.inverse). The border.focus half is unconditioned where ' +
    "border.control's is conditioned, which is deliberate and stricter. The action.* " +
    'half is deliberately never declared, because a focusable slot may not be declared ' +
    'adjacent to an action fill.',
} as const

/**
 * Every `surface.*` semantic slot the shipped build declares.
 */
export function shippedSurfaces(slots: readonly string[] = SEMANTIC_SLOTS): readonly string[] {
  return slots.filter((slot) => slot.startsWith('surface.'))
}

/**
 * R38-shaped guard: fails when the real surface count and this
 * record disagree, naming what changed and what a mismatch calls for. The throw below states
 * what it does not license; that sentence lives there once, not restated here, so there is
 * one home to keep in sync rather than two.
 */
export function assertShippedSurfaceCountProvenance(
  surfaces: readonly string[] = shippedSurfaces(),
): void {
  if (surfaces.length !== SHIPPED_SURFACE_PROVENANCE.count) {
    throw new Error(
      `Shipped surface provenance: ${surfaces.length} shipped surface(s) ` +
        `(${surfaces.join(', ')}) no longer match the frozen count ` +
        `${SHIPPED_SURFACE_PROVENANCE.count}. ${SHIPPED_SURFACE_PROVENANCE.citation} ` +
        'Review whether border.control and border.focus need a matching new pair. This ' +
        'coverage list is the minimum set of pairs this project documents a contrast ' +
        'floor for, so narrowing it changes what is documented and is not yours to ' +
        'change here: open an issue. Bumping the count to make the build pass is not ' +
        'the route.',
    )
  }
}

/**
 * A slot carrying a FILL role: an `action.*` or `feedback.*` name that is not the family's
 * split-out `.foreground` role (R18c). `on-action.*` / `on-feedback.*` are foregrounds by
 * name and never match, since neither starts with `action.`/`feedback.`.
 */
const isFillSlot = (slot: string, family: 'action.' | 'feedback.'): boolean =>
  slot.startsWith(family) && !slot.endsWith('.foreground')

/**
 * R22's first four "must NOT be authored" entries, in the DERIVED form R22 and
 * `AC-theming-51` state them in, not the literal pair list this module carried until now.
 * Entries 1 and 4 name ONE pair each, literal in R22's own text; entries
 * 2 and 3 are rules over a family ("any `content.*`", "any filled `action.*`/`feedback.*`"),
 * avoiding a per-slot enumeration that grows forever. R22's fifth entry is not here: it
 * prohibits CREATING an instance rather than declaring a known pair, and lives in
 * `assertNoFocusableAdjacentToActionFill`. `forbids` is one-directional; the caller tests
 * both orders.
 */
export interface ForbiddenAdjacencyRule {
  entry: number
  description: string
  forbids: (subject: string, against: string) => boolean
}

const FORBIDDEN_ADJACENCY_RULES: readonly ForbiddenAdjacencyRule[] = [
  {
    entry: 1,
    description: '`content.secondary` adjacent to `surface.inverse`',
    forbids: (subject, against) => subject === 'content.secondary' && against === 'surface.inverse',
  },
  {
    entry: 2,
    description: 'any `content.*` adjacent to a feedback FILL',
    forbids: (subject, against) =>
      subject.startsWith('content.') && isFillSlot(against, 'feedback.'),
  },
  {
    entry: 3,
    // Two rules under one number (R22/AC-theming-51): the chromatic fills fail their floor
    // (N1), and `action.secondary` clears and stays undeclared on a design decision (the
    // product lead's, the design lead's) — this predicate is the shared AUTHORING instruction,
    // asserting nothing about either pair's arithmetic (one canonical home per fact).
    description: 'any filled `action.*` or `feedback.*` adjacent to `surface.inverse`',
    forbids: (subject, against) =>
      (isFillSlot(subject, 'action.') || isFillSlot(subject, 'feedback.')) &&
      against === 'surface.inverse',
  },
  {
    entry: 4,
    description: '`content.inverse` adjacent to `action.secondary`',
    forbids: (subject, against) => subject === 'content.inverse' && against === 'action.secondary',
  },
]

/**
 * The rule forbidding this pair, either side, or `undefined` if R22 forbids neither
 * direction. Shared by the guard below and by `AC-theming-51`.
 */
export function findForbiddenAdjacencyRule(
  subject: string,
  against: string,
): ForbiddenAdjacencyRule | undefined {
  return FORBIDDEN_ADJACENCY_RULES.find(
    (rule) => rule.forbids(subject, against) || rule.forbids(against, subject),
  )
}

/**
 * The reason clause below, promoted to a named constant for the same
 * reason as `COVERAGE_FLOOR_VIOLATION_REASON` above. Cleared bytes; extraction only. Any
 * re-wording, including shortening, returns to the project's licensing and accessibility
 * reviewer; re-wrapping the same words does not.
 */
const FORBIDDEN_ADJACENCY_REASON =
  'The rules in this file record decisions about which colour ' +
  'pairs this design system will declare and test; they are not a list to edit to ' +
  'make a build pass. Remove the declaration, or, if you need this pair, open an ' +
  'issue describing it and why, and leave it out of the pull request until that ' +
  'issue is answered.'

/**
 * `AC-theming-51` (R22, entries 1-4): fails naming the entry the moment the declaration
 * set authors a pair one of them forbids. Parameterised so the failing direction is
 * reachable from a constructed set, not only the shipped one. Prints "rule N"; kept "entry" here.
 */
export function assertNoForbiddenAdjacency(adjacency: readonly Adjacency[] = ADJACENCY): void {
  for (const pair of adjacency) {
    const rule = findForbiddenAdjacencyRule(pair.subject, pair.against)
    if (rule) {
      throw new Error(
        `Adjacency rule violation (rule ${rule.entry}): the pair (${pair.subject}, ` +
          `${pair.against}) is declared, and rule ${rule.entry} forbids it: ` +
          `${rule.description}. ${FORBIDDEN_ADJACENCY_REASON}`,
      )
    }
  }
}

/**
 * R22's round-12 FIFTH "must NOT be authored" entry (`AC-theming-51`, applied):
 * no focusable slot declared adjacent to an `action.*` fill.
 * `border.focus` is the only focusable token. Distinct from `FORBIDDEN_ADJACENCY`: entries
 * 1-4 name pairs already failing R21; this entry prohibits a different kind of pair — a
 * focus indicator is drawn offset outside its control, landing on whatever sits behind it,
 * not the control's own fill, so a declaration against an action fill describes a
 * composition, not a colour pairing.
 */
const FOCUSABLE_SLOTS = new Set(['border.focus'])

const isActionFill = (slot: string): boolean => slot.startsWith('action.')

/**
 * The reason clause below, promoted to a named constant for the same
 * review-diff-visibility reason as the two above (cleared by the project's licensing and
 * accessibility reviewer, extraction only). Any re-wording, including shortening, returns
 * to that reviewer; re-wrapping the same words does not.
 */
const FOCUSABLE_ADJACENT_TO_ACTION_FILL_REASON =
  'A focus indicator is drawn offset outside the control ' +
  "it belongs to, so it lands on whatever sits behind that control, not on the control's " +
  'own fill; a declaration putting one against an action fill therefore describes a ' +
  'focusable element sitting ON that fill, which is a composition rather than a colour ' +
  'pairing. This rule records a decision about which colour pairs this design system ' +
  'will declare and test; it is not a check to silence or narrow to make a build pass. ' +
  'Remove the declaration, or, if you need this pair, open an issue describing it and ' +
  'why, and leave it out of the pull request until that issue is answered.'

/**
 * `AC-theming-51` (R22, entry 5): fails naming the pair the moment one is declared.
 */
export function assertNoFocusableAdjacentToActionFill(
  adjacency: readonly Adjacency[] = ADJACENCY,
): void {
  for (const pair of adjacency) {
    const isFocusableSubject = FOCUSABLE_SLOTS.has(pair.subject)
    const isFocusableAgainst = FOCUSABLE_SLOTS.has(pair.against)
    if (
      (isFocusableSubject && isActionFill(pair.against)) ||
      (isFocusableAgainst && isActionFill(pair.subject))
    ) {
      const focusable = isFocusableSubject ? pair.subject : pair.against
      const fill = isFocusableSubject ? pair.against : pair.subject // "the declaration" below is tokens.json
      throw new Error(
        `Adjacency rule violation: the focusable slot "${focusable}" is declared adjacent ` +
          `to the action fill "${fill}". ${FOCUSABLE_ADJACENT_TO_ACTION_FILL_REASON}`,
      )
    }
  }
}
