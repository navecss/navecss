/**
 * The validator (R13, R17-R18): renders `validate`'s human-readable output and the R13
 * manifest-format refusal it short-circuits on. Split out of `validate.ts`
 * to keep that file scoped to COMPUTING the name set; this file is scoped to RENDERING it.
 */

import type { CoreContractManifest, ManifestVersionSkew } from './theming/core-contract.ts'

import { MANIFEST_FORMAT_VERSION } from './theming/core-contract.ts'

/**
 * R13: the refusal `MANIFEST_FORMAT_VERSION` exists for. A manifest whose `formatVersion`
 * is HIGHER than the one this build understands was written by a newer `@navecss/tokens`
 * and may carry a shape this code would mis-read, so it is refused by name rather than
 * parsed optimistically. Lower or equal is not a refusal: an older format is one this
 * build's own schema still describes.
 *
 * Returns `undefined` when the format is understood, or the two-sided record when it is
 * not — never throws, mirroring `checkManifestVersionSkew` (R14).
 */
export interface ManifestFormatRefusal {
  found: number
  supported: number
}

/**
 * `undefined` when this build understands the manifest's format, or the two-sided record
 * naming the found and the supported format when it does not (R13's refusal).
 */
export function checkManifestFormatSupport(
  manifest: CoreContractManifest,
): ManifestFormatRefusal | undefined {
  if (manifest.formatVersion <= MANIFEST_FORMAT_VERSION) return undefined
  return { found: manifest.formatVersion, supported: MANIFEST_FORMAT_VERSION }
}

/**
 * The three-way answer to "what happened trying to resolve the
 * installed `@navecss/core`'s version" that `formatValidateReport` renders. Kept in this
 * module (rather than importing `facade.ts`'s richer `CoreVersionProbe`, which also carries
 * the resolved version this function never needs) so this module never imports from
 * `facade.ts` — `facade.ts` already imports from here, and reversing that would be a
 * circular import.
 */
export type CoreVersionReportStatus =
  | { status: 'resolved' }
  | { status: 'not-installed' }
  | { status: 'unresolvable' }
  | { message: string; status: 'unreadable' }

/**
 * R17 clause 2: the mapping between the emitted custom-property spelling and the DTCG
 * source-node spelling, stated ONCE in a preamble rather than printed per row.
 */
const NAMESPACE_PREAMBLE =
  'Contract names below are the emitted CSS custom-property spelling (for example ' +
  '--nave-color-surface-base). Your DTCG 2025.10 source names the same node with the "--nave-" ' +
  'prefix dropped and hyphens read as a dotted path (color.surface.base).'

// One rendering for both callers: `validate`'s refusal and `build`'s advisory each compose
// their own sentence around this fact rather than stating it twice, differently worded.
/**
 * Describes a version mismatch in words: the core contract this package ships was recorded
 * against one `@navecss/core` version, and a different one is installed. This is the same
 * description `navecss-tokens build` and `navecss-tokens validate` print.
 *
 * Pass it the `versionSkew` field of a `build()` result: that field's `producerName` first,
 * then the field itself (only `recorded` and `installed` are read). What comes back is a
 * clause rather than a finished message, with no label and no final full stop, so it can sit
 * inside a message of your own.
 *
 * The wording is for people to read and may change in any release. To decide what to do,
 * read the `versionSkew` field itself; never match on this text.
 */
export function formatVersionSkewFact(
  producerName: string,
  versionSkew: ManifestVersionSkew,
): string {
  return (
    `the core contract this @navecss/tokens ships was recorded against ` +
    `${producerName}@${versionSkew.recorded}, but the installed ${producerName} is ` +
    `@${versionSkew.installed}`
  )
}

/**
 * R17 clause 4 / R18: the check's scope, stated in every outcome — one-directional (an
 * extra token in the source is never an error) — and never a claim about the palette.
 */
const SCOPE_STATEMENT =
  'This check is one-directional: it reports every core contract name missing from your ' +
  'source. A token in your source beyond the contract is never an error.'

/**
 * The disclaimer R14's precision 1 requires in state 1, held in ONE place so the success line
 * and the failure line cannot drift apart (R17 property 3's second
 * precision, fence (a): the sentence is TRANSCRIBED, not re-worded).
 */
const NO_INSTALLED_CORE_DISCLAIMER =
  'No installed @navecss/core was found, so no version-skew check ran.'

/**
 * The manifest's producer, named as a bare version.
 */
function producerOf(manifest: CoreContractManifest): string {
  return `${manifest.producer.name}@${manifest.producer.version} (manifest format ${manifest.formatVersion})`
}

/**
 * The same producer, named AS RECORDED — the hedge R14's precision 1 requires wherever no
 * comparison happened, shared for the same reason the disclaimer above is.
 */
function recordedProducerOf(manifest: CoreContractManifest): string {
  return `the manifest's own recorded ${producerOf(manifest)}`
}

/**
 * R17 clause 3 (provenance on SUCCESS too) / R18: the subject is the NAME SET ("0 missing",
 * "N checked"), never the palette — "0 missing" alone with no provenance is unfalsifiable to
 * exactly the reader R1 places this check for. When no installed
 * `@navecss/core` exists to compare against, states the manifest's own RECORDED producer as
 * recorded, never as a claim that a comparison happened.
 *
 * R17's dated precision: the printed count is the size of
 * the set that COULD have produced a failure at this invocation — the contract minus every
 * name reclassified SUPPLIED — never the contract's own size, which over-states what was
 * actually checked once a name can opt out of the failable set as SUPPLIED. Where that checkable
 * set is EMPTY, the line says so in terms rather than printing a number that reads as a check
 * that passed. A `.css` source always has an empty `supplied` set (`splitMissingBySupply`), so
 * this reduces to the earlier behaviour there unchanged. A later product-review follow-up: the
 * empty-case sentence also carries the SUPPLIED premise in the same sentence (mirroring
 * `formatSuppliedLines`'s own parenthetical), because the reader who reaches this exact line
 * without using `navecss-tokens build` gets the wrong impression from the naming alone —
 * `AC-token-build-17`'s SUPPLIED/MISSING clause requires the premise to travel with the claim.
 */
function formatSuccessLine(
  manifest: CoreContractManifest,
  coreStatus: CoreVersionReportStatus,
  suppliedCount: number,
): string {
  const checkable = manifest.tokens.length - suppliedCount
  const provenance = producerOf(manifest)
  if (coreStatus.status === 'not-installed') {
    const scope =
      checkable === 0
        ? `every contract name is supplied by \`navecss-tokens build\`'s theming layer from ` +
          `your seed, so none could have been checked as missing (true only if you build ` +
          `with that tool)`
        : `${checkable} name(s) checked`
    return `0 missing against ${recordedProducerOf(manifest)}, ${scope}. ${NO_INSTALLED_CORE_DISCLAIMER}`
  }
  if (checkable === 0) {
    return (
      `Every contract name is supplied by \`navecss-tokens build\`'s theming layer from your ` +
      `seed, so none could have been checked as missing (true only if you build with that ` +
      `tool). Manifest from ${provenance}.`
    )
  }
  return `0 missing. Checked ${checkable} name(s) from ${provenance}.`
}

/**
 * The missing-name-set half of the report: the success line, or the count plus every missing
 * name plus provenance. Split out of `formatValidateReport` to keep that function's own
 * complexity within this file's lint budget.
 *
 * A later quality-review pass, product-reviewed 2026-09-14 (R17 property 3's SECOND dated
 * precision): R14's precision 1 constrains the PROVENANCE SENTENCE, and that constraint
 * binds EVERY outcome of the run rather than the one branch beside which it was measured —
 * property 3 has read "on SUCCESS as well as on failure" since the day it was written. This
 * line used to print a bare `Checked against @navecss/core@0.1.0 (manifest format 1).` on a
 * machine with no `@navecss/core` at all: the stronger claim of the two, in the ACTIVE VOICE,
 * beside a list its reader is about to ACT on by authoring the named tokens. In R14's state 1
 * it now states the recorded producer AS RECORDED and carries the success line's own
 * disclaimer, transcribed rather than re-worded (both come from the shared constants above,
 * so one fact cannot acquire two voices here). States 2 and 3 never reach this function —
 * each returns a single named refusal INSTEAD of a name-set answer — and the `resolved` state
 * is unaffected because a comparison did happen. No exit code moves: this stays `1`.
 */
function formatMissingLines(
  manifest: CoreContractManifest,
  missing: readonly string[],
  coreStatus: CoreVersionReportStatus,
  suppliedCount: number,
): string[] {
  if (missing.length === 0) return [formatSuccessLine(manifest, coreStatus, suppliedCount)]
  const provenance =
    coreStatus.status === 'not-installed'
      ? `Checked against ${recordedProducerOf(manifest)}. ${NO_INSTALLED_CORE_DISCLAIMER}`
      : `Checked against ${producerOf(manifest)}.`
  return [`${missing.length} missing name(s):`, ...missing.map((name) => `  ${name}`), provenance]
}

/**
 * The SUPPLIED half of the report — named and premised (R17 clause 4's
 * scope property applied to a second class), so a reader who does not build with
 * `navecss-tokens build` can reject the premise rather than trust an unconditioned claim.
 */
function formatSuppliedLines(supplied: readonly string[]): string[] {
  if (supplied.length === 0) return []
  return [
    `${supplied.length} more name(s) are not in your source but are emitted by ` +
      `\`navecss-tokens build\`'s theming layer from your seed, so they are not counted as ` +
      `missing above (true only if you build with that tool):`,
    ...supplied.map((name) => `  ${name}`),
  ]
}

/**
 * R17/R18: renders the validator's human-readable output. Short-circuits, in order, each
 * producing a named refusal INSTEAD of a name-set answer rather than alongside one.
 *
 * 1. R13's unrecognized manifest FORMAT: this build cannot claim to have read a manifest
 *    shape it does not know, so no `N missing` figure it computed from one is trustworthy.
 *    It is checked first because it governs whether the rest of the manifest (including the
 *    `producer` field the skew check reads) means what this code thinks it means. This is
 *    computed here rather than passed in, so a caller cannot omit it.
 * 2. The installed `@navecss/core`'s version could not be determined at
 *    all via R14's mandated route (present but `unresolvable`) or its `package.json` could
 *    not be read (`unreadable`) — reporting a name-set answer, or a version-skew comparison,
 *    while silently unable to have run the check either implies would be worse than no
 *    answer, and it is exactly the shape that made "0 missing" name a version nobody had
 *    compared against.
 * 3. `versionSkew` (R14): reporting a name-set answer against a manifest that may not even
 *    belong to the installed core would be worse than no answer.
 *
 * R18 holds throughout: each refusal's grammatical subject is the MANIFEST or the INSTALLED
 * PACKAGE, never the consumer's palette, theme or token source, which none of them read.
 *
 * `coreVersionStatus`, when omitted, is treated as `{ status: 'resolved' }` — "core
 * resolution raised no complication" — which reproduces this function's earlier behaviour
 * byte for byte, so every pre-existing 3-argument call site (this module's own R13/R17/R18
 * tests, which are about neither R14 nor core-version resolution) is unaffected.
 * `coreVersionStatus.supplied` (optional, defaulting to none) rides the SAME 4th parameter
 * rather than a 5th, so this stays within this file's own 4-parameter budget; every
 * pre-existing call site that never named it is unaffected because the field is optional on
 * every status variant.
 */
export function formatValidateReport(
  manifest: CoreContractManifest,
  missing: readonly string[],
  versionSkew: ManifestVersionSkew | undefined,
  coreVersionStatus?: CoreVersionReportStatus & { supplied?: readonly string[] },
): string[] {
  const coreStatus: CoreVersionReportStatus = coreVersionStatus ?? { status: 'resolved' }
  const supplied = coreVersionStatus?.supplied ?? []
  const formatRefusal = checkManifestFormatSupport(manifest)
  if (formatRefusal) {
    return [
      `Unrecognized manifest format: this manifest declares format ` +
        `${formatRefusal.found}, and this @navecss/tokens understands manifest format ` +
        `${formatRefusal.supported} at most. Upgrade @navecss/tokens to read this manifest.`,
    ]
  }

  if (coreStatus.status === 'unreadable') {
    return [
      `Could not read the installed @navecss/core's package.json to check for version ` +
        `skew (${coreStatus.message}). Reinstall @navecss/core and try again.`,
    ]
  }

  if (coreStatus.status === 'unresolvable') {
    return [
      `Could not determine the installed @navecss/core's version: this @navecss/tokens ` +
        `checks it via @navecss/core's own "./package.json" export, which the installed ` +
        `@navecss/core does not declare. Upgrade @navecss/core, or reinstall matching ` +
        `versions, before trusting a validate result.`,
    ]
  }

  if (versionSkew) {
    return [
      `Version skew: ${formatVersionSkewFact(manifest.producer.name, versionSkew)}. Reinstall ` +
        `matching versions before trusting this result.`,
    ]
  }

  return [
    NAMESPACE_PREAMBLE,
    ...formatMissingLines(manifest, missing, coreStatus, supplied.length),
    ...formatSuppliedLines(supplied),
    SCOPE_STATEMENT,
  ]
}
