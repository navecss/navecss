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

const QUOTE_CHARS = new Set(['"', "'", '`'])

/**
 * Scan step while INSIDE a quoted string (split out for `stripComments`'s complexity budget):
 * honours a backslash escape (`\'` does not close early), closes on the matching quote.
 */
function stepInsideQuote(
  content: string,
  index: number,
  quote: string,
): { index: number; out: string; quote: string | undefined } {
  const ch = content[index]!
  if (ch === '\\' && index + 1 < content.length) {
    return { index: index + 2, out: ch + content[index + 1], quote }
  }
  return { index: index + 1, out: ch, quote: ch === quote ? undefined : quote }
}

/**
 * Scan step while OUTSIDE any quote: opens one, skips a block comment to its close (or EOF),
 * skips a `//` comment to its newline unless preceded by `:` (a URL's `://`), or copies through.
 */
function stepOutsideQuote(
  content: string,
  index: number,
): { index: number; out: string; quote: string | undefined } {
  const ch = content[index]!
  if (QUOTE_CHARS.has(ch)) return { index: index + 1, out: ch, quote: ch }
  if (ch === '/' && content[index + 1] === '*') {
    const end = content.indexOf('*/', index + 2)
    return { index: end === -1 ? content.length : end + 2, out: '', quote: undefined }
  }
  if (ch === '/' && content[index + 1] === '/' && content[index - 1] !== ':') {
    const end = content.indexOf('\n', index)
    return { index: end === -1 ? content.length : end, out: '', quote: undefined }
  }
  return { index: index + 1, out: ch, quote: undefined }
}

/**
 * Strips both CSS/TS comment forms from `content` before matching. A block-comment-only regex
 * is right for CSS, which has no line-comment syntax, but the widened scan now walks every
 * `.ts` file, where `//` is the dominant form, and a block-comment-only stripper leaves every
 * `//` comment unstripped — a dead `var(--nave-*)` example after `//` in a `.ts` file would be
 * silently recorded as live.
 *
 * A naive `//`-to-EOL strip is wrong two ways, which is why this is a scanner and not a second
 * regex: CSS's `url(https://…)` contains `//` that is not a comment (would drop a same-line
 * reference), and a TS string/template literal may contain `//` with no comment meaning at all
 * (where `atoms.ts` emits CSS text FROM). A false negative here is worse than the false
 * positive it replaces, so this tracks quote state and refuses to open a comment inside a
 * string, or a `//` preceded by `:`. Not attempted: CSS's own string-escape grammar.
 * Unreachable from real source today; `check-core-contract-drift.mjs`'s CI comparison would
 * surface it if that changes.
 *
 * SHARED with `assertContractPreconditions`'s audit below, unlike `NAVE_VAR_PATTERN`/
 * `CONTRACT_AUDIT_PATTERN` (see that doc for why): stripping carries no matching judgement, so
 * a defect here is equally visible both sides, never a one-sided narrowing.
 */
function stripComments(content: string): string {
  let out = ''
  let quote: string | undefined
  let i = 0
  while (i < content.length) {
    const step = quote ? stepInsideQuote(content, i, quote) : stepOutsideQuote(content, i)
    out += step.out
    i = step.index
    quote = step.quote
  }
  return out
}

/**
 * The R31 guard's OWN audit pattern (raised by a quality reviewer during an early review
 * round). Deliberately DUPLICATES `NAVE_VAR_PATTERN` above rather than sharing it: a guard
 * that derives its EXPECTED set from the same pattern as the subject it guards measures
 * wiring, never content — sharing made `assertContractPreconditions`'s limb (b) structurally
 * incapable of firing (narrowing `NAVE_VAR_PATTERN` to the pre-#219 colour-only form produced
 * the old manifest with no throw at all, the exact regression the guard is named for). If the
 * scan's pattern is ever narrowed, this must NOT be narrowed with it. `stripComments` above IS
 * shared between the scan and this guard's own audit; see its own doc for why that differs
 * from the pattern above.
 */
const CONTRACT_AUDIT_PATTERN = /var\((--nave-[a-z0-9-]+)/g

/**
 * Scans a set of CSS/TS source file contents for `var(--nave-*)` usage and returns the
 * sorted, de-duplicated list of referenced custom property names — the required core
 * contract (`G1 R27`/R12). Both block comments and `//` line comments are stripped first, so
 * a reference that appears only inside a doc-comment example counts for nothing.
 */
export function scanCoreContract(fileContents: readonly string[]): string[] {
  const found = new Set<string>()
  for (const content of fileContents) {
    const stripped = stripComments(content)
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
  const stripped = stripComments(rawSourceText)
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
