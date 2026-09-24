import { describe, expect, it } from 'vitest'

import {
  type Adjacency,
  ADJACENCY,
  ADJACENCY_EXCLUSIONS,
  ADJACENCY_OPEN,
  assertCoverageFloor,
  assertNoFocusableAdjacentToActionFill,
  assertNoForbiddenAdjacency,
  assertNoOrphanedSemanticSlot,
  assertShippedSurfaceCountProvenance,
  coverageCategories,
  findForbiddenAdjacencyRule,
  shippedSurfaces,
} from '../../src/theming/adjacency.ts'
import {
  assertContrastFloors,
  assertFloorProvenance,
  checkSameStepLint,
  type ContrastResult,
  NON_TEXT_FLOOR,
  runContrastHarness,
  TEXT_FLOOR,
} from '../../src/theming/contrast.ts'
import { type PipelineResult, type ResolvedSlot, runPipeline } from '../../src/theming/pipeline.ts'
import { SEMANTIC_SLOTS } from '../../src/theming/semantics.ts'

const TEAL = { l: 0.7859, c: 0.1316, h: 186.17 }
const DANGER = { l: 0.6357, c: 0.2072, h: 15.02 }

const byName = (a: string, b: string): number => a.localeCompare(b)

// "Declared" means what R22 means by it: authored into the adjacency declaration set, on
// either side. R22's "must NOT be authored" entries are the opposite of a declaration and
// are not consulted here — reading them as declarations is what made this helper answer a
// different question from the one AC-theming-51 asks.
function isDeclaredEitherSide(subject: string, against: string): boolean {
  return ADJACENCY.some(
    (p) =>
      (p.subject === subject && p.against === against) ||
      (p.subject === against && p.against === subject),
  )
}

function seeds(primary = TEAL): {
  danger: typeof DANGER
  declaredTintHue: number
  primary: typeof TEAL
} {
  return { primary, danger: DANGER, declaredTintHue: 186.17 }
}

// Round 11: a CONSTRUCTED violation for AC-theming-49, exactly as AC-theming-05 and
// AC-theming-28 construct theirs — the shipped defaults hold no real
// one to exercise ("satisfied by construction"), so the failure mode itself needs a
// synthetic pin. content.primary/surface.base is a real declared TEXT pair (ADJACENCY row
// 1); only its slot is pinned here. (The companions below are also present, per the note
// on them — this function does not return a `result.slots`-only object.)
function pinnedResult(slot: string): PipelineResult {
  const pinned: ResolvedSlot = {
    slot,
    branch: 'light',
    resolved: { scale: 'neutral', step: 900 },
    literal: { l: 0.18, c: 0, h: 0 },
    css: 'oklch(0.18 0 0)',
  }
  // The companions are unpinned filler: the lint reads the same slot surface R21's harness
  // does (result.slots plus action.secondary's foreground and companion border), so a
  // fixture missing the KEYS entirely would not be the object SHAPE the lint receives from
  // a real run. Their step NUMBERS are arbitrary synthetic filler, chosen only to keep
  // light != dark so this companion stays unpinned for the scenario below — they are not
  // transcribed from, and are not claimed to track, the live `CHROMATIC_MAPPING` /
  // `ACTION_SECONDARY_BORDER` value (`semantics.ts`), which has since moved to 500 in
  // BOTH schemes. The light number here coincides with it; the dark one does not, and
  // neither coincidence is load-bearing.
  const companion = (name: string, step: number): ResolvedSlot => ({
    ...pinned,
    slot: name,
    resolved: { scale: 'neutral', step },
  })
  return {
    slots: [pinned, { ...pinned, branch: 'dark' }],
    actionSecondaryForeground: {
      light: companion('action.secondary.foreground', 900),
      dark: { ...companion('action.secondary.foreground', 100), branch: 'dark' },
    },
    actionSecondaryBorder: {
      light: companion('action.secondary.border', 500),
      dark: { ...companion('action.secondary.border', 400), branch: 'dark' },
    },
  } as unknown as PipelineResult
}

describe('AC-theming-23 covers: R21', () => {
  it('the harness computes a number for every declared pair, per shipped scheme, reporting names and numbers only', () => {
    const results = runContrastHarness(runPipeline(seeds()))
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(typeof r.ratio).toBe('number')
      expect(r.ratio).toBeGreaterThan(0)
      expect(['light', 'dark']).toContain(r.scheme)
    }
    // runs once per shipped scheme
    const schemes = new Set(results.map((r) => r.scheme))
    expect(schemes).toEqual(new Set(['dark', 'light']))
  })

  it('fails closed with a named error when the pair-declaration source is absent, and never no-ops into a green run', () => {
    // AC-theming-23's own instruction: the fail-closed half is a CONSTRUCTED case, exercised
    // by REMOVING the source rather than by running the pipeline as it ships. The previous
    // version of this test asserted that a closure written inside the test did not throw,
    // which is true of the closure and says nothing about the harness.
    const result = runPipeline(seeds())
    expect(() => runContrastHarness(result, [])).toThrow(
      /Contrast check: the pair-declaration source is empty/,
    )

    // Never skips, no-ops or reports a green run: the failing call returns nothing at all,
    // so no caller can mistake an absent source for an empty (green) result set.
    const outcome = ((): string => {
      try {
        return `returned ${runContrastHarness(result, []).length} result(s)`
      } catch {
        return 'threw'
      }
    })()
    expect(outcome).toBe('threw')

    // The shipped module is not in that state, which is why the case has to be constructed.
    expect(ADJACENCY.length).toBeGreaterThan(0)
  })

  it('round 11: the harness expands BOTH value columns, each pair computed twice per scheme, the pair SET invariant between them', () => {
    // R23's two value columns: the chromatic column (the shipped default seed) and the
    // achromatic-branch column (R3(a), an exactly-zero-chroma primary seed). Each is its
    // own PipelineResult (the branch fires per build, not per pair), so "expands both
    // columns" is exercised here by running the harness against both and comparing.
    const chromatic = runContrastHarness(runPipeline(seeds()))
    const achromatic = runContrastHarness(runPipeline(seeds({ l: 0.6, c: 0, h: 0 })))

    const pairKey = (r: (typeof chromatic)[number]): string =>
      `${r.pair.subject}/${r.pair.against}/${r.scheme}`
    const chromaticKeys = new Set(chromatic.map((r) => pairKey(r)))
    const achromaticKeys = new Set(achromatic.map((r) => pairKey(r)))

    // Same pair set, element for element — R22's declarations are authored on token
    // NAMES over a slot set write-back 6's bounding constraint makes seed-invariant, so
    // a run in which the two expansions cover different pairs fails this scenario.
    expect(achromaticKeys).toEqual(chromaticKeys)
    expect(chromatic.length).toBe(achromatic.length)

    // Both expansions reconstruct the tinted neutral pairs in Node (no headless browser):
    // every result carries a plain number, in both columns.
    for (const r of [...chromatic, ...achromatic]) {
      expect(typeof r.ratio).toBe('number')
      expect(Number.isFinite(r.ratio)).toBe(true)
    }

    // At least one pair's computed number genuinely differs between the two columns
    // (border.focus moved from a primary-derived value to a neutral-derived one under
    // the branch) — proof the achromatic expansion is a real second computation, not
    // the chromatic result relabelled.
    const byKey = new Map(chromatic.map((r) => [pairKey(r), r.ratio]))
    const isAnyDiffers = achromatic.some((r) => byKey.get(pairKey(r)) !== r.ratio)
    expect(isAnyDiffers).toBe(true)
  })

  it("round 11: the harness's input set contains no consumer-supplied scale — both expansions are Nave's own shipped defaults", () => {
    // Boundary assertion per the scenario's own text: widening WHAT is expanded must not
    // move WHOSE values are judged. Both calls above pass a Seeds object shaped exactly
    // like the shipped default seeds (primary + danger + declaredTintHue); there is no
    // parameter on runContrastHarness or runPipeline that accepts an external/consumer
    // scale, so an implementation of the CLI piping consumer values into this harness would
    // have to bypass this function's own signature to do it.
    const result = runPipeline(seeds())
    expect(Object.keys(result)).not.toContain('consumerScale')
  })
})

describe('AC-theming-24 covers: R38', () => {
  // Round 12: this criterion became EXECUTABLE when R38's stale blocked-on-adjacency-work note
  // was discharged. The pre-round-13 version of this block only inspected
  // `runContrastHarness`'s own `pass` field — which is vacuous against the
  // shipped defaults, since nothing in the recorded table fails today, so `failing` was
  // always empty and the `for` loop's assertions never actually ran (a known false-green
  // failure shape). R38's own gate — a pipeline run FAILING when a
  // recorded number moves — did not exist as code before this round; `assertContrastFloors`
  // below is that gate, and it is what `AC-theming-24` obliges, per the implementing engineer's
  // own reading.

  it('Given a green pipeline run recorded against the threshold table, the run does not fail', () => {
    const results = runContrastHarness(runPipeline(seeds()))
    expect(() => assertContrastFloors(results)).not.toThrow()
  })

  it('When a pair moves below its recorded threshold, Then the run fails naming the pair, the scheme, the computed number and the recorded threshold', () => {
    const results = runContrastHarness(runPipeline(seeds()))
    const target = results.find(
      (r) =>
        r.pair.subject === 'content.primary' &&
        r.pair.against === 'surface.base' &&
        r.scheme === 'light',
    )!
    const movedRatio = target.floor - 0.5
    const moved: ContrastResult[] = results.map((r) =>
      r === target ? { ...r, ratio: movedRatio, pass: false } : r,
    )
    let thrown: Error | undefined
    try {
      assertContrastFloors(moved)
    } catch (error) {
      thrown = error as Error
    }
    expect(thrown, 'assertContrastFloors did not throw on a below-threshold pair').toBeDefined()
    const message = thrown!.message
    expect(message).toContain('content.primary')
    expect(message).toContain('surface.base')
    expect(message).toContain('light')
    expect(message).toContain(movedRatio.toString())
    expect(message).toContain(target.floor.toString())
  })

  it('the failure reports BOTH the recorded floor and the applied threshold, T7 putting a 1% margin between them', () => {
    // A pair can clear the recorded floor and still fail, because T7 fails a pair clearing
    // its floor by under 1%. A message naming the floor alone therefore says "computed 4.52
    // below threshold 4.5", which is false on its face and sends the next reader looking
    // for an arithmetic bug instead of at the margin.
    const results = runContrastHarness(runPipeline(seeds()))
    const target = results.find((r) => r.pair.class === 'text')!
    expect(target.threshold).toBeGreaterThan(target.floor)

    const betweenFloorAndMargin = (target.floor + target.threshold) / 2
    const moved: ContrastResult[] = results.map((r) =>
      r === target ? { ...r, ratio: betweenFloorAndMargin, pass: false } : r,
    )
    let message = ''
    try {
      assertContrastFloors(moved)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain(betweenFloorAndMargin.toString())
    expect(message).toContain(`recorded floor ${target.floor}`)
    expect(message).toContain(`applied threshold ${target.threshold}`)
  })

  it('fails for the tinted neutral pairs as well as the literal ones (border.control, reconstructed under R10)', () => {
    const results = runContrastHarness(runPipeline(seeds()))
    const target = results.find(
      (r) =>
        r.pair.subject === 'border.control' &&
        r.pair.against === 'surface.base' &&
        r.scheme === 'light',
    )!
    const moved: ContrastResult[] = results.map((r) =>
      r === target ? { ...r, ratio: target.floor - 0.3, pass: false } : r,
    )
    expect(() => assertContrastFloors(moved)).toThrow(/border\.control/)
  })

  it('a pair the table marks exempt does not fail, because an exempt pair is never in the declared (and therefore never in the computed) set', () => {
    // Part 3's exclusions (e.g. surface-vs-surface elevation) are never entered into
    // ADJACENCY at all, so the harness never computes them and assertContrastFloors never
    // sees them to fail — this is the property the criterion's exempt clause depends on,
    // asserted rather than left implicit.
    expect(
      ADJACENCY.some((p) => p.subject.startsWith('surface.') && p.against.startsWith('surface.')),
    ).toBe(false)
    const results = runContrastHarness(runPipeline(seeds()))
    expect(
      results.some(
        (r) => r.pair.subject.startsWith('surface.') && r.pair.against.startsWith('surface.'),
      ),
    ).toBe(false)
  })

  it('text pairs are held to 4.5:1 and non-text pairs to 3:1 (T1/T2), which is the recorded threshold a failure message carries', () => {
    const results = runContrastHarness(runPipeline(seeds()))
    for (const r of results) {
      expect(r.floor).toBe(r.pair.class === 'text' ? TEXT_FLOOR : NON_TEXT_FLOOR)
    }
  })
})

describe('AC-theming-25 covers: R22', () => {
  it('the pair set covers every required category: content/surface, on-action/action, feedback text, sunken, border.control, border.focus, filled action, filled feedback, icon/indicator', () => {
    const categories = coverageCategories()
    for (const [name, present] of Object.entries(categories)) {
      expect(present, `missing category: ${name}`).toBe(true)
    }
  })

  it('round 9 (a prior gap discharged): action.secondary participates in the derived pair set, no member held out any longer', () => {
    // action.secondary's own foreground-on-fill legibility pair (row 6) is what R22 and R23
    // now carry for this slot; verified here rather than assumed, since it is the concrete
    // fact behind AC-theming-25's round-9 "no member held out any longer" note. This is
    // distinct from, and does not imply, action.secondary appearing as a SUBJECT in the
    // "filled action against the surface behind it" (row 10) category: that prior ruling (N3)
    // and its own write-back bind identification to border.control, not to the fill clearing
    // a floor against its surface, and no round-9 artifact adds such a pair (see this AC's
    // own audit note for the full citation trail).
    expect(
      ADJACENCY.some((a) => a.subject === 'action.secondary' || a.against === 'action.secondary'),
    ).toBe(true)
  })

  it('border.focus is declared, individually, against EACH of the five shipped surface tokens (enumerated, not a hand-written pair list) — the row-9/C3 minimum a prior fix closes', () => {
    // An AC-id living in a describe string is a statement about
    // that string until somebody reads the bodies. Enumerating the real shipped surface
    // set (rather than asserting a hand-picked pair or two) is what actually catches a
    // declaration gap against three of the five surfaces surviving under this AC's name.
    // The count and its citation are the ONE frozen provenance record
    // in adjacency.ts (SHIPPED_SURFACE_PROVENANCE), not a comment repeated at every call
    // site — assertShippedSurfaceCountProvenance is that record's own build-time guard,
    // exercised below rather than re-derived from a literal `.toBe(5)`.
    const surfaces = shippedSurfaces()
    expect(() => assertShippedSurfaceCountProvenance(surfaces)).not.toThrow()
    for (const surface of surfaces) {
      expect(
        ADJACENCY.some((a) => a.subject === 'border.focus' && a.against === surface),
        `border.focus is not declared against ${surface}`,
      ).toBe(true)
    }
  })

  it('border.control is declared, individually, against EACH of the five shipped surface tokens (enumerated, not a hand-written pair list) — the row-8 minimum a pair of prior fixes close, the row-9 twin above', () => {
    // Same shape as the border.focus enumeration immediately above, for the same reason:
    // the quantified form ("every surface.* a control sits on") is row 8 of the recorded
    // threshold table (tagged there as R18a), not R22 itself. R22's own coverage list reads
    // the weaker, unquantified "border.control against the surfaces a control sits on". That
    // prior fix describes row 8's quantifier as the same CLASS of quantifier as row 9's, not
    // identical to it. A declaration set short of the recorded minimum is a Phase 2 gap
    // against an approved [blocking] requirement, not a widening (the same fix's argument,
    // applied to the row above).
    // See the border.focus enumeration above for why this reads the one
    // frozen provenance record instead of repeating the citation as a comment here too.
    const surfaces = shippedSurfaces()
    expect(() => assertShippedSurfaceCountProvenance(surfaces)).not.toThrow()
    for (const surface of surfaces) {
      expect(
        ADJACENCY.some((a) => a.subject === 'border.control' && a.against === surface),
        `border.control is not declared against ${surface}`,
      ).toBe(true)
    }
  })
})

describe('AC-theming-26 covers: R22', () => {
  it('the published pairs and the harness input are the same set, generated from one declaration', () => {
    const results = runContrastHarness(runPipeline(seeds()))
    const declaredPairCount = ADJACENCY.length * 2 // per scheme
    expect(results.length).toBe(declaredPairCount)
  })

  // Part 4: R22's actual claim is "a new semantic token with no
  // adjacency declaration fails the build, naming that token" — the test above only
  // restates AC-theming-25's own property (a pair count matching itself proves nothing
  // about a token GAINING or LOSING its declaration).
  //
  // What follows covers ONE of the two failing directions AC-theming-26 names, plus a
  // SPECIAL CASE of the second, and the difference matters. `assertNoOrphanedSemanticSlot`
  // is keyed by SLOT, so it fires only when a slot is left mentioned NOWHERE. The new-token
  // direction is covered outright. The deletion direction is covered only where the deleted
  // entry was the slot's ONLY mention: content.secondary is picked precisely because it is
  // the one slot where slot-level and pair-level orphaning coincide (it appears exactly
  // once, and only as a subject), so deleting its entry is a real orphaning rather than a
  // synthetic one.
  //
  // What that leaves uncovered, named rather than implied: deleting a pair from a slot that
  // keeps other mentions — e.g. content.primary against surface.raised — produces a SMALLER
  // pair set with every guard here green and the whole suite byte-identical, which is
  // exactly the outcome AC-theming-26's second Then says must not happen ("rather than
  // producing a smaller pair set that the R21 check would pass"). That clause is pair-level
  // and this guard cannot see it; it is carried by part 5 and deferred.

  it('the shipped semantic slot set passes clean: every slot is mentioned in ADJACENCY, excluded, or listed OPEN', () => {
    expect(() => assertNoOrphanedSemanticSlot(SEMANTIC_SLOTS)).not.toThrow()
  })

  it('a NEW semantic token with no adjacency declaration fails the build, naming it', () => {
    const withNewToken = [...SEMANTIC_SLOTS, 'content.brandNew']
    expect(() => assertNoOrphanedSemanticSlot(withNewToken)).toThrow(
      /"content\.brandNew" carries no adjacency declaration/,
    )
  })

  it("a DELETED entry fails the same way: removing content.secondary's only declaration orphans it", () => {
    // content.secondary appears exactly once in the shipped set, and only as a subject
    // (never as a partner elsewhere) — deleting its one entry is a real, not synthetic,
    // orphaning, the same shape a careless edit to tokens.json's adjacency block would
    // produce.
    const withoutContentSecondary = ADJACENCY.filter((a) => a.subject !== 'content.secondary')
    expect(() => assertNoOrphanedSemanticSlot(SEMANTIC_SLOTS, withoutContentSecondary)).toThrow(
      /"content\.secondary" carries no adjacency declaration/,
    )
  })

  it('a listed ADJACENCY_EXCLUSIONS entry is the one legitimate SETTLED escape, and passes without a declaration', () => {
    expect(
      ADJACENCY.some((a) => a.subject === 'content.disabled' || a.against === 'content.disabled'),
    ).toBe(false)
    expect(() => assertNoOrphanedSemanticSlot(['content.disabled'])).not.toThrow()
  })

  it('every listed exclusion carries a non-empty reason (R22: "exclusions are listed WITH reasons")', () => {
    for (const [slot, reason] of Object.entries(ADJACENCY_EXCLUSIONS)) {
      expect(reason.length, `${slot}'s exclusion reason is empty`).toBeGreaterThan(0)
    }
  })

  // The guard above never reads the reason value, so a dropped condition
  // is invisible to it. content.disabled and border.disabled are both worded over a component
  // that is INACTIVE (per the project's reviewed and signed-off accessibility record);
  // border.default
  // rests on R22's decorative-dividers class and carries no such condition, so it is out of
  // scope here. A PRESENCE check, never equality (the accessibility steward's own ruling):
  // strengthening the reason stays green, only dropping the token goes red.
  it('the two disabled exclusions retain their INACTIVE condition token (case-sensitive)', () => {
    for (const slot of ['content.disabled', 'border.disabled']) {
      expect(
        ADJACENCY_EXCLUSIONS[slot]!.includes('INACTIVE'),
        `This exclusion rests on the component being INACTIVE, and the reason string no longer says so. An exclusion that drops its condition is a WIDER exclusion than the one that was signed. Restore the condition, or route the change through an accessibility review; do not relax this assertion.`,
      ).toBe(true)
    }
  })

  // A THIRD state, distinct from both declared and excluded. border.strong
  // (row 13's classification is unmade) and the three feedback-family standalone foregrounds
  // (an open design question) are neither — asserting either as an "exclusion" is a position
  // nobody took.

  it('ADJACENCY_EXCLUSIONS and ADJACENCY_OPEN are disjoint (no slot reads as both a settled position and an open question)', () => {
    for (const slot of Object.keys(ADJACENCY_OPEN)) {
      expect(Object.hasOwn(ADJACENCY_EXCLUSIONS, slot), `"${slot}" is in both records`).toBe(false)
    }
  })

  it('border.strong and the three feedback foregrounds are OPEN, not excluded', () => {
    for (const slot of [
      'border.strong',
      'feedback.warning.foreground',
      'feedback.success.foreground',
      'feedback.info.foreground',
    ]) {
      expect(Object.hasOwn(ADJACENCY_EXCLUSIONS, slot), `"${slot}" is still an exclusion`).toBe(
        false,
      )
      expect(Object.hasOwn(ADJACENCY_OPEN, slot), `"${slot}" is missing from ADJACENCY_OPEN`).toBe(
        true,
      )
    }
  })

  it('a listed ADJACENCY_OPEN entry does not fail the build, and is reported rather than silently passed', () => {
    expect(() => assertNoOrphanedSemanticSlot(['border.strong'])).not.toThrow()
    const result = assertNoOrphanedSemanticSlot(['border.strong'])
    expect(result.open).toEqual(['border.strong'])
  })

  it('the shipped slot set surfaces its real open slots in the returned report (not merely non-throwing)', () => {
    const result = assertNoOrphanedSemanticSlot(SEMANTIC_SLOTS)
    expect(result.open.toSorted(byName)).toEqual(
      [
        'border.strong',
        'feedback.warning.foreground',
        'feedback.success.foreground',
        'feedback.info.foreground',
      ].toSorted(byName),
    )
  })

  // Flagged by the accessibility steward: the exclusions channel gets the same "visible count" the
  // open channel already had, so an added ADJACENCY_EXCLUSIONS key changes reportable output
  // rather than disappearing into a silent `continue`.

  it('a listed ADJACENCY_EXCLUSIONS entry is reported in the returned report, not merely non-throwing', () => {
    expect(() => assertNoOrphanedSemanticSlot(['content.disabled'])).not.toThrow()
    const result = assertNoOrphanedSemanticSlot(['content.disabled'])
    expect(result.excluded).toEqual(['content.disabled'])
  })

  it('the shipped slot set surfaces its real excluded slots in the returned report, symmetric with .open', () => {
    const result = assertNoOrphanedSemanticSlot(SEMANTIC_SLOTS)
    expect(result.excluded.toSorted(byName)).toEqual(
      Object.keys(ADJACENCY_EXCLUSIONS).toSorted(byName),
    )
  })

  it('the orphan-slot message no longer offers ADJACENCY_EXCLUSIONS as an equal-weight alternative (the prior wording invited the reader into the exact escape that drops R22 coverage silently)', () => {
    let message = ''
    try {
      assertNoOrphanedSemanticSlot(['content.brandNew'])
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).not.toMatch(/add it to ADJACENCY_EXCLUSIONS with a citable reason/)
    expect(message).toMatch(/not alternatives you may take here/)
  })

  it('every ADJACENCY_OPEN entry also carries a non-empty reason', () => {
    for (const [slot, reason] of Object.entries(ADJACENCY_OPEN)) {
      expect(reason.length, `${slot}'s open reason is empty`).toBeGreaterThan(0)
    }
  })

  // The escape records and the declaration itself must stay disjoint. `mentioned` is checked
  // FIRST and `continue`s, so a slot that is both declared and listed would reach neither
  // branch: a settled exclusion contradicted by a live declaration would pass silently, and
  // an open question already answered by a declaration would keep reporting itself open.
  // Asserted as a PROPERTY of the records rather than as a census of today's members.

  it('no ADJACENCY_EXCLUSIONS or ADJACENCY_OPEN slot is also mentioned in the declaration', () => {
    const mentioned = new Set(ADJACENCY.flatMap((p) => [p.subject, p.against]))
    const both = [...Object.keys(ADJACENCY_EXCLUSIONS), ...Object.keys(ADJACENCY_OPEN)].filter(
      (slot) => mentioned.has(slot),
    )
    expect(both).toEqual([])
  })

  it('a slot that is BOTH declared and listed as an exclusion fails the build, naming it', () => {
    const declared = ADJACENCY[0]!.subject
    expect(() =>
      assertNoOrphanedSemanticSlot(SEMANTIC_SLOTS, ADJACENCY, {
        ...ADJACENCY_EXCLUSIONS,
        [declared]: 'a settled exclusion contradicted by a live declaration',
      }),
    ).toThrow(
      new RegExp(`"${declared.replaceAll('.', String.raw`\.`)}" is declared in the adjacency set`),
    )
  })

  it('a slot that is BOTH declared and listed OPEN fails the build too (the question is answered, not open)', () => {
    const declared = ADJACENCY[0]!.against
    expect(() =>
      assertNoOrphanedSemanticSlot(SEMANTIC_SLOTS, ADJACENCY, ADJACENCY_EXCLUSIONS, {
        ...ADJACENCY_OPEN,
        [declared]: 'an open question a live declaration already answered',
      }),
    ).toThrow(
      new RegExp(`"${declared.replaceAll('.', String.raw`\.`)}" is declared in the adjacency set`),
    )
  })
})

// Not a `covers:` clause: the `covers:` slot is reserved as the AC-to-test traceability spine,
// so an issue ref placed there would read to the AC grep as an AC binding. R38's floor provenance
// is Part 1's own obligation and carries no AC- id.
describe('R38 floor provenance (part 1)', () => {
  it('the frozen provenance record matches the live floor constants (passes today)', () => {
    expect(() => assertFloorProvenance()).not.toThrow()
  })

  // The failing direction, reachable only because the floors are injectable: with the
  // constants read from module scope the guard could never be driven anywhere but green,
  // and a guard only ever seen passing is a guard nothing has tested.
  it('a floor constant diverging from the frozen record fails, naming the record and refusing the update-the-record route', () => {
    expect(() => assertFloorProvenance({ textFloor: 4, nonTextFloor: 3, margin: 1.01 })).toThrow(
      /no longer match the frozen record they are checked against/,
    )
  })

  it('each of the three constants is checked, not just the first', () => {
    for (const floors of [
      { textFloor: 4.5, nonTextFloor: 4.5, margin: 1.01 },
      { textFloor: 4.5, nonTextFloor: 3, margin: 1.1 },
    ]) {
      expect(() => assertFloorProvenance(floors)).toThrow(/^Contrast floors:/)
    }
  })
})

// Same shape as the block above, for the shipped surface count's own frozen provenance record.
describe('shipped surface count provenance', () => {
  it('the frozen provenance record matches the live shipped surface count (passes today)', () => {
    expect(() => assertShippedSurfaceCountProvenance()).not.toThrow()
  })

  // The failing direction, reachable only because the surface list is injectable: read
  // straight off SEMANTIC_SLOTS the guard could never be driven anywhere but green.
  it('a surface count diverging from the frozen record fails, naming what changed and what to do about it', () => {
    expect(() =>
      assertShippedSurfaceCountProvenance([
        'surface.base',
        'surface.raised',
        'surface.overlay',
        'surface.sunken',
        'surface.inverse',
        'surface.new',
      ]),
    ).toThrow(/no longer match the frozen count/)
  })

  it('a count below the frozen record also fails (not just an increase)', () => {
    expect(() => assertShippedSurfaceCountProvenance(['surface.base'])).toThrow(
      /^Shipped surface provenance:/,
    )
  })
})

describe('AC-theming-49 covers: R39', () => {
  it('no shipped slot in a text pair is pinned to the same step in both schemes (satisfied by construction)', () => {
    const violations = checkSameStepLint(runPipeline(seeds()))
    expect(violations).toEqual([])
  })

  it('the achromatic branchs resolved values are also checked by the lint (round 8)', () => {
    const violations = checkSameStepLint(runPipeline(seeds({ l: 0.6, c: 0, h: 0 })))
    expect(violations).toEqual([])
  })

  it('fails closed with a named error when the classification source is absent, rather than skipping or reporting a green run', () => {
    // Constructed exactly as AC-theming-49's fail-closed case says to construct it (remove
    // or corrupt the source), matching the shape AC-theming-23 exercises for R21. The
    // previous version asserted that the lint does NOT throw on the shipped source, which
    // is the passing direction and leaves the fail-closed direction unexercised.
    const result = runPipeline(seeds())
    expect(() => checkSameStepLint(result, 'nave', [])).toThrow(
      /Same-step lint: the pair-declaration source is empty/,
    )
    // Fails closed for a consumer's build too: severity conditions what a HIT does, never
    // whether the check runs at all.
    expect(() => checkSameStepLint(result, 'consumer', [])).toThrow(
      /Same-step lint: the pair-declaration source is empty/,
    )
  })

  it("R39's lint reads the same slot surface R21's harness does, action.secondary's companions included", () => {
    // R39 is role-agnostic and scale-agnostic, and R22 declares a TEXT pair on
    // action.secondary's declared foreground (row 6). The lint used to read result.slots
    // alone while the harness unions in the two action.secondary companions, so a companion
    // pinned across schemes was a slot the harness judged and the lint could not see.
    const companionPinned = pinnedResult('content.primary')
    const pinned = companionPinned.actionSecondaryForeground.light
    const result = {
      ...companionPinned,
      slots: [],
      actionSecondaryForeground: { light: pinned, dark: { ...pinned, branch: 'dark' as const } },
    } as unknown as PipelineResult

    const hits = checkSameStepLint(result, 'nave')
    expect(hits.map((h) => h.slot)).toContain('action.secondary.foreground')
  })

  it('the predicate is identical for Nave and a consumer: same slot, same pair, only severity differs', () => {
    const naveHits = checkSameStepLint(pinnedResult('content.primary'), 'nave')
    const consumerHits = checkSameStepLint(pinnedResult('content.primary'), 'consumer')

    expect(naveHits.length).toBeGreaterThan(0)
    expect(naveHits.map((h) => h.slot)).toEqual(consumerHits.map((h) => h.slot))
    expect(naveHits.map((h) => h.description)).toEqual(consumerHits.map((h) => h.description))
  })

  it("Nave's own build: a hit is severity 'fail'", () => {
    const hits = checkSameStepLint(pinnedResult('content.primary'), 'nave')
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) expect(hit.severity).toBe('fail')
  })

  it("a consumer's build via the CLI: the identical hit is severity 'report', never 'fail'", () => {
    const hits = checkSameStepLint(pinnedResult('content.primary'), 'consumer')
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) expect(hit.severity).toBe('report')
  })

  it("defaults to source: 'nave' when unspecified (Nave's own build is the common caller)", () => {
    const withDefault = checkSameStepLint(pinnedResult('content.primary'))
    const explicit = checkSameStepLint(pinnedResult('content.primary'), 'nave')
    expect(withDefault).toEqual(explicit)
  })

  it('the branch case (round 8): border.focus at neutral-500/neutral-500 does not fire, because its pairs are non-text (text-pairs-only case)', () => {
    // Round 11: border.focus's achromatic-branch value moved to neutral-500/neutral-500,
    // the first REAL instance of the text-pairs-only case
    // rather than a constructed one. Its ADJACENCY pairs are both 'non-text'
    // (border.focus against surface.base / surface.raised), so the same-step lint,
    // which only checks 'text' pairs, must not fire on it.
    const violations = checkSameStepLint(runPipeline(seeds({ l: 0.6, c: 0, h: 0 })))
    expect(violations.some((v) => v.slot === 'border.focus')).toBe(false)
  })

  it('round 15: the CHROMATIC column (the shipped default seed) now pins border.focus at primary-500 in both schemes too, and the lint still does not fire on it (text-pairs-only case) — the negative case is now exercised by the shipped build, not only the branch', () => {
    const result = runPipeline(seeds())
    const light = result.slots.find((s) => s.slot === 'border.focus' && s.branch === 'light')!
    const dark = result.slots.find((s) => s.slot === 'border.focus' && s.branch === 'dark')!
    // Genuinely pinned under the shipped default now (round 11's instance lived only in
    // the branch column, which only one seed class selects).
    expect(light.resolved).toEqual(dark.resolved)

    const violations = checkSameStepLint(result)
    expect(violations.some((v) => v.slot === 'border.focus')).toBe(false)
  })
})

describe('AC-theming-51 covers: R22', () => {
  it('none of the four forbidden adjacency declarations is authored on either side', () => {
    expect(() => assertNoForbiddenAdjacency()).not.toThrow()
  })

  it('round 9: entry 3 is two rules under one number, and this scenario asserts only that each pair is UNDECLARED — no ratio, margin or verdict for either half', () => {
    // AC-theming-51, verbatim: it "asserts only that the pair is undeclared, never that it
    // fails anything", and it "asserts no ratio, margin or verdict for any of the four
    // pairs". This test used to compute two contrast numbers here — one asserting the
    // chromatic fills fall BELOW the non-text floor, one asserting action.secondary clears
    // it by 4x — which is exactly the verdict the criterion forbids it to state, on the
    // half where the criterion also warns a reader not to conclude a failure. Both are
    // replaced by the undeclaredness assertions the criterion does state. The arithmetic
    // behind either half is the accessibility steward's, lives in the cited findings, and is not
    // restated here (one canonical home per fact).
    for (const fillSlot of ['action.primary', 'feedback.danger', 'action.secondary']) {
      // Undeclared: nothing in the adjacency declaration set pairs this fill with the
      // inverted surface, on either side.
      expect(isDeclaredEitherSide(fillSlot, 'surface.inverse')).toBe(false)
      // And entry 3 is what names it — one derived rule covering both halves, since the
      // AUTHORING instruction is the same for the chromatic fills (an N1 instance) and for
      // action.secondary (a product/design position: 0.1.0 does not document a pale wash on
      // the inverted surface).
      expect(findForbiddenAdjacencyRule(fillSlot, 'surface.inverse')?.entry).toBe(3)
    }
  })

  it("entries 2 and 3 are DERIVED predicates, not an enumeration of today's slots: a content.* the list never named trips entry 2", () => {
    // R22 rewrote this list into derived form in round 9 precisely because a
    // hand-maintained list of verdicts "grows by one entry per new slot forever". The
    // enumerated form named content.primary against feedback.danger and feedback.warning
    // and nothing else, so content.tertiary against feedback.success — a pair the list
    // never mentioned — was authorable with no check firing.
    const withViolation: Adjacency[] = [
      ...ADJACENCY,
      { subject: 'content.tertiary', against: 'feedback.success', class: 'text' },
    ]
    expect(() => assertNoForbiddenAdjacency(withViolation)).toThrow(/rule 2/)
    expect(() => assertNoForbiddenAdjacency(withViolation)).toThrow(/content\.tertiary/)
  })

  it('entry 3 covers a filled feedback family the enumerated list never named (feedback.info against surface.inverse), in either declaration order', () => {
    const forwards: Adjacency[] = [
      ...ADJACENCY,
      { subject: 'feedback.info', against: 'surface.inverse', class: 'non-text' },
    ]
    const backwards: Adjacency[] = [
      ...ADJACENCY,
      { subject: 'surface.inverse', against: 'feedback.info', class: 'non-text' },
    ]
    expect(() => assertNoForbiddenAdjacency(forwards)).toThrow(/rule 3/)
    expect(() => assertNoForbiddenAdjacency(backwards)).toThrow(/rule 3/)
    // The message states its rule number twice (the leading "(rule N)" and a second "rule N
    // forbids it" later in the same sentence); /rule 3/ above matches either copy and so
    // does not discriminate which one is correct. Anchor the FIRST occurrence in its own
    // right.
    expect(() => assertNoForbiddenAdjacency(forwards)).toThrow(
      /^Adjacency rule violation \(rule 3\):/,
    )
  })

  it('the derived predicates name FILLS, so a .foreground role is not swept up by them', () => {
    // R18c splits each feedback family into a foreground role and a solid-background role,
    // and entries 2 and 3 govern the FILL. feedback.danger.foreground against surface.base
    // is in the shipped set (row 12, feedback used as icon or indicator) and must stay
    // lawful — a predicate reading "starts with feedback." alone would forbid it.
    expect(
      findForbiddenAdjacencyRule('content.primary', 'feedback.danger.foreground'),
    ).toBeUndefined()
    expect(
      findForbiddenAdjacencyRule('feedback.danger.foreground', 'surface.inverse'),
    ).toBeUndefined()
    expect(() => assertNoForbiddenAdjacency()).not.toThrow()
  })

  it('entries 1 and 4 stay the single pairs R22 states them as, and are still caught', () => {
    const entryOne: Adjacency[] = [
      { subject: 'content.secondary', against: 'surface.inverse', class: 'text' },
    ]
    const entryFour: Adjacency[] = [
      { subject: 'action.secondary', against: 'content.inverse', class: 'text' },
    ]
    expect(() => assertNoForbiddenAdjacency(entryOne)).toThrow(/rule 1/)
    expect(() => assertNoForbiddenAdjacency(entryFour)).toThrow(/rule 4/)
    // Neither widens beyond its own pair: another content slot on the inverted surface is
    // not entry 1's business (content.inverse against surface.inverse is what R18d ships).
    expect(findForbiddenAdjacencyRule('content.inverse', 'surface.inverse')).toBeUndefined()
  })

  it('round 12: the fifth entry — no focusable slot (border.focus) is declared adjacent to any action.* fill', () => {
    expect(() => assertNoFocusableAdjacentToActionFill()).not.toThrow()
  })

  it('a source that declares one is refused by THIS check at declaration time, before the pair ever reaches the contrast harness', () => {
    const withViolation: Adjacency[] = [
      ...ADJACENCY,
      { subject: 'border.focus', against: 'action.primary', class: 'non-text' },
    ]
    expect(() => assertNoFocusableAdjacentToActionFill(withViolation)).toThrow(
      /border\.focus.*action\.primary/,
    )

    // Entry 5 refuses a different KIND of pair than entries 1-4: a focus ring is drawn
    // offset outside its control, so a declaration against an action fill describes a
    // composition (the ring sitting on whatever is behind the control), not a colour
    // pairing. This check fails closed on that composition at the declaration stage,
    // independent of whether R21's harness would also fail it if the declaration reached
    // that far — verified it does, immediately below: declaring the same pair non-text
    // runs it through runContrastHarness/assertContrastFloors and both schemes fail, well
    // below the non-text floor. Today's shipped ADJACENCY has no border.focus/action.*
    // pair at all, which this second assertion confirms.
    expect(
      ADJACENCY.some(
        (p) =>
          (p.subject === 'border.focus' && p.against.startsWith('action.')) ||
          (p.against === 'border.focus' && p.subject.startsWith('action.')),
      ),
    ).toBe(false)
  })

  it('the pair entry 5 refuses also fails the harness (assertContrastFloors), which the comment above claimed and this checks', () => {
    const violatingPair: Adjacency[] = [
      { subject: 'border.focus', against: 'action.primary', class: 'non-text' },
    ]
    const results = runContrastHarness(runPipeline(seeds()), violatingPair)
    expect(results).toHaveLength(2) // one per scheme
    for (const r of results) {
      expect(r.floor).toBe(NON_TEXT_FLOOR)
      expect(r.pass).toBe(false)
    }
    expect(() => assertContrastFloors(results)).toThrow(/border\.focus.*action\.primary/)
  })
})

describe('AC-theming-53 covers: R22', () => {
  it('the shipped adjacency set satisfies the C5 minimum (does not fail today)', () => {
    expect(() => assertCoverageFloor()).not.toThrow()
  })

  it('a change that REMOVES a minimum category fails a check naming the missing category', () => {
    const withoutBorderControl = ADJACENCY.filter((a) => a.subject !== 'border.control')
    expect(() => assertCoverageFloor(withoutBorderControl)).toThrow(/borderControl/)
  })

  it('a change that ADDS a category or pair beyond the minimum is accepted with no gate requirement', () => {
    const widened = [
      ...ADJACENCY,
      { subject: 'content.primary', against: 'surface.overlay', class: 'text' as const },
    ]
    expect(() => assertCoverageFloor(widened)).not.toThrow()
  })
})

// The anchors above pin an interpolated fragment or one prose phrase
// each, which survives a copy edit that deletes every OTHER word — a mutation deletion
// probe confirmed this for all four cleared messages (three below, plus neutral.ts's).
// These three assertions pin the FULL thrown message, independently typed rather than
// imported from the source constant, so a copy edit to the constant makes the hardcoded
// string here mismatch and this test go red, closing the gap the anchors leave open.
describe('full-content pins for the three steward-cleared adjacency.ts messages', () => {
  it('assertCoverageFloor: the full message for a missing category', () => {
    const withoutBorderControl = ADJACENCY.filter((a) => a.subject !== 'border.control')
    let message = ''
    try {
      assertCoverageFloor(withoutBorderControl)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe(
      'Adjacency coverage violation: the required coverage category "borderControl" is ' +
        'missing from the declared adjacency set. This set has a required minimum: every ' +
        'category in it keeps at least one declared pair, so that dropping coverage is a ' +
        'visible decision rather than a quiet one. Restore the declaration. If you believe ' +
        'the category should no longer be required, that is a decision for the maintainers ' +
        'and not a change to make here: open an issue naming the category and why, and ' +
        'leave the removal out of the pull request until that issue is answered.',
    )
  })

  it('assertNoForbiddenAdjacency: the full message for rule 1', () => {
    const entryOne: Adjacency[] = [
      { subject: 'content.secondary', against: 'surface.inverse', class: 'text' },
    ]
    let message = ''
    try {
      assertNoForbiddenAdjacency(entryOne)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe(
      'Adjacency rule violation (rule 1): the pair (content.secondary, surface.inverse) is ' +
        'declared, and rule 1 forbids it: `content.secondary` adjacent to `surface.inverse`. ' +
        'The rules in this file record decisions about which colour pairs this design system ' +
        'will declare and test; they are not a list to edit to make a build pass. Remove the ' +
        'declaration, or, if you need this pair, open an issue describing it and why, and ' +
        'leave it out of the pull request until that issue is answered.',
    )
  })

  it('assertNoFocusableAdjacentToActionFill: the full message for a declared ring-vs-fill pair', () => {
    const withViolation: Adjacency[] = [
      ...ADJACENCY,
      { subject: 'border.focus', against: 'action.primary', class: 'non-text' },
    ]
    let message = ''
    try {
      assertNoFocusableAdjacentToActionFill(withViolation)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe(
      'Adjacency rule violation: the focusable slot "border.focus" is declared adjacent to ' +
        'the action fill "action.primary". A focus indicator is drawn offset outside the ' +
        'control it belongs to, so it lands on whatever sits behind that control, not on the ' +
        "control's own fill; a declaration putting one against an action fill therefore " +
        'describes a focusable element sitting ON that fill, which is a composition rather ' +
        'than a colour pairing. This rule records a decision about which colour pairs this ' +
        'design system will declare and test; it is not a check to silence or narrow to make ' +
        'a build pass. Remove the declaration, or, if you need this pair, open an issue ' +
        'describing it and why, and leave it out of the pull request until that issue is ' +
        'answered.',
    )
  })
})
