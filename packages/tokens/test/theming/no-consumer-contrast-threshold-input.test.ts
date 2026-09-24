/**
 * AC-token-build-27 covers: R27.
 *
 * R27's cleared paragraph states this entry point's contrast-threshold posture to a consumer.
 * The surface is `packages/tokens/README.md`, ruled by product on the
 * criterion's own words: the criterion ranges over "the shipped documentation surface where
 * THIS ENTRY POINT's contrast-threshold posture is stated to a consumer", and the paragraph's
 * own subject is this entry point's FLAGS, which are documented to a consumer here and nowhere
 * else. The repository-root README's accessibility section was refused BY NAME in that same
 * ruling, on the ground that placement can convert an artifact fact into a conformance-adjacent
 * claim: R27 is about an absent INPUT, the accessibility non-promises about an absent VERDICT.
 * That refusal is pinned below, because it is a ruling a later well-meaning edit could undo.
 *
 * The paragraph carries a NEW last sentence, re-cleared by the project's accessibility/licensing
 * steward on 2026-09-07 (applied path). The old one named an internal tracking id, which no
 * reader of the published package can resolve, and it could not be repaired by qualifying it:
 * putting the repository name in front of the number clears the rule against BARE references,
 * which fences qualified spellings out by construction, and lands squarely on the separate rule
 * against naming the internal repository at all. The two obligations close on the sentence from
 * opposite sides, so deletion was the only compliant act. Sentences one through four are
 * byte-identical to the 2026-08-22 clearance.
 *
 * WHAT THIS FILE NO LONGER DOES, and why that is not a coverage loss. It used to run a
 * repository-side identifier detector over the constant, in this same file, because the only
 * instrument that could see such an identifier was report-only and deliberately outside
 * `ci:check` — so a byte-identity assertion on one gate and an identifier scan on no gate could
 * go green independently, which is exactly how the old last sentence's collision stayed
 * invisible for sixteen days. That detector has been retired from this repository, on the
 * ground that an instrument of that kind has to spell out the vocabulary it is trying to keep
 * out and is therefore the loudest instance of what it forbids. The scan now runs OUTSIDE this
 * repository, on the authoring side, at three points that are gates rather than reports: on
 * every tooling-assisted write into the tree, on the deterministic first step of every review,
 * and on a local pre-push hook. The seam that motivated the in-file pass is closed by a gate
 * instead of by a second copy of the problem, and what stays here is the byte identity, the
 * digest, and the placement rulings — the parts a reader of this package can verify from this
 * package.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  findConformanceFraming,
  NO_CONSUMER_CONTRAST_THRESHOLD_INPUT,
} from '../../src/theming/copy-lint.ts'
import { headingOffsetsOutsideFences } from './markdown-headings.ts'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..')

const TOKENS_README = readFileSync(path.resolve(import.meta.dirname, '../../README.md'), 'utf8')
// One spelling of the repository root for every path derived from it, including this one: two
// spellings that resolve identically are two things to keep in agreement for no gain.
// Read unguarded on purpose, so a wrong path throws here rather than
// reading as a file that is simply absent.
const REPO_ROOT_README = readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8')

/**
 * Every README this repository ships, which is the real scope of "never independently authored
 * at a second site": the repository root plus one per package.
 *
 * DERIVED FROM THE TREE, never enumerated. A hand-written path list makes this docblock's own
 * claim ("every README this repository ships") true only while the package set happens to match
 * it, and it fails in two directions at once: a package added later
 * is scanned by nothing, and a path TYPO reads as a file that is simply absent, which is
 * indistinguishable from the real thing. Walking `packages/` for its directories closes both,
 * because membership is now a fact about the tree rather than a list somebody has to remember to
 * update. A package that ships no README yet is absent from the set for that reason alone, so
 * the day one appears carrying this paragraph the count moves and this reds.
 */
const SHIPPED_READMES = [
  path.join(REPO_ROOT, 'README.md'),
  ...readdirSync(path.join(REPO_ROOT, 'packages'), { withFileTypes: true })
    // The second disjunct is not redundant, which is why it says so: `isDirectory()` is FALSE
    // for a symlink even when it points at a directory (`isSymbolicLink()` is the true one), so
    // a symlinked package would silently leave the set and its README would be scanned by
    // nothing. The enumerated list this replaced gated on `existsSync`, which FOLLOWS symlinks,
    // so dropping them was a regression the derivation introduced.
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => path.join(REPO_ROOT, 'packages', entry.name, 'README.md')),
]
  .filter((absolute) => existsSync(absolute))
  .map((absolute) => ({
    path: path.relative(REPO_ROOT, absolute),
    text: readFileSync(absolute, 'utf8'),
  }))

/**
 * The section boundaries this file reads by: heading levels 1 and 2 ONLY, outside fences.
 *
 * A plain `indexOf('\n## ')` is fooled by a `## ` line inside a fence in BOTH directions:
 * forwards it ends the section early, backwards it moves the section's start past prose that is
 * really in it. The quality reviewer measured the backwards half on this very file,
 * where a `bash` fence between a conformance-framing sentence and the paragraph left the suite
 * green. The fence tracking that closes that lives in `markdown-headings.ts`, shared with
 * `remaining-ac.test.ts`, and its own docblock carries the tracker's
 * reasoning and its measured residuals.
 *
 * THE LEVEL SCOPE IS DELIBERATELY 1 AND 2, and it is stated because widening it silently was a
 * regression here. These are SECTION boundaries: `#{1,2}` restores
 * exactly what the pre-round-2 `## ` anchor bounded, and `# ` joins it because a level-1 heading
 * certainly ends a section. A SUB-heading does NOT bound a section: a `### ` lawfully added
 * between a conformance-framing sentence and the paragraph leaves that sentence inside the
 * section the paragraph is in, and the suite must still red on it. That is the property this
 * scope pins, and scanning `#{1,6}` broke it while looking like a generalization. The sibling
 * caller passes 6 for its own good reason, which is why the level is the shared function's
 * parameter rather than either file's private choice.
 */
const SECTION_HEADING_MAX_LEVEL = 2

/**
 * The README section containing the paragraph, which is the honest reading unit for R27's
 * "anywhere in or near it" and is bounded by the artifact's own headings rather than by an
 * arbitrary character window.
 */
function containingSection(markdown: string, needle: string): string {
  const at = markdown.indexOf(needle)
  expect(at, 'the cleared paragraph is not in the README at all').toBeGreaterThan(-1)
  const headings = headingOffsetsOutsideFences(markdown, SECTION_HEADING_MAX_LEVEL)
  const start = headings.findLast((offset) => offset <= at) ?? 0
  const nextHeading = headings.find((offset) => offset > at) ?? markdown.length
  return markdown.slice(start, nextHeading)
}

/**
 * SHA-256 of R27's cleared paragraph, over the paragraph's own 481 bytes: the spec presents it
 * as a bold-opened blockquote, and the `> ` and `**` markers are how the spec PRESENTS cleared
 * copy rather than part of the cleared bytes (`RETHEMING_NOTICE` is the settled precedent, bold
 * and quoted in its spec, plain in its constant and plain in this README).
 *
 * A digest and not a second readable copy, deliberately: a copy is a surface a later editor can
 * harmonise into agreement with a wrong constant, and that harmonising edit is the one this pin
 * exists to catch. This package has a recorded instance of the copy going the other way.
 *
 * What the number is worth is entirely its provenance, so this states that rather than the
 * stronger thing it is tempting to state. It is NOT a check against the spec, which CI cannot
 * read. It is a check that the constant still equals bytes four parties computed independently
 * from R27's source spec on 2026-09-07 (engineering, quality, architecture and
 * accessibility/licensing review), each stripping
 * exactly those two markers and each reading 481 characters, zero non-ASCII, straight
 * apostrophes.
 */
const CLEARED_PARAGRAPH_SHA256 = '23e9780e3fc3bb9912ae9fff460601eee678c9d6afa88b3b0a5c1f057ffa73a7'

/**
 * A qualified tracker reference, `<slug>#<digits>`: what a bare number turns into when someone
 * "fixes" it by putting a repository in front of it.
 *
 * IT DELIBERATELY DOES NOT FENCE THE LEFT SIDE, and that is a reverted decision rather than an
 * omission, so the next reader does not re-attempt it. Unfenced, the shape accepts one known
 * false-positive class: the tail of a digit-initial URL fragment, `https://example.com/docs#3`.
 * That class is UNREACHABLE in this subject, because neither a CSS id selector nor an XML id may
 * begin with a digit and this constant carries no fragment of any kind. A lookbehind keyed on
 * `/` was tried and reverted, because every slash-keyed fence also excludes the TWO-SEGMENT
 * spelling, `owner/repo#632` — which is reachable, and which the repository-wide bare-form guard
 * already skips by its own identical fence, so fencing here would leave that spelling seen by no
 * check in this repository at all. An unreachable false positive is the cheaper of the two.
 */
const TRACKER_REFERENCE_PATTERN = /[\w-]+#\d+/

/**
 * An internal record id, the same shape `build-step.test.ts` already spells over the composed
 * artifacts, so this introduces no vocabulary that is not already in the tree. The one-letter
 * prefix is a member in its own right; the alternation tries the two-letter one first, so each
 * still matches as itself.
 */
const RECORD_ID_PATTERN = /\b(?:F|D|LE|L)-\d{8}-/

describe('AC-token-build-27 covers: R27 (packages/tokens/README.md)', () => {
  it('the README carries R27s cleared paragraph byte-identically to the one constant', () => {
    expect(TOKENS_README).toContain(NO_CONSUMER_CONTRAST_THRESHOLD_INPUT)
  })

  it('still equals the bytes that were cleared, pinned by digest rather than by a second copy of them', () => {
    /*
     * The second argument is vitest's supported per-assertion message, and here it is the whole
     * point: the failure text IS the instruction not to recompute the digest, and it has to reach
     * whoever reads the runner output rather than only whoever opens this file. It is ONE STRING
     * LITERAL on purpose: `vitest/valid-expect` permits exactly a literal or a template literal
     * as that second argument and returns early on it, so a concatenation is what the rule fires
     * on and no suppression is needed here.
     */
    expect(
      createHash('sha256').update(NO_CONSUMER_CONTRAST_THRESHOLD_INPUT, 'utf8').digest('hex'),
      'The constant no longer matches the cleared bytes. If no re-clearance happened, the CONSTANT is what is wrong: restore it, and do not recompute this digest to make this green. The digest changes in exactly one situation, in the same commit that carries a re-clearance, and only its holder updates it. Recomputing it here retires the one check that can see the constant and the README edited together, which is the edit this test exists for.',
    ).toBe(CLEARED_PARAGRAPH_SHA256)
  })

  it('opens on the sentence AC-token-build-27 pins it by, so the criterions parenthetical stays live', () => {
    // Product's fence 1: the criterion pins the paragraph by its opening in a parenthetical, so a
    // variant that moves the opening makes that parenthetical stale and owes a quality-review
    // delta.
    expect(
      NO_CONSUMER_CONTRAST_THRESHOLD_INPUT.startsWith(
        '0.1.0 ships no consumer contrast-threshold input.',
      ),
    ).toBe(true)
  })

  it('is sourced from that one constant: exactly one instance, never authored a second time', () => {
    const occurrences = TOKENS_README.split(NO_CONSUMER_CONTRAST_THRESHOLD_INPUT).length - 1
    expect(occurrences).toBe(1)
  })

  it('does not reach the repository-root README, the one surface product refused BY NAME', () => {
    expect(REPO_ROOT_README).not.toContain(NO_CONSUMER_CONTRAST_THRESHOLD_INPUT)
    // Not the whole paragraph and not a partial transcription of it either: the opening sentence
    // is what the criterion pins, so a fragment landing at the refused surface is caught too.
    expect(REPO_ROOT_README).not.toContain('0.1.0 ships no consumer contrast-threshold input')
  })

  it('is never independently authored at a second site: of every README this repository ships, only packages/tokens carries it', () => {
    // The criterion's clause quantifies over every surface a consumer reads, so the check has
    // to as well: one assertion above pins the surface product refused BY NAME, and this one pins
    // the COUNT across the whole set, which is what the word "never" actually claims. Checked
    // against the OPENING SENTENCE rather than the whole paragraph, because a second site that
    // copies only the opening is the same defect and the cheaper one to write by accident.
    //
    // WHAT THIS DOES NOT CATCH, stated rather than left for a green to overstate: the criterion
    // also says "never PARAPHRASED", and no exact-string scan can see a paraphrase. A second
    // site that says the same thing in its own words passes every assertion in this file. That
    // half is held by review, not by CI.
    const carriers = SHIPPED_READMES.filter((readme) =>
      readme.text.includes('0.1.0 ships no consumer contrast-threshold input'),
    )
    expect(carriers.map((readme) => readme.path)).toEqual(['packages/tokens/README.md'])
  })

  it('carries no conformance framing, in the paragraph or in the README section around it', () => {
    // Conformance FRAMING, which is narrower than R27's two omissions, and the gap is named
    // rather than implied. This lint's vocabulary is the vocabulary of a conformance CLAIM
    // (WCAG, AA/AAA, "meets", an x:1 ratio, an SC id); it is deliberately not the vocabulary of
    // contrast MEASUREMENT, because Nave's own guards say "floor", "threshold" and "ratio" in
    // the messages they throw and must be able to. Both wordings R27 excludes BY NAME pass this
    // predicate, and inside the paragraph it is the digest pin above, not this, that holds them
    // out. For the prose AROUND the paragraph nothing mechanical holds them, by decision and not
    // by oversight (an explicit call by the accessibility/licensing steward): that is caught by the
    // first-publish sweep over the whole packed set, and widening this lint to reach it would red
    // the shipped guard messages the same function checks.
    expect(findConformanceFraming(NO_CONSUMER_CONTRAST_THRESHOLD_INPUT)).toBeUndefined()
    const section = containingSection(TOKENS_README, NO_CONSUMER_CONTRAST_THRESHOLD_INPUT)
    expect(findConformanceFraming(section)).toBeUndefined()
  })

  it('names no tracker a reader of the published package cannot open', () => {
    // What survives the detector's retirement, written as a shape rather than as a vocabulary.
    // The old last sentence of this paragraph pointed at a tracking id, and the repair was
    // deletion rather than qualification; this keeps a tripwire on that specific regression
    // without this file having to spell out the thing it is keeping out. A qualified tracker
    // reference is `<slug>#<digits>`, which is what a citation looks like once someone
    // "fixes" a bare number by adding the repository in front of it.
    //
    // The BARE form (`#<digits>` with nothing in front) is deliberately not repeated here: it
    // is already asserted over every tracked file in the repository, this constant's source
    // file included, by `scripts/check-no-bare-issue-refs.test.mjs`. Only the qualified form
    // needs a home, because that guard's own fences let it through by design.
    expect(NO_CONSUMER_CONTRAST_THRESHOLD_INPUT).not.toMatch(TRACKER_REFERENCE_PATTERN)

    // The record-id shape, on the same row and for the same reason the two above it are here.
    // Its ground is worth stating, because the digest two tests up looks like it already covers
    // this: the digest covers TODAY's bytes, and on a lawful re-clearance the digest is updated
    // BY DESIGN, in the same commit that changes the paragraph. At that moment the shape
    // assertions on this row are the only coverage this repository has of the cleared bytes, so
    // a re-clearance that reintroduced an unresolvable identifier would pass a green digest.
    expect(NO_CONSUMER_CONTRAST_THRESHOLD_INPUT).not.toMatch(RECORD_ID_PATTERN)
  })
})
