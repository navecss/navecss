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

/**
 * The innermost active scanning context, as a stack (innermost last): `code` is top-level
 * source (the base, always present); `interp` is the CODE inside a template literal's
 * `${...}` interpolation, tracking its own unmatched `{` nesting so a nested object or block
 * literal's `}` does not close the interpolation early; `template` is a template literal's
 * literal TEXT, outside any interpolation; `string` is a `'`/`"` string.
 */
type Frame =
  | { kind: 'code' }
  | { depth: number; kind: 'interp' }
  | { kind: 'template' }
  | { kind: 'string'; quote: string }

interface StepResult {
  index: number
  out: string
}

/**
 * True for a character CSS/JS treat as continuing an identifier, used to keep `url(` from
 * matching inside a longer identifier such as `myUrl(`.
 */
function isIdentifierChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$-]/.test(ch)
}

/**
 * Resolves a search result to a step's end index: `content.length` when `found` is `-1` (not
 * present, so the span runs to EOF), otherwise `found + offset` (an `offset` of 2 also
 * consumes a two-character close marker; 0 stops before the marker itself, such as a newline
 * that must still be scanned normally on the next step).
 */
function findSpanEnd(content: string, found: number, offset: number): number {
  return found === -1 ? content.length : found + offset
}

/**
 * Scans an unquoted url-token's body from `start` (just past `url(`), honouring a CSS escape:
 * a `\` whose next character exists and is not a newline consumes both (CSS Syntax Level 3,
 * consume a url token — a valid escape consumes the escaped code point), so an escaped `)`
 * does not end the token. A `\` immediately before a newline is NOT a valid escape and is
 * scanned as an ordinary character, leaving the newline to end the token as usual. Returns the
 * exclusive end index: past an unescaped `)` (included), at an unescaped `'`, `"` or newline
 * (excluded, so normal scanning resumes there), or at EOF.
 */
function findUrlTokenEnd(content: string, start: number): number {
  let end = start
  while (end < content.length) {
    const ch = content[end]!
    if (ch === '\\' && end + 1 < content.length && content[end + 1] !== '\n') {
      end += 2
    } else if (ch === ')') {
      return end + 1
    } else if (['\n', '"', "'"].includes(ch)) {
      return end
    } else {
      end++
    }
  }
  return end
}

/**
 * Detects an unquoted CSS url-token (CSS Syntax Level 3, consume a url token) starting at
 * `index`: `url(` (case-insensitive), not preceded by an identifier character, whose first
 * non-whitespace character is not a quote. Returns the exclusive end index of the verbatim
 * span (see `findUrlTokenEnd`), or `undefined` if this is not an unquoted url-token —
 * including when a quote follows `url(`, which gets ordinary string handling instead.
 */
function matchUrlToken(content: string, index: number): number | undefined {
  if (!/^url\(/i.test(content.slice(index, index + 4))) return undefined
  if (isIdentifierChar(content[index - 1])) return undefined
  let i = index + 4
  while (i < content.length && /\s/.test(content[i]!)) i++
  if (content[i] === "'" || content[i] === '"') return undefined
  return findUrlTokenEnd(content, index + 4)
}

/**
 * Scan step while inside a `'`/`"` string (not a template literal): honours a backslash
 * escape (an escaped quote, or an escaped newline, does not end the string), and ends the
 * string on its matching quote OR on an unescaped newline — ECMAScript forbids a raw line
 * terminator in a string literal, and CSS Syntax ends a string token the same way, as a
 * bad-string — emitting the newline itself and resuming the enclosing context.
 */
function stepInString(content: string, index: number, stack: Frame[]): StepResult {
  const frame = stack.at(-1) as { kind: 'string'; quote: string }
  const ch = content[index]!
  if (ch === '\\' && index + 1 < content.length) {
    return { index: index + 2, out: ch + content[index + 1] }
  }
  if (ch === '\n' || ch === frame.quote) stack.pop()
  return { index: index + 1, out: ch }
}

/**
 * Scan step while inside a template literal's TEXT, outside any `${...}` interpolation: this
 * is literal, so a `//` here is not a comment. Honours a backslash escape (an escaped backtick
 * or `${` does not end the text or open an interpolation), ends the template on its closing
 * backtick, and opens an interpolation frame on `${`.
 */
function stepInTemplateText(content: string, index: number, stack: Frame[]): StepResult {
  const ch = content[index]!
  if (ch === '\\' && index + 1 < content.length) {
    return { index: index + 2, out: ch + content[index + 1] }
  }
  if (ch === '`') {
    stack.pop()
    return { index: index + 1, out: ch }
  }
  if (ch === '$' && content[index + 1] === '{') {
    stack.push({ kind: 'interp', depth: 0 })
    return { index: index + 2, out: '${' }
  }
  return { index: index + 1, out: ch }
}

/**
 * Handles `{`/`}` while in code: while the current frame is a template interpolation, tracks
 * its nesting depth so an inner object or block literal's `}` does not close the interpolation
 * early, and pops back to the enclosing template text on the interpolation's own matching `}`.
 * Any other character (and any `{`/`}` at top-level code, which has nothing to close) is
 * copied through unchanged.
 */
function stepBraceInCode(ch: string, frame: Frame, stack: Frame[]): void {
  if (frame.kind !== 'interp') return
  if (ch === '{') frame.depth++
  else if (ch === '}' && frame.depth === 0) stack.pop()
  else if (ch === '}') frame.depth--
}

/**
 * Opens a new context when `ch` is a quote character: a backtick pushes a template-text
 * frame, a `'`/`"` pushes a string frame. Returns whether one was opened.
 */
function didOpenQuoteOrTemplate(ch: string, stack: Frame[]): boolean {
  if (ch === '`') {
    stack.push({ kind: 'template' })
    return true
  }
  if (ch === "'" || ch === '"') {
    stack.push({ kind: 'string', quote: ch })
    return true
  }
  return false
}

/**
 * Recognises a block comment, a `//` line comment, or an unquoted CSS url-token starting at
 * `index`, and returns the step that skips (or, for a url-token, copies through) it — or
 * `undefined` if none apply, so the caller falls through to ordinary code scanning.
 */
function trySkipCommentOrUrl(content: string, index: number): StepResult | undefined {
  const ch = content[index]!
  if (ch === '/' && content[index + 1] === '*') {
    return { index: findSpanEnd(content, content.indexOf('*/', index + 2), 2), out: '' }
  }
  if (ch === '/' && content[index + 1] === '/') {
    return { index: findSpanEnd(content, content.indexOf('\n', index), 0), out: '' }
  }
  const urlEnd = matchUrlToken(content, index)
  if (urlEnd !== undefined) return { index: urlEnd, out: content.slice(index, urlEnd) }
  return undefined
}

/**
 * Scan step while in code (top-level, or inside a template literal's `${...}` interpolation,
 * which shares its scanning with top-level code): opens a string or a nested template, copies
 * an unquoted CSS url-token through verbatim, skips a block comment or a `//` line comment
 * (unconditionally — no `:`-preceded guard; the url-token check above already accounts for a
 * URL's own `//`), or falls through to brace tracking and a plain copy-through.
 */
function stepInCode(content: string, index: number, stack: Frame[]): StepResult {
  const ch = content[index]!
  if (didOpenQuoteOrTemplate(ch, stack)) return { index: index + 1, out: ch }
  const skipped = trySkipCommentOrUrl(content, index)
  if (skipped) return skipped
  stepBraceInCode(ch, stack.at(-1)!, stack)
  return { index: index + 1, out: ch }
}

/**
 * Advances one scan step from `index`, dispatching on the innermost active context: inside a
 * `'`/`"` string, inside a template literal's literal text, or code (top-level or inside a
 * `${...}` interpolation).
 */
function step(content: string, index: number, stack: Frame[]): StepResult {
  const frame = stack.at(-1)!
  if (frame.kind === 'string') return stepInString(content, index, stack)
  if (frame.kind === 'template') return stepInTemplateText(content, index, stack)
  return stepInCode(content, index, stack)
}

/**
 * Strips both CSS/TS comment forms from `content` before matching. A block-comment-only regex
 * is right for CSS, which has no line-comment syntax, but the widened scan now walks every
 * `.ts` file, where `//` is the dominant form, and a block-comment-only stripper leaves every
 * `//` comment unstripped — a dead `var(--nave-*)` example after `//` in a `.ts` file would be
 * silently recorded as live.
 *
 * A naive `//`-to-EOL strip is wrong several ways, which is why this is a context-stack
 * scanner and not a second regex. A `'`/`"` string or a template literal's TEXT may contain
 * `//` with no comment meaning at all (where `atoms.ts` emits CSS text FROM), so both keep
 * their contents verbatim rather than having a comment opened inside them. A template
 * literal's `${...}` interpolation is CODE, not text: a `//` inside it is a real comment,
 * strings, nested templates, block comments and `//` comments inside it behave exactly as at
 * top level, and `{`/`}` inside it are depth-tracked so a nested object or block literal's own
 * brace does not close the interpolation early. CSS's `url(https://…)` contains a `//` that is
 * not a comment: rather than a one-character guard on what precedes it (which mis-fires both
 * ways — keeping a real comment right after a colon, and losing a real same-line reference
 * after an unquoted protocol-relative `url(//…)`), an unquoted CSS url-token (CSS Syntax Level
 * 3: `url(` not followed by a quote) is recognised directly and copied through verbatim. A
 * `'`/`"` string ends at an unescaped newline — the newline is emitted, not consumed —
 * matching how both ECMAScript (no raw line terminator in a string literal) and CSS Syntax (a
 * bad-string token) bound one; a template literal is NOT newline-bounded, since a real
 * template literal spans lines by design.
 *
 * Not attempted: CSS's own string-escape grammar, and regex literals are not lexed at all —
 * telling a regex from a division needs parser context, so a lexer-only rule would just trade
 * one heuristic for another. Also not attempted, for the same content-only reason: telling CSS
 * source from TypeScript source apart, so an unquoted `//` inside real CSS (lawful only inside
 * a custom property's value) that is not part of a url-token is still read as a comment and
 * strips the rest of its line — CSS has no line-comment syntax of its own, so this is a false
 * negative, unreachable from real source today like the residue below. The residue: a quote
 * character inside a regex literal (`/'/`,
 * `/"/`) can still open a phantom string, now bounded to the rest of its own line by the
 * newline rule above rather than running unbounded to the next real quote anywhere in the
 * file. Within that one line the misread still goes both ways: a real `//` or block comment
 * between the phantom open and the line's end is read as string content and not stripped (a
 * dead reference there wrongly counts as live); a real quote of the same kind later on the
 * same line is read as the phantom's close, desynchronising quote state for the remainder of
 * the line. Unreachable from real source today; `check-core-contract-drift.mjs`'s CI
 * comparison would surface it if that changes.
 *
 * SHARED with `assertContractPreconditions`'s audit below, unlike `NAVE_VAR_PATTERN`/
 * `CONTRACT_AUDIT_PATTERN` (see that doc for why): stripping carries no matching judgement, so
 * a defect here is equally visible both sides, never a one-sided narrowing.
 */
function stripComments(content: string): string {
  const stack: Frame[] = [{ kind: 'code' }]
  let out = ''
  let i = 0
  while (i < content.length) {
    const result = step(content, i, stack)
    out += result.out
    i = result.index
  }
  return out
}

/**
 * The R31 guard's OWN audit pattern (raised by a quality reviewer during an early review
 * round). Deliberately DUPLICATES `NAVE_VAR_PATTERN` above rather than sharing it: a guard
 * that derives its EXPECTED set from the same pattern as the subject it guards measures
 * wiring, never content — sharing made `assertContractPreconditions`'s limb (b) structurally
 * incapable of firing (narrowing `NAVE_VAR_PATTERN` to the earlier colour-only form produced
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
