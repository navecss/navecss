/**
 * R28 and R30 (the token-build specification), and the shared instrument they both need.
 *
 * R30, paraphrased rather than quoted because the spec's own sentence names an internal
 * reviewer: every artifact this entry point emits onto a consumer's disk is FIRST-PARTY TEXT,
 * and any third-party-derived emitted text returns to the project's licensing steward before
 * publication. R30 records that this is the predicate the item CREATES and the one with no
 * instrument, and that what must not happen is that it rides as prose, since prose is exactly
 * what the other two licensing predicates have instruments instead of. This module is that
 * instrument.
 *
 * R28: `packages/tokens/test/no-inlined-dependency.test.ts` asserts a GENERATOR-shaped
 * property (R6's artifact set carries no third-party-traceable text) rather than a
 * bundler-shaped one; it shares this module's scan rather than duplicating it.
 *
 * Two mechanical checks, both deliberately NON-EXHAUSTIVE and stated as such rather than
 * claimed as a general third-party-text detector (there is no such thing): they guard the ONE
 * concretely-known historical risk for this package plus a header-attribution property every
 * generated CSS/JS artifact in R6's set already carries, not an unbounded space of possible
 * future third-party text.
 */

/**
 * R6's consumer-facing artifact set, fixed and enumerated by the token-build specification's R6,
 * which excludes `core-contract.json` and `contact-sheet.html` there by name. One home, so the
 * two fence tests cannot drift apart from each other.
 *
 * `core-contract.json` still ships in the published tarball (`exports['./core-contract']`) and
 * is scanned by nothing in this module — deliberate scope (the project's licensing steward's
 * completeness property is over R6's set BY NAME), not an oversight, recorded so the absence
 * does not later read as a clearance. R8 grows the tarball's unscanned remainder further
 * (compiled library JS outside this set); widening the scan past R6 is a licensing-scope call
 * for the project's licensing steward to make, not this module's.
 */
export const R6_CONSUMER_ARTIFACTS = [
  'tokens.css',
  'tokens.js',
  'tokens.d.ts',
  'breakpoints.js',
  'breakpoints.d.ts',
  'palette-record.json',
  'build-record.json',
] as const

export interface ProvenanceArtifact {
  path: string
  content: string
}

/**
 * The one concretely-known historical residue for this package: the prior third-party
 * dictionary-based token-build tool this package vendored, removed entirely on 2026-08-21
 * in favour of the first-party DTCG reader — named in full there rather
 * than here, since this module IS the residue scanner and spelling the two words out adjacently
 * would match its own pattern below the day this docblock ships as compiled `dist/` JS (R8) or
 * the scan widens from R6's set to `dist/**` (a licensing-scope call for the project's
 * licensing steward to make). A regression here
 * — the name reappearing in a generated-file header, a comment, or a copied banner — is exactly
 * the class of silent third-party reintroduction R30 exists to catch.
 */
const RESIDUE_FRAGMENTS: readonly (readonly string[])[] = [
  ['style', '[- ]?', 'dictionar', 'y'],
  ['terra', 'zzo'],
  ['tokens', '[- ]', 'studio'],
  ['fig', 'ma'],
  ['cul', 'ori'],
  ['color', String.raw`js\.io`],
]

/**
 * The residue patterns, one per third-party product name no shipped byte of this package may
 * carry. Widened from the single historical literal on the measured ground that a refusal
 * message, a README sentence or a `$description` naming a DIFFERENT tool would have passed the
 * one-literal check while failing the rule it stands for.
 *
 * **Every pattern is COMPOSED FROM FRAGMENTS and never spelled out in one piece**, because the
 * regex source itself compiles into `dist/lib` and the scan now walks all of `dist/`: a
 * literal here would match its own compiled source and red the corrected state, which is the
 * failure shape where a check is aimed at its own remedy. Splitting the literal costs one
 * array and removes the need for an exemption naming this file.
 *
 * Measured before widening, so none of these reds a byte that legitimately exists: at the sha
 * this landed on, `dist/` carried none of the six, the one `Figma` occurrence in the tree is
 * positioning copy in the REPOSITORY-root README (a surface this rule does not reach, and not
 * a byte of this package), and the one colour-library mention is a docblock in `color-math.ts`
 * that `removeComments` strips before it can ship.
 */
export const THIRD_PARTY_RESIDUE_PATTERNS: readonly RegExp[] = RESIDUE_FRAGMENTS.map(
  (fragments) => new RegExp(fragments.join(''), 'i'),
)

/**
 * Every generated CSS/JS artifact in R6's set carries a leading `/* ... *\/` or `/** ... *\/`
 * header naming its generator. This pattern is deliberately an ALLOW-list (attributes to Nave)
 * rather than a deny-list (names third parties) for the header specifically, because a
 * deny-list over generator names cannot enumerate every tool that was never used; an allow-list
 * over what Nave's own generator actually writes is the checkable, non-speculative form.
 *
 * Anchored, no nested or ambiguous quantifier, tested against artifacts this package generates
 * itself, never consumer input. Structurally safe and not consumer-reachable; accepted.
 */
const NAVE_ATTRIBUTION_PATTERN = /^\/\*\*?\s*\n?\s*\*?\s*Nave (Design System|breakpoints)\b/

/**
 * Returns the paths of every artifact whose content names a third-party product. Empty means
 * clean; non-empty is the violation list (R28's generator half, R30's provenance half).
 */
export function findThirdPartyResidue(artifacts: readonly ProvenanceArtifact[]): string[] {
  return artifacts
    .filter((artifact) =>
      THIRD_PARTY_RESIDUE_PATTERNS.some((pattern) => pattern.test(artifact.content)),
    )
    .map((artifact) => artifact.path)
}

/**
 * Returns the paths of every CSS/JS/`.d.ts` artifact whose leading generated-file header does
 * NOT attribute generation to Nave alone — either no recognizable header at all, or one naming
 * something else. Callers pass only header-bearing artifacts (`.css`, `.js` and `.d.ts`; never
 * `.json`, which carries no comment syntax this package emits into today).
 */
export function findUnattributedHeader(artifacts: readonly ProvenanceArtifact[]): string[] {
  return artifacts
    .filter((artifact) => !NAVE_ATTRIBUTION_PATTERN.test(artifact.content))
    .map((artifact) => artifact.path)
}

/**
 * R30's routing obligation, recorded as a checkable fact rather than left in the spec's prose
 * alone. Three shapes named AS EXAMPLES, never as an enumeration (R30's own text: "a
 * prohibition written as a list defaults to permitted"). This constant asserts the obligation
 * EXISTS; it clears no instance and is not the licensing steward's cleared text (unlike R27's, this
 * is engineering policy prose, not a safety-critical conformance claim, and carries no
 * byte-identity requirement).
 */
export const THIRD_PARTY_TEXT_ROUTING_POLICY =
  'Any proposal to vendor a colour-space or DTCG 2025.10 parser to make this entry point ' +
  'self-contained, to reach for a bundler with `noExternal` or a bundled helper, to add a ' +
  'dependency and then inline it so the tarball looks dependency-free, or to emit text ' +
  "taken from a third party into a consumer's committed artifact, is routed through this " +
  "project's own licence review before publication. These are examples, not an " +
  'enumeration: a prohibition written as a list defaults to permitted.'
