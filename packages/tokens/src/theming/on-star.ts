/**
 * R18e: the `on-*` anchor derivation and its shape guard. Split out of
 * `semantics.ts` (which stays R23's mapping columns) on file-budget grounds, along the
 * boundary that module's doc already draws — the mapping is the VALUE layer, this is the
 * anchor/shape layer over it. The dependency runs one way, `on-star.ts` -> `semantics.ts`,
 * so nothing here is reachable from the mapping columns and no cycle exists.
 */

import { type Adjacency, ADJACENCY } from './adjacency-source.ts'
import { ACHROMATIC_MAPPING, CHROMATIC_MAPPING, type SlotMapping } from './semantics.ts'

const STATE_OR_FOREGROUND_SUFFIX_RE = /\.(hover|active|foreground)$/

/**
 * The one anchor name an `on-*` subject may take: its OWN FAMILY's solid-background role,
 * which is the subject with its leading `on-` stripped (`on-feedback.danger` ->
 * `feedback.danger`, `on-action.primary` -> `action.primary`). This is R18e condition 1's
 * own wording ("the solid-background role of the matching `feedback.*`"), not a wider rule
 * invented here.
 */
function familyAnchorFor(subject: string): string {
  return subject.slice('on-'.length)
}

/**
 * R18e: each `on-*` slot's ONE anchor — the background slot it is the
 * declared foreground OF, always the RESTING state (never a `.hover`/`.active` fill, never a
 * `.foreground` role) and always the SOLID-BACKGROUND role of its own family.
 *
 * Derived from `ADJACENCY` rather than hand-authored a second
 * time — an `on-*` subject's family-matching resting partner already carries this exact fact
 * in R22's own declaration (e.g. `on-action.primary` is declared adjacent to
 * `action.primary`, `.hover` and `.active`; only the suffix-free family match is the
 * anchor). `AC-theming-54` forbids a second, independently maintained mechanism by name —
 * this is that fold. A `Record` maps at most one value per key by construction, which is
 * what "exactly one anchor" means at the type level.
 *
 * **This function is TOTAL: it selects, and never throws.** It runs at module load, so a
 * throw here is a module-resolution wall rather than a build failure, and it would take
 * `assertOnStarShape` — the `AC-theming-54`-tagged guard for exactly this condition — down
 * with it, since that guard lives in a module that could then never load. Detection belongs
 * to the guard; see `assertOnStarAnchorsResolve` below. The family constraint is also what
 * keeps a LAWFUL R22 widening ungated (C5/`AC-theming-53`: adding beyond the minimum is an
 * ordinary spec edit): declaring `on-feedback.warning` adjacent to `feedback.success`, a
 * real checkable pair, adds a partner and leaves the anchor exactly where it was.
 */
export function deriveOnStarAnchors(adjacency: readonly Adjacency[]): Record<string, string> {
  const anchors: Record<string, string> = {}
  for (const { subject, against } of adjacency) {
    if (!subject.startsWith('on-')) continue
    if (STATE_OR_FOREGROUND_SUFFIX_RE.test(against)) continue
    if (against !== familyAnchorFor(subject)) continue
    anchors[subject] = against
  }
  return anchors
}

export const ON_STAR_ANCHORS: Record<string, string> = deriveOnStarAnchors(ADJACENCY)

/**
 * The mapping columns, anchor record and declaration `assertOnStarShape` reads. Bundled so
 * the guard can be pointed at a CONSTRUCTED source (`AC-theming-54`'s missing-anchor case)
 * without the callers that check the shipped source naming four arguments.
 */
export interface OnStarSource {
  mapping: Record<string, SlotMapping>
  branchMapping: Record<string, SlotMapping>
  anchors: Record<string, string>
  /**
  The declaration the anchors were derived FROM. Optional: a constructed source exercising
  the mapping/anchor half alone has no declaration to check, and the declaration-level check
  below then has nothing to range over. The shipped source always carries it.
   */
  adjacency?: readonly Adjacency[]
}

const SHIPPED_ON_STAR_SOURCE = (): OnStarSource => ({
  mapping: CHROMATIC_MAPPING,
  branchMapping: ACHROMATIC_MAPPING,
  anchors: ON_STAR_ANCHORS,
  adjacency: ADJACENCY,
})

/**
 * Every distinct RESTING partner the declaration gives each `on-*` subject: the candidate
 * anchors, before the family rule picks among them.
 */
function restingPartnersBySubject(adjacency: readonly Adjacency[]): Map<string, string[]> {
  const resting = new Map<string, string[]>()
  for (const { subject, against } of adjacency) {
    if (!subject.startsWith('on-')) continue
    if (STATE_OR_FOREGROUND_SUFFIX_RE.test(against)) continue
    const candidates = resting.get(subject) ?? []
    if (!candidates.includes(against)) candidates.push(against)
    resting.set(subject, candidates)
  }
  return resting
}

/**
 * R18e condition 1 checked at the DECLARATION level (`AC-theming-54`), which is where the
 * derivation above deliberately does not fail: an `on-*` subject that declares resting
 * partners but none of them its own family's solid background has no anchor the derivation
 * can select, and that is a named build failure rather than a module-load crash. The message
 * names the subject, every candidate it considered, and the one name it required.
 */
function assertOnStarAnchorsResolve(
  adjacency: readonly Adjacency[],
  anchors: Record<string, string>,
): void {
  for (const [subject, candidates] of restingPartnersBySubject(adjacency)) {
    if (Object.hasOwn(anchors, subject)) continue
    const listed = candidates.map((name) => `"${name}"`).join(' and ')
    throw new Error(
      `on-* anchor check: "${subject}" declares the resting partner(s) ${listed}, none of ` +
        `which is "${familyAnchorFor(subject)}" — its own family's solid-background role, the ` +
        'only anchor an on-* foreground can take. Declare that pair, or rename the ' +
        'subject to the family it is the foreground of.',
    )
  }
}

/**
 * One `on-*` slot's checks: exactly one anchor, resting solid-background, emitted name,
 * value never composed or aliased. Throws naming the slot and the condition violated.
 */
function assertOnStarSlot(slot: string, source: OnStarSource): void {
  const anchor = source.anchors[slot]
  if (anchor === undefined) {
    throw new Error(`on-* anchor check: ${slot} names no anchor in ON_STAR_ANCHORS.`)
  }
  if (STATE_OR_FOREGROUND_SUFFIX_RE.test(anchor)) {
    throw new Error(
      `on-* anchor check: ${slot}'s anchor "${anchor}" is a state or a foreground role, ` +
        'not the resting solid-background it must be.',
    )
  }
  if (!Object.hasOwn(source.mapping, anchor)) {
    throw new Error(
      `on-* anchor check: ${slot}'s anchor "${anchor}" is not a name the build emits.`,
    )
  }
  for (const mapping of [source.mapping[slot], source.branchMapping[slot]]) {
    if (mapping && ('alias' in mapping.light || 'alias' in mapping.dark)) {
      throw new Error(
        `on-* anchor check: ${slot}'s value is composed or aliased, not a whole declaration.`,
      )
    }
  }
}

/**
 * No slot other than an `on-*` slot's own declaration aliases an `on-*` slot (the
 * aliasing `content.link` does, e.g., is lawful precisely because `content.link` is not
 * itself a declared `on-*` foreground).
 */
function assertNoAliasingOfOnStarSlots(mapping: Record<string, SlotMapping>): void {
  for (const [name, slotMapping] of Object.entries(mapping)) {
    for (const branch of ['light', 'dark'] as const) {
      const ref = slotMapping[branch]
      if ('alias' in ref && ref.alias.startsWith('on-')) {
        throw new Error(`on-* anchor check: ${name} aliases the on-* slot "${ref.alias}".`)
      }
    }
  }
}

/**
 * R18e's four normative conditions (`AC-theming-54`), checked against `CHROMATIC_MAPPING`
 * / `ACHROMATIC_MAPPING`, `ON_STAR_ANCHORS` and `ADJACENCY` by default and against a
 * constructed source when one is passed. R18e's fifth condition (nothing depends on the
 * `light-dark()` PAIR shape, `AC-theming-55`) is a property of surfaces this function does
 * not read (`core`, the documented ladder, the generated artifacts) and is checked
 * elsewhere.
 *
 * The declaration-level check runs FIRST: where an anchor failed to derive, the reason lives
 * in the declaration and naming the candidates is more useful than reporting a slot with no
 * entry.
 */
export function assertOnStarShape(source: OnStarSource = SHIPPED_ON_STAR_SOURCE()): void {
  if (source.adjacency) assertOnStarAnchorsResolve(source.adjacency, source.anchors)
  const onStarSlots = Object.keys(source.mapping).filter((name) => name.startsWith('on-'))
  for (const slot of onStarSlots) assertOnStarSlot(slot, source)
  assertNoAliasingOfOnStarSlots(source.mapping)
}
