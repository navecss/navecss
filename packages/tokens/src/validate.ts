/**
 * The validator (R12, R15, R18): COMPUTES whether a consumer's token source satisfies the
 * shipped core contract manifest, and splits an unsatisfied name into MISSING (the consumer
 * must supply it) versus SUPPLIED (the theming half emits it
 * unconditionally, so it is not missing). `validate-report.ts` (split out for the same reason)
 * RENDERS the result; this module never formats a line of output.
 */

import type { CoreContractManifest } from './theming/core-contract.ts'

import { UsageError } from './errors.ts'
import { readTokens } from './reader.ts'
import { validateAgainstManifest } from './theming/core-contract.ts'
import { shippedThemingPropertyNames } from './theming/emit.ts'

// ---------------------------------------------------------------------------
// R15: source kind detection and per-kind name extraction.
// ---------------------------------------------------------------------------

export type ValidateSourceKind = 'css' | 'json'

/**
 * R15 clause 3: a file whose extension is neither `.css` nor `.json` is a usage error
 * (exit `2`, R4) rather than a guess. Returns `undefined` for that case; the caller decides
 * the exit code, this module does not know about process exit codes.
 */
export function detectSourceKind(filePath: string): ValidateSourceKind | undefined {
  // Case-folded: a file named `Tokens.CSS` is a CSS file on every filesystem this runs on,
  // and reporting it as a usage error would be the guess R15 clause 3 exists to avoid.
  const lowered = filePath.toLowerCase()
  if (lowered.endsWith('.css')) return 'css'
  if (lowered.endsWith('.json')) return 'json'
  return undefined
}

const DECLARED_CUSTOM_PROPERTY_RE = /(--[a-zA-Z0-9-]+)\s*:/g
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g

/**
 * R15 clause 1: the CSS case is the honest subject, because what core needs at run time is
 * DECLARED custom properties and a rung-5 consumer may not use Nave's emitter at all — a
 * plain regex scan of declared property names, no generation step run.
 *
 * Comments are stripped FIRST, because the word above is DECLARED: a name appearing only
 * inside a CSS comment declares nothing, and counting it would let a source that declares
 * none of the contract report `0 missing` with full provenance, which is precisely the
 * unfalsifiable answer R17's provenance clause exists to prevent. This is comment
 * stripping, not a CSS parser: the scan stays a regex scan by R15's own design.
 */
export function scanDeclaredCustomProperties(css: string): Set<string> {
  const found = new Set<string>()
  const declarations = css.replaceAll(CSS_COMMENT_RE, '')
  for (const match of declarations.matchAll(DECLARED_CUSTOM_PROPERTY_RE)) found.add(match[1]!)
  return found
}

/**
 * R15 clause 2: the DTCG `.json` case costs almost nothing — the reader's name computation
 * only (no ramp, no semantics, no CSS generation). A node's computed name carries the
 * `--nave-` prefix exactly as the emitter applies it (R32): an O(1) string transform, not a
 * second generation pass.
 */
export function namesFromDtcgSource(source: unknown, sourceName?: string): Set<string> {
  const tokens = readTokens(source, sourceName)
  return new Set(tokens.map((t) => `--nave-${t.name}`))
}

/**
 * What a refusal calls the source it refused: a FILE the caller can name, or a generic PHRASE
 * standing in for one it cannot. The two print differently and only the caller knows which it
 * holds, so the caller states it and this module decides the spelling — see `namesFromSource`
 * for why that division is where it is.
 */
export type ValidateSourceLabel = { path: string } | { phrase: string }

const DEFAULT_SOURCE_LABEL: ValidateSourceLabel = { phrase: 'this validate source' }

/**
 * A path is DELIMITED, a phrase is not. The delimiters are what make an absolute path with a
 * space in it readable as one token rather than as a sentence that lost its way, which is the
 * harm flagged in quality review — the inconsistency was the symptom.
 */
function printSourceLabel(source: ValidateSourceLabel): string {
  return 'path' in source ? `"${source.path}"` : source.phrase
}

/**
 * Dispatches on `kind` without guessing (R15). The caller has already resolved `kind` via
 * `detectSourceKind` or its own equivalent; this never falls through silently.
 *
 * A malformed-JSON `.json` source used to leak a raw `SyntaxError`
 * with no file name and at the WRONG exit code (`bin.ts`'s catch-all maps an unrecognised
 * error to `1`, "failed on its merits", when `--overrides`'s own sibling — the same failure,
 * one flag over — is correctly a `UsageError` at exit `2`). The third parameter names the
 * source in the resulting message; it defaults to a generic phrase so every existing caller of
 * this function is unaffected.
 *
 * Per Cédric's GATE-2 decision, that parameter was a `string`
 * whose contract read "a label already in its final printed form", and a contract a `string`
 * cannot carry is a contract held by its callers. It was held by two of them and not by the
 * third: `facade.ts` quoted the path itself at both of its call sites, `validate`'s door
 * passed it bare, and one guard function printed two spellings of its own file label
 * (the same inconsistency flagged in quality review). The caller now says which of the two things
 * it has — a `path` or a `phrase` — and the DELIMITING DECISION IS MADE HERE, once, by the code
 * that knows which it was given.
 *
 * It is a discriminated pair rather than "quote it always" because a developer-experience
 * reviewer measured why the outlier existed: the default is a generic PHRASE, not a path, and
 * quoting it would print `"this validate source" is not valid JSON`, reading as a file named that.
 *
 * A later quality-review pass (R15's dated precision, product review 2026-09-14) found that
 * the JSON-parse-error wrapper above stopped ONE CALL SHORT. A file that parses as JSON but whose
 * ROOT is not a JSON object went to `readTokens` unwrapped, so `[]`, a bare number, a bare string
 * and `null` escaped to `bin.ts`'s catch-all as `DTCG reader: expected an object at "", got []` —
 * exit `1`, the file unnamed — while the SAME file with malformed JSON exits `2` naming it and
 * `--overrides` gives the same input the same `2` one flag over. Extension, parseability and root
 * shape are three answers to one question, and this is the third: **the file you named is not an
 * input of the kind this flag takes**, which is R4's `2` with its gloss exactly as it already
 * reads.
 *
 * **The line is at the ROOT, not at the reader.** A document accepted as a DTCG object and
 * FAULTY INSIDE — a reference cycle, an unresolved reference, an unsupported value type, a
 * legacy `value`/`type` node — is the entry point judging a token source on its merits and
 * stays at `1`, untouched. R4's precision 5 declined remapping `bin.ts`'s CATCH-ALL and that
 * decline stands in full: this guard is here, one call before the catch-all ever sees it.
 */
export function namesFromSource(
  kind: ValidateSourceKind,
  content: string,
  source: ValidateSourceLabel = DEFAULT_SOURCE_LABEL,
): Set<string> {
  if (kind === 'css') return scanDeclaredCustomProperties(content)
  const sourceLabel = printSourceLabel(source)
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    throw new UsageError(`${sourceLabel} is not valid JSON: ${(error as Error).message}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UsageError(
      `${sourceLabel} is not a DTCG 2025.10 token document: its JSON root is ${describeRoot(parsed)}, ` +
        `not an object.`,
    )
  }
  // The refusal a shape defect produces names the FILE, not only the node path: a `--source`
  // consumer may hold several, and only this caller knows which one it just read.
  return namesFromDtcgSource(parsed, 'path' in source ? source.path : undefined)
}

/**
 * Names the root's KIND rather than dumping its value: a `--source` whose root is a 50,000-
 * element array is exactly as much a usage error as `[]`, and its contents are no more use to
 * the reader than its shape is.
 */
function describeRoot(root: unknown): string {
  if (root === null) return 'null'
  if (Array.isArray(root)) return 'an array'
  return `a ${typeof root}`
}

/**
 * R12: the validator's pass/fail set always equals the manifest's FULL token list, whatever
 * it currently is — this is `validateAgainstManifest` (R28) called through the source-kind
 * dispatch, so a validate consumer never re-derives the one-directional membership check.
 */
export function computeMissing(
  manifest: CoreContractManifest,
  kind: ValidateSourceKind,
  content: string,
  source?: ValidateSourceLabel,
): string[] {
  return validateAgainstManifest(manifest, namesFromSource(kind, content, source))
}

/**
 * `computeMissing`'s not-declared set has two opposite fates that used to
 * be presented identically. Splits it into names the consumer must supply themselves (no half
 * of a `navecss-tokens build` run emits them) versus names the theming half emits
 * UNCONDITIONALLY from the seed alone, so `validate` stops instructing a consumer to declare
 * exactly the names that its own `build` command would then refuse.
 *
 * Applies ONLY to a DTCG `.json` source. A `.css` scan (R15) reads what is actually declared
 * in the file, making no assumption about who emitted it or how; simulating the SUPPLIED
 * class onto that scan would be exactly the assumption R15's CSS case exists to avoid, and it
 * is unneeded regardless — a `.css` artifact that genuinely carries both halves already has
 * the name declared, so it was never in `notDeclared` in the first place.
 */
export function splitMissingBySupply(
  kind: ValidateSourceKind,
  notDeclared: readonly string[],
): { missing: string[]; supplied: string[] } {
  if (kind === 'css') return { missing: [...notDeclared], supplied: [] }
  const supplied = shippedThemingPropertyNames()
  return {
    missing: notDeclared.filter((name) => !supplied.has(name)),
    supplied: notDeclared.filter((name) => supplied.has(name)),
  }
}
