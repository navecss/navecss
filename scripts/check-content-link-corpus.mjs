#!/usr/bin/env node
/**
 * Report-only tripwire for C2 of the signed, published accessibility threshold table for
 * anchor styling: surfaces, never blocks, any Nave-authored markdown sample that shows
 * `content.link` or strips `text-decoration` on an anchor without naming a cue, so a human can
 * review whether it needs a non-colour distinction. C2 is already signed and published — this
 * script mints, narrows, and widens no accessibility conclusion; it names no specific cue
 * anywhere in its code, its test, or its output.
 *
 * 1. Subject: the git-tracked markdown corpus, `git ls-files` filtered to `*.md`. Never a
 *    hand-written path list, so a new file is covered the day it lands.
 *
 * 2. Match: the two regex LITERALS are the same ones
 *    `packages/core/test/reset-link-decoration.test.ts` already uses to guard the shipped CSS
 *    (condition C1 of the same signed table), copied verbatim rather than re-derived — two
 *    spellings of the same predicate is how they drift, and this file's test asserts the two
 *    copies stay byte-identical.
 *
 *    **The literals are identical; the PREDICATE is not, and the difference is the input
 *    layer.** C1 feeds these regexes `postcss` output: `rule.selectors`, already split on
 *    commas and normalised, and a single `prop: value` string per declaration. This script has
 *    no parser (see below), so it feeds them text it segmented itself. Every miss this scanner
 *    can have lives in that segmentation, not in the regexes, and the byte-identity test does
 *    not reach it — which is why there is a second test running C1's own selector set through
 *    `fenceRemovesAnchorDecoration` and asserting the two predicates agree.
 *
 *    A fence is flagged if it references `content.link` or `--nave-color-content-link`, OR if
 *    `REMOVES_DECORATION` and `TARGETS_ANCHOR_ELEMENT` both match within the same rule (an open
 *    selector reaching an anchor, and a declaration inside that block removing
 *    `text-decoration`). Fence content is markdown-embedded CSS, not necessarily a complete,
 *    parseable stylesheet (a fragment's selector or closing brace can live outside the fence),
 *    so this uses a brace-nesting heuristic rather than a full CSS parser (no new dependency —
 *    `postcss` is not a root devDependency, only a `packages/core` one, and this script runs
 *    from the repo root like its six siblings). The heuristic is deliberately biased: it
 *    accumulates the selector buffer ACROSS lines and segments each line on `{`/`}` rather than
 *    reading one brace per line, because the naive form had a false-NEGATIVE family (a selector
 *    list whose anchor branch was not on the brace line; a brace on its own line; two rules on
 *    one line; an `@media` wrapper; native nesting) and, worst of all, was ORDER-DEPENDENT:
 *    `a,\nbutton { … }` and `button,\na { … }` are the same rule and it answered differently.
 *
 * 3. Action: SURFACE only, never auto-block. This is the load-bearing constraint. Deciding
 *    which non-colour cue is sufficient is a human accessibility reviewer's call, not this
 *    check's, and deliberately undecided here.
 *    Anchors styled without an underline are flagged whether or not anything else
 *    distinguishes them, because this check reads one fence's text and cannot see the rest
 *    of the page. It is not meant to resolve those cases, only surface them; whether a given
 *    distinction is sufficient is not decided here.
 *
 * 4. Wired into `scripts:check`/`ci:check` — unlike a report-only script that is written but
 *    never invoked by any gate: safe to gate the wiring, not the finding — this script always
 *    exits 0 on matches found.
 *
 * 5. Fails closed on an EMPTY subject set. Zero markdown files from `git ls-files` is not a
 *    clean run — it means a path moved or a glob rotted — and is thrown as a distinct, named
 *    error rather than reported as "0 matches" (which would be indistinguishable from a
 *    healthy, fully-scanned, zero-hit run). Mirrors the fail-closed style
 *    `packages/tokens/src/theming/contrast.ts`'s `runContrastHarness` uses for its own
 *    empty-input case (R21: "fails closed when the pair-declaration set is empty").
 *
 *    That fail-closed condition is the ONLY one legislated here, and the per-file read is
 *    deliberately not one of them. This script is wired into `scripts:check` -> `ci:check`, so
 *    an unguarded `readFileSync` would let an ENOENT on a tracked-but-missing `.md` (mid-rebase,
 *    an unstaged `rm`) take the whole gate red with a bare stack trace and nothing tying the
 *    failure to this check. Each read is wrapped: an unreadable file is named, counted, and
 *    reported as a scope caveat on the success line, and only the empty-corpus condition above
 *    throws.
 *
 * 6. The success line states SCOPE, not a verdict: "`N` markdown files scanned; `M` fence(s)
 *    reference content.link or strip text-decoration on an anchor." This is never a sentence a
 *    reader could take as "Nave's examples satisfy C2" — it flags fences that may need a human
 *    look and certifies nothing about the ones it does not flag. One-directional, by design.
 *
 * 7. `copy-lint` check (`packages/tokens/src/theming/copy-lint.ts`): its `findConformanceFraming`
 *    is invoked deliberately against specific in-package strings (DTCG `$description`s, the
 *    re-theming notice, the R21/R38 harness's own name and thrown messages) — it is not a
 *    repo-wide scanner and nothing calls it against `scripts/`. This script's own printed
 *    strings are outside its scope; confirmed by reading every call site before writing this
 *    script's output strings.
 *
 * Declined, not built here (record so nobody re-adds these as an oversight):
 *   - The converse assertion (every sample carries an adequate cue) — undecidable without
 *     a human accessibility reviewer's sufficiency call on what counts as adequate.
 *   - A narrow BLOCKING rule for the "obvious" case (an anchor coloured with content.link and
 *     stripped of decoration in the same fence) — declined because a fence may be a fragment
 *     whose cue lives elsewhere: a class, neighbouring markup, or surrounding prose the fence
 *     itself does not show.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Verbatim copy of `packages/core/test/reset-link-decoration.test.ts`'s `REMOVES_DECORATION`
 * — matches `text-decoration: none` (with or without `!important`), any casing; also catches
 * the longhand `text-decoration-line: none`. Kept byte-identical to the source regex rather
 * than re-derived, per this script's own header comment (two spellings drift).
 */
export const REMOVES_DECORATION = /text-decoration(-line)?\s*:\s*none\b/i

/**
 * Verbatim copy of the same file's `TARGETS_ANCHOR_ELEMENT` — a selector compound that
 * targets the anchor element itself: a bare `a`, optionally with pseudo-classes / attributes /
 * classes / ids attached, as the rightmost component of a (possibly descendant/child) selector.
 * Does not match tags that merely contain "a" (e.g. `abbr`, `area`, `.card`).
 */
export const TARGETS_ANCHOR_ELEMENT = /(^|[\s>+~,])a(?=$|[.:#[\s>+~])/i

/**
 * References the C2 subject slot or its emitted custom property, in any casing of the token
 * name — the first of the two independent triggers (see header comment, item 2).
 */
const REFERENCES_CONTENT_LINK = /content\.link\b|--nave-color-content-link\b/i

/**
 * True if `fenceText` contains a CSS-shaped rule that both targets the anchor element and
 * removes its `text-decoration` inside that rule — the second of the two independent triggers.
 *
 * A markdown fence is not guaranteed to be complete, parseable CSS (it may be a fragment whose
 * selector or closing brace lives outside the fence), so this is a character scanner over a
 * STACK of open selectors rather than an AST walk: `{` pushes the accumulated buffer as a
 * selector, `;` and `}` end a declaration and test it, `}` pops. A declaration removing
 * `text-decoration` flags if ANY selector currently on the stack has a comma-branch matching
 * `TARGETS_ANCHOR_ELEMENT` — which is what makes an `@media` wrapper and native CSS nesting
 * (`a { &:hover { … } }`, which this project ships, ADR 0001) both resolve correctly.
 *
 * Deliberately permissive: an over-match here is exactly what "surface only" calls for, while a
 * missed match silently narrows C2's own vetted regexes, which this function must not do. The
 * three properties the previous line-scoped form lacked, each a real false-negative family:
 * the selector buffer ACCUMULATES across lines (so the anchor branch of a selector list need
 * not sit on the brace line, and `a\n{` works); each line is segmented on every `{`/`}` rather
 * than on its FIRST `{` (so two rules on one line both parse); and `}` pops one level instead
 * of clearing the whole state (so nesting survives). The one that made it unusable rather than
 * merely incomplete was order-dependence: `a,\nbutton { text-decoration: none }` and
 * `button,\na { text-decoration: none }` are the same rule, and the old form answered false for
 * the first and true for the second.
 */
export function fenceRemovesAnchorDecoration(fenceText) {
  const openSelectors = []
  let buffer = ''

  const anAnchorIsOpen = () =>
    openSelectors.some((selector) =>
      selector.split(',').some((branch) => TARGETS_ANCHOR_ELEMENT.test(branch)),
    )

  for (const char of fenceText) {
    if (char === '{') {
      openSelectors.push(buffer.trim())
      buffer = ''
    } else if (char === '}') {
      if (REMOVES_DECORATION.test(buffer) && anAnchorIsOpen()) return true
      openSelectors.pop()
      buffer = ''
    } else if (char === ';') {
      if (REMOVES_DECORATION.test(buffer) && anAnchorIsOpen()) return true
      buffer = ''
    } else {
      buffer += char
    }
  }

  // A fragment whose final declaration has no terminating `;` or `}` inside the fence.
  return REMOVES_DECORATION.test(buffer) && anAnchorIsOpen()
}

/**
 * A fence opener or closer: an optional container prefix (indentation, and `>` for a fence
 * inside a blockquote), then a run of at least three backticks or tildes, then the rest of the
 * line (the info string on an opener; required to be blank on a closer).
 */
const FENCE_MARKER = /^[ \t>]*(`{3,}|~{3,})(.*)$/

/**
 * Extracts fenced code blocks from markdown `text`, returning `{ content, startLine,
 * unclosed }` for each (`startLine` is the fence-opener line, 1-indexed, so a flagged fence can
 * be pointed at directly rather than only by file).
 *
 * A line scanner rather than the single multiline regex this replaces, which found ZERO fences
 * for every one of: a fence indented two spaces (valid CommonMark), a fence inside a bullet, a
 * fence inside a blockquote, and an unclosed fence at EOF (silently dropped). It also split a
 * four-backtick fence wrapping a three-backtick CSS fence into two bogus fences and dropped the
 * CSS body entirely. This check's own principle is that a new file is covered the day it lands,
 * and a step-by-step doc showing a CSS sample under a numbered bullet was invisible.
 *
 * Three rules do that work: the opener and closer both tolerate a container prefix; a closer
 * must use the opener's marker character and a run at LEAST as long (so an inner three-backtick
 * fence cannot close a four-backtick one); and a fence still open at EOF is RETURNED with
 * `unclosed: true` and its body to EOF, rather than dropped — an unterminated fence is a real
 * shape a doc can have, and silently not scanning it is the one outcome a surface-only tripwire
 * cannot afford.
 */
export function extractFences(text) {
  const lines = text.split(/\r?\n/)
  const fences = []
  let open = null

  const close = (unclosed) => {
    fences.push({
      content: open.body.length > 0 ? `${open.body.join('\n')}\n` : '',
      startLine: open.startLine,
      unclosed,
    })
    open = null
  }

  lines.forEach((line, index) => {
    const marker = line.match(FENCE_MARKER)
    if (open === null) {
      if (marker) {
        open = { char: marker[1][0], length: marker[1].length, startLine: index + 1, body: [] }
      }
      return
    }
    const closes =
      marker &&
      marker[1][0] === open.char &&
      marker[1].length >= open.length &&
      marker[2].trim() === ''
    if (closes) close(false)
    else open.body.push(line)
  })

  if (open !== null) close(true)
  return fences
}

/**
 * True if one fence's content either references `content.link`/`--nave-color-content-link`,
 * or removes `text-decoration` on an anchor rule (see the two triggers above).
 */
export function fenceIsFlagged(fenceContent) {
  return REFERENCES_CONTENT_LINK.test(fenceContent) || fenceRemovesAnchorDecoration(fenceContent)
}

/**
 * Every flagged fence in one markdown file's full text, as `{ startLine, unclosed }` records.
 * An unclosed fence is scanned like any other and carries its flag through, so a reader can see
 * that a hit came from a fence the document never terminated.
 */
export function findFlaggedFences(text) {
  return extractFences(text)
    .filter((fence) => fenceIsFlagged(fence.content))
    .map((fence) => ({ startLine: fence.startLine, unclosed: fence.unclosed }))
}

/**
 * Runs `git ls-files` from `ROOT`, filtered to `*.md` — the corpus's source of truth. Never a
 * hand-written path list. Exported so the fail-closed path (item 5) is testable via injection
 * rather than by mutating the real tracked corpus.
 *
 * `-z` (NUL-separated output), NOT the newline-separated default:
 * `git config core.quotePath` defaults to `true`, so plain `git ls-files` C-quotes any path
 * carrying a byte outside the printable-ASCII range — `café.md` prints as the literal string
 * `"caf\303\251.md"`, WITH the surrounding quotes, which does not end in `.md` and is silently
 * dropped by `.filter((line) => line.endsWith('.md'))` with no error, no warning, and no
 * change to the reported "N of N scanned" line (it re-derives N from the already-shrunk list).
 * `-z` disables quoting and NUL-terminates each entry regardless of its bytes, so this reads
 * every tracked path exactly once and correctly, ASCII or not.
 */
export function listTrackedMarkdownFiles(execFile = execFileSync) {
  return execFile('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((line) => line.endsWith('.md'))
}

/**
 * Item 5's fail-closed guard, isolated so it is testable without shelling out: throws a named
 * error if `files` is empty (a healthy run always sees at least one tracked markdown file —
 * this repo's own README/docs alone guarantee that), and returns `files` unchanged otherwise.
 * An empty result here means the corpus is empty or unreachable (a moved path, a rotted glob),
 * which is a distinct, broken state from "corpus scanned, zero fences flagged" — conflating the
 * two would make this tripwire's own silent failure indistinguishable from success.
 */
export function assertNonEmptyMarkdownCorpus(files) {
  if (files.length === 0) {
    throw new Error(
      'check-content-link-corpus: git ls-files resolved to zero tracked markdown files. This ' +
        'is not "0 fences flagged" — the corpus itself is empty or unreachable, which means a ' +
        'path moved or the glob rotted. Failing closed rather than reporting a clean run.',
    )
  }
  return files
}

/**
 * `scannedCount` and `totalCount` are both counts of files and, on a real run where nothing is
 * unreadable, are structurally equal — 40 of 40 on the real corpus today — so a swap of the two
 * prints a byte-identical line. NO fixture covered this line before: the only prior occurrence
 * of this sentence in the test file is a hand-written literal fed to the copy-lint's
 * `findConformanceFraming`, which never calls this function, never runs the gate, and asserts
 * nothing about any count. Extracted so a test can supply a corpus where the two diverge (one
 * unreadable file), which is the only fixture shape that discriminates them.
 *
 * Extracting a formatter pins the FORMAT and nothing else: which count reaches which slot is
 * bound at the call site in `main()`, which this function cannot see, and `main()` holds FIVE
 * same-typed counts (`scannedCount`, `files.length`, `fenceCount`, `flaggedByFile.length`,
 * `unreadable.length`), not three. That binding carries its own end-to-end test, which runs
 * this shipped script over a scratch git corpus built so all five differ.
 */
// The parenthetical itself, factored out so the two call-site fixtures in
// check-content-link-corpus.test.mjs assert against this one string rather than each carrying
// their own copy: a reword here now reddens both of them together instead of leaving whichever
// copy the reword missed silently stale. The pre-existing copy-lint fixture in the same file
// stays its own hand-written literal by design (see this function's docblock) — it tests the
// copy-lint's own pattern detector, never calls this function, and is deliberately not wired
// to this constant.
export const CORPUS_ACCESSIBILITY_DISCLAIMER =
  "surfaced for human review, this is not an accessibility verdict — see this script's header comment"

/**
 * Formats the one-line scan summary, always naming the accessibility disclaimer so the count
 * never prints without its qualifier.
 */
export function formatCorpusSummaryLine(scannedCount, totalCount, fenceCount) {
  return (
    `${scannedCount} of ${totalCount} tracked markdown file(s) scanned; ${fenceCount} ` +
    `fence(s) reference content.link or strip text-decoration on an anchor (${CORPUS_ACCESSIBILITY_DISCLAIMER}).`
  )
}

/**
 * Scans every tracked markdown file for fences that reference `content.link` or strip anchor
 * text-decoration and prints the summary plus each flagged site. Report-only: it never sets
 * `process.exitCode`, even when files are unreadable or fences are flagged.
 */
function main() {
  const files = assertNonEmptyMarkdownCorpus(listTrackedMarkdownFiles())

  const flaggedByFile = []
  const unreadable = []
  let scannedCount = 0
  let fenceCount = 0
  for (const relPath of files) {
    // Item 5: the empty-corpus condition is the ONLY thing that fails this gate closed. A file
    // that vanished between `git ls-files` and this read is named, not thrown, so a mid-rebase
    // tree cannot take `ci:check` red with an unattributed stack trace.
    let text
    try {
      text = readFileSync(path.join(ROOT, relPath), 'utf8')
    } catch (error) {
      unreadable.push({ relPath, reason: error.code ?? error.message })
      continue
    }
    scannedCount += 1
    const fences = findFlaggedFences(text)
    if (fences.length > 0) {
      flaggedByFile.push({ relPath, fences })
      fenceCount += fences.length
    }
  }

  console.log(formatCorpusSummaryLine(scannedCount, files.length, fenceCount))
  for (const { relPath, fences } of flaggedByFile) {
    for (const fence of fences) {
      console.log(`  - ${relPath}:${fence.startLine}${fence.unclosed ? ' (unclosed fence)' : ''}`)
    }
  }
  if (unreadable.length > 0) {
    console.log(
      `check-content-link-corpus: ${unreadable.length} tracked markdown file(s) could not be ` +
        'read and were NOT scanned, so the count above is over a partial corpus:',
    )
    for (const { relPath, reason } of unreadable) {
      console.log(`  - ${relPath} (${reason})`)
    }
  }
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href`:
// `import.meta.url` is both percent-encoded AND symlink-resolved by Node, `process.argv[1]`
// is neither, so an invocation through a symlinked absolute path (macOS's `/tmp` ->
// `/private/tmp`, for one) makes the two sides disagree even under the fixed `pathToFileURL`
// form — `main()` silently never fires and the script exits 0 having printed nothing.
// `realpathSync` on both sides closes that gap too. An earlier fix addressed a plain-template
// comparison defect across the repo's older scripts; a later fix addressed this symlink gap
// specifically, applied across NINE `scripts:check` gates, this file included, plus a
// protected-writes hook and one report-only script that carried the same guard, which made
// ELEVEN under `scripts/` at the time. (Both of those have since left this repository — the
// hook into the `nave` plugin, the report-only script deleted outright — so the class is
// unchanged and the membership is NINE under `scripts/`.)
// `packages/core/scripts/build-css.ts` is a further member of the same class, fixed under that
// same later effort, and outside the `scripts/` sweep entirely.
//
// The `process.argv[1] &&` limb is not defensive padding, and its reason is NOT the one this
// comment used to give ("`realpathSync(undefined)` THROWS"). `realpathSync` does not reject a
// non-string: it coerces `undefined` to the STRING `'undefined'` and resolves it against the
// CURRENT WORKING DIRECTORY, so it raises `ENOENT` on `<cwd>/undefined` in the usual case and,
// in a cwd that happens to contain a file of that name, returns a real path and does not throw
// at all. Either way `argv[1]` is undefined whenever this module is IMPORTED rather than run
// as an entry point, and the limb is what stops the comparison being attempted at all — which
// this file's own test does not exercise, because `node --test` sets `argv[1]`.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
