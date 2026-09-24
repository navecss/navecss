/**
 * `G1 R27`/R12 (widened, by a settled decision, from the colour-only subset): the
 * required core token contract is DERIVED, not hand-written — scans `var(--nave-*)` usage
 * across `@navecss/core`'s real source (every custom property core references at run time,
 * not only the colour namespace) and emits the contract as a generated list. R28: the
 * contract additionally ships as a machine-readable manifest.
 *
 * A reference inside a comment declares nothing (the same principle `validate.ts`'s
 * `scanDeclaredCustomProperties` already applies to a consumer's CSS): block comments are
 * stripped before matching, which is what keeps `postcss.ts`'s doc-comment example — a
 * `var(--nave-...)` string inside a JSDoc block, never executed — out of the scan without a
 * per-file exclusion. It joins the scanned set the day it carries a real (non-comment)
 * reference — a stated rule, not an incidental side effect of how the scan is implemented.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const NAVE_VAR_PATTERN = /var\((--nave-[a-z0-9-]+)/g
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g

/**
 * The R31 guard's OWN audit pattern and comment stripper (raised by a quality reviewer during
 * an early review round). These deliberately DUPLICATE `NAVE_VAR_PATTERN` and `BLOCK_COMMENT_RE`
 * above rather than sharing them, and the duplication is the mechanism, not an oversight: a guard
 * that derives its EXPECTED set from the same pattern as the subject it guards measures wiring and
 * never content. Sharing made `assertContractPreconditions`'s limb (b) structurally incapable of
 * firing — `referenced` was a subset of `scanned` by construction for every possible input, so
 * narrowing `NAVE_VAR_PATTERN` back to the pre-#219 colour-only form produced the old 6-token
 * manifest with no throw at all, which is the exact regression the guard is named for. The audit
 * pattern is the INDEPENDENT statement of what a `--nave-*` reference is; the scan pattern is the
 * subject under audit. If the scan's pattern is ever narrowed, these must NOT be narrowed with it —
 * that divergence is the signal.
 */
const CONTRACT_AUDIT_PATTERN = /var\((--nave-[a-z0-9-]+)/g
const CONTRACT_AUDIT_BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g

/**
 * Scans a set of CSS/TS source file contents for `var(--nave-*)` usage and returns the
 * sorted, de-duplicated list of referenced custom property names — the required core
 * contract (`G1 R27`/R12). Block comments are stripped first, so a reference that appears
 * only inside a doc-comment example counts for nothing.
 */
export function scanCoreContract(fileContents: readonly string[]): string[] {
  const found = new Set<string>()
  for (const content of fileContents) {
    const stripped = content.replaceAll(BLOCK_COMMENT_RE, '')
    for (const match of stripped.matchAll(NAVE_VAR_PATTERN)) {
      found.add(match[1]!)
    }
  }
  return [...found].toSorted((a, b) => a.localeCompare(b))
}

/**
 * Reads and scans real files from disk (used by the build script and by CI's drift check).
 */
export function scanCoreContractFromDisk(paths: readonly string[]): string[] {
  return scanCoreContract(paths.map((p) => readFileSync(p, 'utf8')))
}

/**
 * The scanned file set is a RULE, not a hardcoded list — every file of the
 * given extensions under `dir`, discovered recursively, so a package that grows a new file
 * joins the scan automatically rather than going stale the way a fixed two-file array does.
 * Sorted so the scan (and any manifest derived from it) stays deterministic (R7/R13).
 */
export function discoverSourceFiles(
  dir: string,
  extensions: readonly string[] = ['.ts', '.css'],
): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * R13 [blocking]: the manifest-format version this file's own schema is at. A validator
 * meeting a future shape (a manifest with a higher `formatVersion`) refuses it rather than
 * mis-reading it — this is the project's principal engineer's
 * 2026-08-11 note ("version the
 * manifest format inside the manifest") implemented.
 */
export const MANIFEST_FORMAT_VERSION = 1

export interface ManifestProducer {
  /**
  The package whose real run-time custom-property dependency this contract was scanned from
  (`@navecss/core`), not the package that ships the manifest (`@navecss/tokens`).
   */
  name: string
  version: string
}

export interface CoreContractManifest {
  formatVersion: number
  producer: ManifestProducer
  tokens: readonly string[]
}

/**
 * R28: the machine-readable manifest a consumer's validator consumes directly,
 * rather than re-deriving its own copy of the contract. R13: no wall-clock timestamp
 * (`generatedAt` is gone — it was the package's only source of build-time nondeterminism),
 * a `formatVersion` integer, and the producing package's (core's) name and version so a
 * validator can detect version skew (R14) without re-deriving it.
 */
export function buildManifest(
  tokens: readonly string[],
  producer: ManifestProducer,
): CoreContractManifest {
  return {
    formatVersion: MANIFEST_FORMAT_VERSION,
    producer,
    tokens: [...tokens].toSorted((a, b) => a.localeCompare(b)),
  }
}

export interface ManifestVersionSkew {
  recorded: string
  installed: string
}

/**
 * R14: the version-skew check. The `fixed` Changesets group is a promise about what Nave
 * PUBLISHES, not about what a consumer INSTALLS, so a consumer's `node_modules` can hold a
 * `@navecss/tokens` whose shipped manifest was scanned from a different `@navecss/core`
 * version than the one actually installed alongside it. Returns `undefined` when the
 * versions agree, or the two-sided record when they do not — never throws, so the caller
 * (the façade's `validate`) controls how the named error is presented.
 */
export function checkManifestVersionSkew(
  manifest: CoreContractManifest,
  installedCoreVersion: string,
): ManifestVersionSkew | undefined {
  if (manifest.producer.version === installedCoreVersion) return undefined
  return { recorded: manifest.producer.version, installed: installedCoreVersion }
}

/**
 * Validates a token source's emitted slot names against the manifest, returning the
 * missing contract tokens (empty if satisfied). This is the consumer build's validator's core
 * check: ONE-DIRECTIONAL by design, because a consumer's build carrying an EXTRA colour token
 * beyond what core requires is not an error for that validator — only a required token
 * being absent is.
 */
export function validateAgainstManifest(
  manifest: CoreContractManifest,
  emittedNames: ReadonlySet<string>,
): string[] {
  return manifest.tokens.filter((name) => !emittedNames.has(name))
}

/**
 * R31: refused when the manifest-generation build step's own preconditions do not hold —
 * see `assertContractPreconditions`. Named for the FAILURE MODE (a stale precondition), not
 * for either simulated shape, since the check is one function guarding two facts.
 */
export class StaleContractPreconditionError extends Error {
  constructor(reason: string) {
    super(`Manifest generation refused: ${reason}`)
    this.name = 'StaleContractPreconditionError'
  }
}

/**
 * R31/AC-token-build-31: the manifest-generation build step's own preconditions, checkable
 * against a simulated scanned source independent of whether the `--nave-*` prefix rename or
 * the contract-widening have themselves landed by the time this runs — "the rename lands,
 * then the widening, then manifest generation" as a PROPERTY of the generation step rather
 * than a fact about which change lands first.
 *
 * Two checks, two fixtures: (a) the pre-#204 shape — a name about to be recorded that is
 * not yet prefixed `--nave-`; (b) the pre-#219 shape — a scanned set narrower than the raw
 * source's own `--nave-*` usage (an old, colour-only-scoped pattern run against a source
 * that also references a non-colour `--nave-*` property). Either throws rather than the
 * generation step silently writing a stale manifest.
 *
 * WHAT THIS REACHES, AND WHAT IT DOES NOT (raised by a quality reviewer during an early
 * review round).
 * Limb (b) reaches the PATTERN the scan matches with, and only because it re-derives its
 * expected set with `CONTRACT_AUDIT_PATTERN`, an independent statement of what a `--nave-*`
 * reference is — see that constant's own doc for why sharing the scan's pattern made this
 * limb incapable of firing for any input. It does NOT reach the scanned FILE SET: `names`
 * and `rawSourceText` are both derived from the same discovered file list
 * (`core-source.ts`), so narrowing which files are walked narrows both sides at once and
 * this guard stays silent. `scripts/check-core-contract-drift.mjs` (a fresh scan against the
 * recorded contract) is what covers that direction; this function is not a substitute for it.
 */
export function assertContractPreconditions(names: readonly string[], rawSourceText: string): void {
  const unprefixed = names.filter((name) => !name.startsWith('--nave-'))
  if (unprefixed.length > 0) {
    throw new StaleContractPreconditionError(
      `these scanned names are not yet prefixed --nave-: ${unprefixed.join(', ')}`,
    )
  }

  // The guard's own pattern, NOT the scan's — see `CONTRACT_AUDIT_PATTERN`'s doc.
  const stripped = rawSourceText.replaceAll(CONTRACT_AUDIT_BLOCK_COMMENT_RE, '')
  const referenced = new Set(stripped.matchAll(CONTRACT_AUDIT_PATTERN).map((match) => match[1]!))
  const scanned = new Set(names)
  const unscanned = referenced.difference(scanned)
  if (unscanned.size > 0) {
    const sorted = [...unscanned].toSorted((a, b) => a.localeCompare(b)).join(', ')
    throw new StaleContractPreconditionError(
      `referenced in source but missing from the scanned contract, narrower than core's real ` +
        `run-time dependency: ${sorted}`,
    )
  }
}

export interface ContractDrift {
  // In the recorded contract, no longer scanned from core's real usage (removed).
  missing: string[]
  // Scanned from core's real usage, not yet in the recorded contract (added).
  added: string[]
}

/**
 * R27's OWN drift check: symmetric, both directions. Distinct from
 * `validateAgainstManifest` above (R28's one-directional consumer-facing check). This one
 * is Nave's own CI comparing a fresh scan of core's real source against the RECORDED
 * contract it is supposed to match, where either an addition or a removal is drift the
 * recorded contract must be regenerated to absorb — "added to or removed from core's real
 * usage... fails and reports the difference" is symmetric by its own wording.
 */
export function diffContract(
  recorded: readonly string[],
  emitted: ReadonlySet<string>,
): ContractDrift {
  const recordedSet = new Set(recorded)
  return {
    missing: recorded.filter((name) => !emitted.has(name)),
    added: [...emitted]
      .filter((name) => !recordedSet.has(name))
      .toSorted((a, b) => a.localeCompare(b)),
  }
}
