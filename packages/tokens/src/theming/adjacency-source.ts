/**
 * R22: the DECLARED adjacency source. R22's own text — "each token
 * declares its legal partners in the DTCG source (a `$extensions` adjacency entry)" — is
 * materialized here from `tokens.json`'s `$extensions.dev.navecss.theming.adjacency`
 * block, so the DTCG source is the contract rather than a second, parallel TypeScript
 * array the source cannot see. Split out of `adjacency.ts` (which stays the R22
 * must/must-not ANALYSIS over this data) purely on file-budget grounds; the split follows
 * the same boundary the module doc already draws (source vs analysis). The BYTES half —
 * reading the shipped file and the one check that must run before `JSON.parse` collapses it
 * — is `./tokens-source.ts`, split for the same reason.
 */

import { loadShippedTokensSource } from './tokens-source.ts'

type PairClass = 'text' | 'non-text'

export interface Adjacency {
  // The slot whose text/fill/border colour is being checked.
  subject: string
  // What it is checked against.
  against: string
  class: PairClass
}

/**
 * A non-array object, as opposed to a primitive or array `unknown` value has no other
 * shape for.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether `value` is one of the two class tokens `Adjacency.class` accepts.
 */
function isPairClass(value: unknown): value is PairClass {
  return value === 'text' || value === 'non-text'
}

/**
 * One subject's partner ARRAY, validated and flattened to `Adjacency` entries. Split out
 * of `materializeAdjacency` so the outer function's own branching stays within budget.
 */
function flattenSubjectPartners(subject: string, partners: unknown): Adjacency[] {
  if (!Array.isArray(partners)) {
    throw new TypeError(
      `Adjacency declaration: adjacency["${subject}"] in @navecss/tokens' own bundled tokens.json is not an array of partners.`,
    )
  }
  return partners.map((partner: unknown) => {
    if (!isRecord(partner) || typeof partner.against !== 'string' || !isPairClass(partner.class)) {
      throw new TypeError(
        `Adjacency declaration: adjacency["${subject}"] in @navecss/tokens' own bundled tokens.json carries a malformed partner entry.`,
      )
    }
    return { subject, against: partner.against, class: partner.class }
  })
}

/**
 * Flattens `tokens.json`'s per-subject `$extensions.dev.navecss.theming.adjacency` block
 * (one key per subject, plus a `comment` string, skipped) into the flat `Adjacency[]`
 * shape every existing reader already expects (`contrast.ts`, the guards in `adjacency.ts`,
 * every test). A pure function of the parsed source — never touches the filesystem — so
 * `AC-theming-26`'s constructed cases (a new token with no declaration, a deleted one) can
 * drive it directly without a real `tokens.json` on disk. Validates its input at every
 * level (no `as` cast over `unknown`) rather than trusting the JSON shape.
 */
export function materializeAdjacency(source: unknown): Adjacency[] {
  if (!isRecord(source)) {
    throw new TypeError(
      "Adjacency declaration: @navecss/tokens' own bundled tokens.json did not parse to an object.",
    )
  }
  const extensions = source.$extensions
  const theming = isRecord(extensions) ? extensions['dev.navecss.theming'] : undefined
  const declared = isRecord(theming) ? theming.adjacency : undefined
  if (!isRecord(declared)) {
    throw new Error(
      "Adjacency declaration: @navecss/tokens' own bundled tokens.json carries no $extensions.dev.navecss.theming.adjacency block.",
    )
  }

  const result: Adjacency[] = []
  for (const [subject, partners] of Object.entries(declared)) {
    if (subject === 'comment') continue
    result.push(...flattenSubjectPartners(subject, partners))
  }
  return result
}

/**
 * R22's minimum declaration set (the coverage list Cédric's ruling names as the
 * signed table's referenced minimum, C5) — a representative, non-exhaustive instance of
 * every required category rather than the full slot cross-product, per N1. Materialized
 * from `tokens.json` at module load, not hand-typed.
 */
export const ADJACENCY: readonly Adjacency[] = materializeAdjacency(loadShippedTokensSource())

/**
 * R22 exclusions, listed WITH reasons ("an unexplained absence reads as an oversight and a
 * listed exclusion is a position", R22's own text) — the semantic slots
 * `assertNoOrphanedSemanticSlot` below would otherwise flag as undeclared. Every entry here
 * is a SETTLED position citing the clause it rests on. `content.disabled` and
 * `border.disabled` are the two exclusions the project's accessibility record declares for
 * itself (that record is reviewed and signed off by the project's accessibility steward) —
 * the home is that record, not R22, which only names exclusion CLASSES. **The two rest on different
 * exceptions and neither is unconditional**: both are worded over a component that is INACTIVE, and
 * an accessibility review established that `pointer-events: none` blocks pointer activation and
 * nothing else, so an `aria-disabled` element that still fires on Enter is not inactive and the
 * exclusion's reason does not reach it — stated in each entry's own reason string, not only here,
 * since the guard reads the string and a reader of the code should not have to find this comment to
 * learn the condition. `border.default` cites R22's named "decorative dividers" class.
 * **`border.strong` does NOT belong here and was removed: row 13 of the project's accessibility
 * contrast-threshold table (reviewed and signed off) records that token's classification as UNMADE
 * ("once classified: 3:1 if it may identify a control, excluded if decorative"), so calling it an
 * exclusion asserted a position nobody took.** See `ADJACENCY_OPEN` below for it and for the three
 * feedback-foreground slots, previously listed here under the same false "excluded" framing.
 */
export const ADJACENCY_EXCLUSIONS: Readonly<Record<string, string>> = {
  'content.disabled':
    'disabled text: excluded from the checked pair set, and the exclusion is worded ' +
    'over a component that is INACTIVE. It does not reach an aria-disabled element ' +
    'that is still operable and still fires on activation; that case is not excluded ' +
    'and is not answered here.',
  'border.disabled':
    'disabled control: excluded from the checked pair set, and the exclusion is worded ' +
    'over a component that is INACTIVE. It does not reach an aria-disabled element ' +
    'that is still operable and still fires on activation; that case is not excluded ' +
    'and is not answered here.',
  'border.default':
    'decorative divider: excluded as a decorative divider or card edge, and the ' +
    'exclusion is void the moment such a border is applied to a control.',
}

/**
 * A THIRD state `assertNoOrphanedSemanticSlot` recognizes, distinct from both "declared"
 * and "excluded" (the root-cause diagnosis behind this design: a guard offering only two
 * states forces every genuinely OPEN slot into one of them, and an honest author writes the
 * truth into a reason string nothing reads). A slot listed here is neither declared nor
 * excluded — its classification or its coverage question is unresolved and un-owned by this
 * module — and the guard below counts it rather than silently passing it as a settled
 * position or failing the build on a question that is not this module's to answer.
 *
 * `border.strong`: row 13 of the project's accessibility contrast-threshold table (part of
 * the reviewed and signed-off accessibility record) records the classification
 * itself as unmade — the accessibility steward's and Cédric's to make, not decided here or
 * by this list.
 * `feedback.warning/success/info.foreground`: whether these families gain a standalone
 * foreground role paralleling `feedback.danger.foreground`'s R18c split is unresolved
 * (the project's token record lists it as open under that section, routed to the design lead).
 */
export const ADJACENCY_OPEN: Readonly<Record<string, string>> = {
  'border.strong':
    'open: whether this border can identify a control, and therefore whether its ' +
    'contrast is checked or it is decorative, is an open question this project has ' +
    'not settled and is not decided here',
  'feedback.warning.foreground':
    'open, not yet excluded or covered: whether this family gains a standalone ' +
    'foreground role of its own is unresolved and is not decided here',
  'feedback.success.foreground': 'open — see feedback.warning.foreground',
  'feedback.info.foreground': 'open — see feedback.warning.foreground',
}

declare const measuredOpenSlotsBrand: unique symbol

/**
 * The array only `assertNoOrphanedSemanticSlot` can produce, so holding a value of this
 * type already means "the guard ran" AT THE TYPE LEVEL — the
 * invariant `build-record.ts`'s `openAdjacencySlots` docblock states in prose ("presence
 * means the guard genuinely ran") used to be held only by its two call sites happening to be
 * correct, not by anything stopping a future caller from passing a bare `[]` literal, which
 * satisfies `readonly string[]` exactly as well as a real measurement. A plain array literal
 * is not assignable to this branded type, so claiming "measured" now costs an explicit cast.
 */
export type MeasuredOpenSlots = readonly string[] & { readonly [measuredOpenSlotsBrand]: true }

/**
 * The result of `assertNoOrphanedSemanticSlot`: which of the checked slots resolved through
 * the OPEN channel, and which resolved through the EXCLUSIONS channel, rather than being
 * declared. `ADJACENCY_OPEN`'s own "visible count" — a caller reports this rather than the
 * open state disappearing into a silent pass.
 *
 * `excluded`: the same "visible count" property `open` already has, given to the exclusions
 * channel too, on the accessibility steward's own direction. Both escapes vanish into
 * `continue` in the loop below without it, and the function's own docblock names that as the
 * standard for `open`; the exclusions channel has no reason to be held to a lower one. A key
 * added to `ADJACENCY_EXCLUSIONS` changes this list, so a caller that reports it turns a
 * silent drop of R22 coverage into a visible one — it does NOT compare the record against
 * the reviewed and signed-off accessibility record, which is a
 * separate, brain-side check.
 */
export interface OrphanCheckResult {
  open: MeasuredOpenSlots
  excluded: readonly string[]
}

/**
 * The two escape records and the declaration itself must stay DISJOINT, and nothing else
 * asserts it. The orphan loop below checks `mentioned` first and `continue`s, so a slot that
 * is both declared and listed reaches neither branch and passes silently: a settled
 * exclusion contradicted by a live declaration would read as honoured while the pair it
 * excludes is being checked, and an open question a declaration already answered would keep
 * reporting itself open. Asserted as a PROPERTY of the records rather than as a census of
 * today's members, so it stays true as either record changes.
 */
function assertEscapesAreDisjointFromDeclaration(
  mentioned: ReadonlySet<string>,
  exclusions: Readonly<Record<string, string>>,
  open: Readonly<Record<string, string>>,
): void {
  for (const [record, name] of [
    [exclusions, 'ADJACENCY_EXCLUSIONS'],
    [open, 'ADJACENCY_OPEN'],
  ] as const) {
    const both = Object.keys(record).filter((slot) => mentioned.has(slot))
    if (both.length > 0) {
      const listed = both.map((slot) => `"${slot}"`).join(', ')
      throw new Error(
        `Adjacency escape-record conflict: ${listed} is declared in the adjacency set AND ` +
          `listed in ${name}. A slot is one or the other: remove the declaration, or remove ` +
          'the listing that the declaration has already answered.',
      )
    }
  }
}

/**
 * `AC-theming-26` (R22): "a new semantic token with no adjacency declaration fails the
 * build, naming that token." A slot is COVERED the moment it appears anywhere in the
 * adjacency graph — as a subject (it declares partners) or as a partner (something else
 * checks its contrast against it) — because either way R21's harness computes at least one
 * pair touching it. A slot appearing NOWHERE has no contrast check touching it at all,
 * which is exactly the gap R22 exists to close. Two legitimate escapes, kept structurally
 * apart rather than merged into one silent pass: a listed
 * `ADJACENCY_EXCLUSIONS` entry is a SETTLED position and must carry a citable reason; a
 * listed `ADJACENCY_OPEN` entry is an UNRESOLVED question and is counted, never asserted as
 * a position. Catches both directions named in the criterion: a NEW token nobody declared,
 * and an EXISTING one whose only declaration was deleted — both leave the slot unmentioned,
 * and this function cannot tell them apart (nor does it need to; the fix is the same
 * either way).
 */
export function assertNoOrphanedSemanticSlot(
  slots: readonly string[],
  adjacency: readonly Adjacency[] = ADJACENCY,
  exclusions: Readonly<Record<string, string>> = ADJACENCY_EXCLUSIONS,
  open: Readonly<Record<string, string>> = ADJACENCY_OPEN,
): OrphanCheckResult {
  const mentioned = new Set<string>()
  for (const pair of adjacency) {
    mentioned.add(pair.subject)
    mentioned.add(pair.against)
  }
  assertEscapesAreDisjointFromDeclaration(mentioned, exclusions, open)
  const openSlots: string[] = []
  const excludedSlots: string[] = []
  for (const slot of slots) {
    if (mentioned.has(slot)) continue
    if (Object.hasOwn(exclusions, slot)) {
      excludedSlots.push(slot)
      continue
    }
    if (Object.hasOwn(open, slot)) {
      openSlots.push(slot)
      continue
    }
    // Cleared by the project's accessibility steward after review. The prior text
    // named ADJACENCY_EXCLUSIONS as an escape "with a citable reason" in the same breath as
    // declaring and marking open, which reads as three equally-weighted options — and adding
    // an exclusion is the one that silently drops a slot from R22's coverage. This wording
    // describes both escape records without inviting a reader to take either.
    throw new Error(
      `Adjacency coverage: the semantic slot "${slot}" carries no adjacency declaration, so ` +
        'no contrast pair in this build touches it at all. Declare its legal partners in ' +
        'tokens.json, under $extensions.dev.navecss.theming.adjacency. The two escape records ' +
        'are not alternatives you may take here: a slot is excluded only where the project has ' +
        'already settled that its contrast is not checked, and it is marked open only where ' +
        'that question is genuinely unresolved and is being counted as open. If you believe ' +
        'this slot belongs in one of those, open an issue rather than adding it to either ' +
        'record.',
    )
  }
  // The one place allowed to mint the brand: this array was just built by the measurement
  // above, so the cast is asserting a fact this function itself just made true.
  return { open: openSlots as readonly string[] as MeasuredOpenSlots, excluded: excludedSlots }
}
