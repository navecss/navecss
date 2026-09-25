import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Review cleared five prose values inside `tokens.json`'s
 * `$extensions['dev.navecss.theming']` block: four in one pass, and a fifth
 * (`adjacency.comment`) separately, because that fifth value states what the package's
 * contrast-pair coverage list IS relative to a signed contrast-threshold table —
 * accessibility-relevant material, not incidental prose. Nothing anchored any of the five
 * before this file existed: reverting all four of the first-pass values at once still left
 * `ci:check` at exit 0 with not one check moving, so a rewording, a weakening or a full revert
 * of any of them passes every deterministic gate silently.
 *
 * This is a BACKSTOP, not a correctness gate: it anchors what was cleared as TEXT, not the
 * relationship between this declarative block and the code that actually computes the shipped
 * values. A clearance of BYTES is anchorable by comparing bytes; a clearance whose subject is a
 * RELATION (a docblock's relationship to the code it documents) is not, and this file does not
 * attempt it.
 *
 * Construction requirements this file honours: compares the RESOLVED string value parsed from
 * the JSON, never a source line or byte offset, so a `prettier` re-wrap or a change to JSON key
 * order/escaping cannot turn this red for no reason; one note for the whole group, not one per
 * value; and this file is never described anywhere as covering the relation-shape class above,
 * only the five byte values named below.
 */

const TOKENS_JSON_PATH = path.resolve(import.meta.dirname, '../../tokens.json')

/**
 * These expected values are the wording that was settled in review, and this
 * test exists so that a later edit to any of them cannot pass silently. It is a
 * BACKSTOP, not a gate: it compares bytes, and it cannot tell a deliberate
 * rewording from an accidental one.
 *
 * So if this goes red, do NOT update the expected value to match the file.
 * Changing this text is a review change, not a test fixup, and editing the
 * literal here in the same commit turns a red gate into a green one without
 * anyone having read the new wording. Restore the wording the file had, or open
 * an issue proposing the new wording and get the maintainer's approval before
 * this literal moves.
 */
// This value was reworded once, deliberately, when the token source moved to the DTCG 2025.10
// format: the old text claimed the build emits a DTCG file any DTCG tool can consume, and that
// artifact was renamed to palette-record.json and is not a token document in that format. The
// literal follows that approved rewording; it was not edited to make a red test pass.
const EXPECTED_THEMING_COMMENT =
  'colour is no longer hand-authored in this file. The format has no notion of a derived token, so the seed binding and the step table live here under this namespaced extension; the actual generation, the achromatic branch, the semantic-slot mapping and the RCS formulas are computed by packages/tokens/src/theming/ (pipeline.ts et al.), never re-derived from this block by a second implementation. The build additionally emits a resolved palette record as an artifact (dist/palette-record.json), which is a record of what was built and is not a token document in this format. This block is a DECLARATION, not executable: it records what the shipped defaults ARE, for a reader of the source, and the generator is the single source of truth for how they are computed.'

const EXPECTED_SEEDS_PRIMARY_NOTE = 'brand teal, fixed 2026-08-10'

const EXPECTED_SEEDS_DANGER_NOTE = 'fixed 2026-08-12'

const EXPECTED_ACHROMATIC_BRANCH =
  'an exactly-zero-chroma primary seed is a legal input, not an error: it selects the achromatic branch, under which action.primary and its hover and active states, on-action.primary, content.link and border.focus all resolve against the neutral ramp rather than the chroma-zero primary ramp. The values are computed by packages/tokens/src/theming/, never read from this block.'

// Sourced from the value actually shipped in tokens.json today (820 bytes), deliberately NOT
// from an earlier, shorter pre-clearance draft of the same key (740 bytes). Transcribing that
// draft here would pin the wrong text and redden this test against the correct, already-shipped
// file.
const EXPECTED_ADJACENCY_COMMENT =
  "Each subject's legal partners: the contract for which colour pairs this package documents and checks a contrast floor for. packages/tokens/src/theming/adjacency-source.ts materializes this block into its ADJACENCY export at build time, and the contrast harness and any published pair documentation read that export rather than this block, so a second implementation cannot drift from it. This list is a MINIMUM, not the full slot cross-product: a pair that is not here is documented nowhere and is promised nothing. Removing an entry is therefore not a local edit, it changes what this project documents; if an entry looks wrong, open an issue rather than deleting it here. No contrast conclusion is drawn from this data and none may be read out of it: a floor or an admissible window is not something this file records."

describe('tokens.json cleared-prose anchor', () => {
  const raw = readFileSync(TOKENS_JSON_PATH, 'utf8')
  const parsed = JSON.parse(raw) as {
    $extensions: {
      'dev.navecss.theming': {
        achromaticBranch: string
        adjacency: { comment: string }
        comment: string
        seeds: { danger: { note: string }; primary: { note: string } }
      }
    }
  }
  const theming = parsed.$extensions['dev.navecss.theming']

  it('$extensions["dev.navecss.theming"].comment matches the cleared wording', () => {
    expect(theming.comment).toBe(EXPECTED_THEMING_COMMENT)
  })

  it('$extensions["dev.navecss.theming"].seeds.primary.note matches the cleared wording', () => {
    expect(theming.seeds.primary.note).toBe(EXPECTED_SEEDS_PRIMARY_NOTE)
  })

  it('$extensions["dev.navecss.theming"].seeds.danger.note matches the cleared wording', () => {
    expect(theming.seeds.danger.note).toBe(EXPECTED_SEEDS_DANGER_NOTE)
  })

  it('$extensions["dev.navecss.theming"].achromaticBranch matches the cleared wording', () => {
    expect(theming.achromaticBranch).toBe(EXPECTED_ACHROMATIC_BRANCH)
  })

  it('$extensions["dev.navecss.theming"].adjacency.comment matches the cleared wording (accessibility-relevant: states what the contrast-pair coverage list covers)', () => {
    expect(theming.adjacency.comment).toBe(EXPECTED_ADJACENCY_COMMENT)
  })
})
