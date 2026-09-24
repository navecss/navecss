/**
 * Unit coverage for the pure logic in check-content-link-corpus.mjs, run with Node's built-in
 * test runner, no new dependency. Synthetic fixtures only — this never touches the real tracked
 * corpus, so it is safe to run standalone as red/green evidence.
 *
 * Three things this file exists to prove, beyond ordinary coverage:
 *   1. The two regexes here are the SAME ones `packages/core/test/reset-link-decoration.test.ts`
 *      already uses (checked by direct string comparison of `.source`/`.flags` below) — the
 *      whole point of copying rather than re-deriving them is that a future edit to either
 *      side is caught here as a drift, not silently accepted.
 *   2. That byte-identity does NOT establish that the two checks compute the same predicate:
 *      C1 feeds these regexes `postcss` output (`rule.selectors`, pre-split and normalised;
 *      one `prop: value` string), and this script feeds them text it segmented itself. So a
 *      second test runs C1's own selector set through `fenceRemovesAnchorDecoration` and
 *      asserts the two predicates AGREE — the layer where every miss actually lives.
 *   3. The synthetic-violation and fail-closed-empty-corpus tests are the actual red/green
 *      proof this check would catch a real hit, and would refuse to report a false "clean"
 *      run on a broken corpus — not just proof the code runs without throwing.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { findConformanceFraming } from '../packages/tokens/src/theming/copy-lint.ts'
import {
  assertNonEmptyMarkdownCorpus,
  CORPUS_ACCESSIBILITY_DISCLAIMER,
  extractFences,
  fenceIsFlagged,
  fenceRemovesAnchorDecoration,
  findFlaggedFences,
  formatCorpusSummaryLine,
  listTrackedMarkdownFiles,
  REMOVES_DECORATION,
  TARGETS_ANCHOR_ELEMENT,
} from './check-content-link-corpus.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// --- Regexes are the vetted ones, not a re-derived copy ---
//
// The source lives in a .ts file driven by vitest (`packages/core/test/reset-link-decoration.test.ts`);
// importing it directly from a plain `node --test` run executes its module-level `describe(...)`
// against vitest globals that do not exist outside an actual vitest run, so this reads the
// SOURCE TEXT and extracts the two regex literals rather than importing the module — still a
// direct comparison against the real, current source, never a hand-copied duplicate of what the
// source used to say.

function extractRegexLiteral(sourceText, constName) {
  const match = sourceText.match(new RegExp(`const ${constName} = /(.*)/([a-z]*)`))
  assert.ok(match, `expected to find "const ${constName} = /.../" in reset-link-decoration.test.ts`)
  return new RegExp(match[1], match[2])
}

const sourceText = readFileSync(
  path.join(ROOT, 'packages/core/test/reset-link-decoration.test.ts'),
  'utf8',
)
const SOURCE_REMOVES_DECORATION = extractRegexLiteral(sourceText, 'REMOVES_DECORATION')
const SOURCE_TARGETS_ANCHOR_ELEMENT = extractRegexLiteral(sourceText, 'TARGETS_ANCHOR_ELEMENT')

test("REMOVES_DECORATION is byte-identical to reset-link-decoration.test.ts's regex", () => {
  assert.equal(REMOVES_DECORATION.source, SOURCE_REMOVES_DECORATION.source)
  assert.equal(REMOVES_DECORATION.flags, SOURCE_REMOVES_DECORATION.flags)
})

test("TARGETS_ANCHOR_ELEMENT is byte-identical to reset-link-decoration.test.ts's regex", () => {
  assert.equal(TARGETS_ANCHOR_ELEMENT.source, SOURCE_TARGETS_ANCHOR_ELEMENT.source)
  assert.equal(TARGETS_ANCHOR_ELEMENT.flags, SOURCE_TARGETS_ANCHOR_ELEMENT.flags)
})

// --- extractFences ---

test('extractFences finds a single fenced block and its start line', () => {
  const text = 'intro\n\n```css\na { color: red; }\n```\n\noutro'
  const fences = extractFences(text)
  assert.equal(fences.length, 1)
  assert.equal(fences[0].content, 'a { color: red; }\n')
  assert.equal(fences[0].startLine, 3)
})

test('extractFences finds multiple fences, ``` and ~~~ alike', () => {
  const text = '```js\nconst x = 1\n```\n\n~~~css\nb { color: blue; }\n~~~\n'
  const fences = extractFences(text)
  assert.equal(fences.length, 2)
})

test('extractFences returns nothing for markdown with no fence', () => {
  assert.deepEqual(extractFences('just prose, no code block'), [])
})

// The five shapes the previous single-regex form found ZERO fences for. Each was invisible to
// the whole check, not merely mis-bounded: a fence that is never extracted is never scanned.

test('extractFences finds a fence indented two spaces (valid CommonMark)', () => {
  const text = 'intro\n\n  ```css\n  a { text-decoration: none; }\n  ```\n'
  const fences = extractFences(text)
  assert.equal(fences.length, 1)
  assert.equal(fences[0].startLine, 3)
  assert.equal(fenceIsFlagged(fences[0].content), true)
})

test('extractFences finds a fence nested under a bullet (four-space indent)', () => {
  const text = '1. Do this:\n\n    ```css\n    a { text-decoration: none; }\n    ```\n'
  const fences = extractFences(text)
  assert.equal(fences.length, 1)
  assert.equal(fences[0].startLine, 3)
  assert.equal(fenceIsFlagged(fences[0].content), true)
})

test('extractFences finds a fence inside a blockquote', () => {
  const text = '> Note:\n>\n> ```css\n> a { text-decoration: none; }\n> ```\n'
  const fences = extractFences(text)
  assert.equal(fences.length, 1)
  assert.equal(fences[0].startLine, 3)
})

test('extractFences surfaces an unclosed fence at EOF rather than dropping it', () => {
  const text = '# Doc\n\n```css\na { text-decoration: none; }\n'
  const fences = extractFences(text)
  assert.equal(fences.length, 1)
  assert.equal(fences[0].unclosed, true)
  assert.equal(fences[0].startLine, 3)
  assert.equal(fenceIsFlagged(fences[0].content), true)
})

test('extractFences: a 4-backtick fence wrapping a 3-backtick CSS fence is ONE fence, body kept', () => {
  const text = '````md\n```css\na { text-decoration: none; }\n```\n````\n'
  const fences = extractFences(text)
  assert.equal(fences.length, 1)
  assert.equal(fences[0].unclosed, false)
  assert.match(fences[0].content, /text-decoration: none/)
  assert.equal(fenceIsFlagged(fences[0].content), true)
})

test('extractFences marks a normally-terminated fence as not unclosed', () => {
  assert.equal(extractFences('```css\na { color: red; }\n```\n')[0].unclosed, false)
})

// --- fenceRemovesAnchorDecoration (the C1-regex-reuse trigger) ---

test('RED: a rule targeting a bare "a" that strips text-decoration is caught', () => {
  const fence = 'a {\n  text-decoration: none;\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), true)
})

test('RED: a class-qualified anchor selector removing text-decoration-line is caught', () => {
  const fence = 'a.nav-link, a:hover {\n  text-decoration-line: none;\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), true)
})

test('GREEN: text-decoration: none on a non-anchor selector is not caught', () => {
  const fence = '.badge {\n  text-decoration: none;\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), false)
})

test('GREEN: an anchor rule that does not touch text-decoration is not caught', () => {
  const fence = 'a {\n  color: blue;\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), false)
})

test('GREEN: a tag that merely contains "a" (abbr) is not mistaken for the anchor element', () => {
  const fence = 'abbr {\n  text-decoration: none;\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), false)
})

// --- The false-negative family the line-scoped form had (every row, both directions) ---
//
// Each RED row below returned FALSE under the previous implementation: it read one `{` per
// line, set the selector only on the brace line, and cleared all state on any `}`. The pair at
// the top is the worst of it — the same rule, two orderings, two different answers — because a
// tripwire whose verdict depends on the order an author typed a selector list is not a
// tripwire. The GREEN rows pin that the repair did not simply widen everything to true.

test('RED: a selector list whose anchor branch is NOT on the brace line is caught', () => {
  assert.equal(fenceRemovesAnchorDecoration('a,\nbutton {\n  text-decoration: none;\n}\n'), true)
})

test('RED: the SAME selector list reordered is caught identically (no order-dependence)', () => {
  const anchorFirst = 'a,\nbutton {\n  text-decoration: none;\n}\n'
  const anchorLast = 'button,\na {\n  text-decoration: none;\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(anchorFirst), true)
  assert.equal(
    fenceRemovesAnchorDecoration(anchorFirst),
    fenceRemovesAnchorDecoration(anchorLast),
    'the same rule with its selector list reordered must produce the same verdict',
  )
})

test('RED: an opening brace on its own line is caught', () => {
  assert.equal(fenceRemovesAnchorDecoration('a\n{\n  text-decoration: none;\n}\n'), true)
})

test('RED: two rules on one line, the anchor one second, is caught', () => {
  const fence = '.badge { color: red; } a { text-decoration: none; }\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), true)
})

test('RED: an anchor rule wrapped in @media is caught', () => {
  const fence = '@media (min-width: 40em) {\n  a {\n    text-decoration: none;\n  }\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), true)
})

test('RED: native CSS nesting under an anchor is caught (this project ships nesting, ADR 0001)', () => {
  const fence = 'a {\n  &:hover {\n    text-decoration: none;\n  }\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), true)
})

test('GREEN: a NON-anchor rule wrapped in @media stays uncaught', () => {
  const fence = '@media (min-width: 40em) {\n  .badge {\n    text-decoration: none;\n  }\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), false)
})

test('GREEN: two rules on one line, neither an anchor, stays uncaught', () => {
  assert.equal(
    fenceRemovesAnchorDecoration('.badge { color: red; } abbr { text-decoration: none; }\n'),
    false,
  )
})

test('GREEN: an anchor rule that CLOSED before a later non-anchor rule strips decoration', () => {
  const fence = 'a {\n  color: blue;\n}\n\n.badge {\n  text-decoration: none;\n}\n'
  assert.equal(fenceRemovesAnchorDecoration(fence), false)
})

// --- Agreement with C1's own predicate, at the input layer the byte-identity test cannot see ---

test("fenceRemovesAnchorDecoration agrees with C1's predicate over C1's own selector set", () => {
  // C1 (`packages/core/test/reset-link-decoration.test.ts`) applies TARGETS_ANCHOR_ELEMENT to
  // `rule.selectors` — postcss's pre-split, normalised branches — and REMOVES_DECORATION to a
  // `prop: value` string. This script applies the identical literals to text it segmented
  // itself. Byte-identical regexes do not make those the same predicate; this asserts they
  // reach the same verdict on the same selectors, which is what the docblock's reuse claim is
  // actually worth.
  const selectors = [
    'a',
    'a:hover',
    'a.nav-link',
    'a[href]',
    'a#main',
    'nav a',
    'nav > a',
    'li + a',
    'a, button',
    'button, a',
    '.badge',
    'abbr',
    'area',
    '.card',
    'button',
    'nav .link',
  ]
  for (const selector of selectors) {
    const c1Verdict = selector
      .split(',')
      .map((branch) => branch.trim())
      .some((branch) => TARGETS_ANCHOR_ELEMENT.test(branch))
    const scannerVerdict = fenceRemovesAnchorDecoration(
      `${selector} {\n  text-decoration: none;\n}\n`,
    )
    assert.equal(scannerVerdict, c1Verdict, `disagreement on selector: "${selector}"`)
  }
})

// --- fenceIsFlagged (both triggers) ---

test('RED: a fence mentioning content.link is flagged regardless of decoration', () => {
  assert.equal(fenceIsFlagged('a { color: var(--nave-color-content-link); }'), true)
  assert.equal(fenceIsFlagged('Resolves to the content.link token.'), true)
})

test('RED: a fence mentioning --nave-color-content-link is flagged', () => {
  assert.equal(fenceIsFlagged('color: var(--nave-color-content-link);'), true)
})

test('GREEN: an unrelated fence is not flagged', () => {
  assert.equal(fenceIsFlagged('.card {\n  padding: var(--nave-space-4);\n}\n'), false)
})

test(
  'over-match (declined to resolve, per header comment): an anchor with no underline is ' +
    'flagged whether or not anything else distinguishes it, because this check reads one ' +
    'fence and cannot see the rest of the page',
  () => {
    const fence =
      'a.button {\n  text-decoration: none;\n  border-radius: 4px;\n  padding: 8px 16px;\n}\n'
    assert.equal(fenceIsFlagged(fence), true)
  },
)

// --- findFlaggedFences (file-level, with line numbers) ---

test("findFlaggedFences reports the flagged fence's start line, and skips clean fences", () => {
  const text = [
    '# Example',
    '',
    '```css',
    '.badge { text-decoration: none; }',
    '```',
    '',
    '```css',
    'a { text-decoration: none; }',
    '```',
  ].join('\n')
  const flagged = findFlaggedFences(text)
  assert.equal(flagged.length, 1)
  assert.equal(flagged[0].startLine, 7)
})

test('findFlaggedFences returns nothing for a file with no flagged fence', () => {
  const text = '```css\n.badge { color: red; }\n```\n'
  assert.deepEqual(findFlaggedFences(text), [])
})

// --- listTrackedMarkdownFiles (git ls-files, filtered, via injection) ---

test('listTrackedMarkdownFiles filters NUL-separated git ls-files -z output to *.md', () => {
  const fakeExecFile = () => 'README.md\0scripts/check-x.mjs\0docs/index.md\0package.json\0'
  assert.deepEqual(listTrackedMarkdownFiles(fakeExecFile), ['README.md', 'docs/index.md'])
})

test('listTrackedMarkdownFiles invokes git ls-files with -z, not the newline-quoting default', () => {
  let calledWith
  const fakeExecFile = (cmd, args) => {
    calledWith = args
    return ''
  }
  listTrackedMarkdownFiles(fakeExecFile)
  assert.deepEqual(calledWith, ['ls-files', '-z'])
})

// RED-first evidence for the actual bug, over a REAL git repo with a real non-ASCII tracked
// filename — `core.quotePath` defaults to `true`, so a mock string can assert the intended
// behaviour without ever exercising the quoting git itself performs.
test('end to end: a non-ASCII-named tracked markdown file is not silently dropped from the corpus', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-corpus-nonascii-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    // This fixture's ambient-config dependencies are PINNED rather than inherited. Measured
    // RED 2026-09-12 at this HEAD, one hostile global config at a time:
    // `core.quotePath=false` (a common dev setting) fails the premise assertion below on
    // correct HEAD bytes, and also makes the regression assertion VACUOUS, since the pre-`-z`
    // implementation returns the right answer under it; `commit.gpgsign=true` with no key
    // available fails the commit itself; a global `core.hooksPath` runs someone else's
    // pre-commit hook inside this fixture.
    git('config', 'core.quotePath', 'true')
    git('config', 'commit.gpgsign', 'false')
    git('config', 'core.hooksPath', '/dev/null')
    writeFileSync(path.join(dir, 'café.md'), '# café\n')
    writeFileSync(path.join(dir, 'plain.md'), '# plain\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'init')

    // Confirm the premise: plain (no -z) git ls-files really does C-quote this path, so the
    // regression this test guards against is real and not hypothetical.
    const unquoted = execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' })
    assert.ok(
      unquoted.includes('"caf'),
      `expected git's default quoting to C-quote the non-ASCII path, got: ${JSON.stringify(unquoted)}`,
    )

    const files = listTrackedMarkdownFiles((cmd, args, opts) =>
      execFileSync(cmd, args, { ...opts, cwd: dir }),
    )
    assert.deepEqual(files.sort(), ['café.md', 'plain.md'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// --- assertNonEmptyMarkdownCorpus (item 5: fail closed on an empty subject set) ---

test('GREEN: a non-empty file list passes through unchanged', () => {
  assert.deepEqual(assertNonEmptyMarkdownCorpus(['README.md']), ['README.md'])
})

test('RED (fail-closed): an empty file list throws a named error, never a silent "0 matches"', () => {
  assert.throws(() => assertNonEmptyMarkdownCorpus([]), /zero tracked markdown files/)
})

// --- formatCorpusSummaryLine (scannedCount vs totalCount: same-typed counts that are
// structurally EQUAL on a real run where nothing is unreadable — 40 of 40 on the real corpus
// today — so a swap of the two prints a byte-identical line. NO fixture covered this line
// before: the only prior occurrence of the sentence in this file is the hand-written literal
// in the item-7 copy-lint test below, which is fed to `findConformanceFraming` and never
// calls this function, never runs the gate and asserts nothing about any count) ---

// TWO cases, at different sizes, because one case cannot tell a computed count from the literal
// it happens to equal, nor from an off-by-one: the original single fixture used the ADJACENT
// integers 27 and 28, which made `scannedCount` indistinguishable from `totalCount - 1`, the
// most common count defect there is. Here no two coordinates in a row are adjacent, and no
// constant and no fixed offset between any two slots survives both rows. The second row's
// `9 of 4` is deliberately not a state a real corpus can reach: this is a pure formatter, and
// inverting the two coordinates' order across the rows is what kills a min/max substitution as
// well as a constant one. Semantics are the call site's business, and are asserted there.
//
// What this test does NOT reach: which count is bound to which slot. That is decided at the
// call site in main(), which this function cannot see, and it has its own end-to-end test at
// the end of this file.
test('formatCorpusSummaryLine: the literal format, with the three counts pairwise distinct so a transposition inside this function reddens (the binding of each count to its slot is pinned at the call site, not here)', () => {
  assert.equal(
    formatCorpusSummaryLine(24, 31, 7),
    '24 of 31 tracked markdown file(s) scanned; 7 fence(s) reference content.link or strip ' +
      `text-decoration on an anchor (${CORPUS_ACCESSIBILITY_DISCLAIMER}).`,
  )
  assert.equal(
    formatCorpusSummaryLine(9, 4, 16),
    '9 of 4 tracked markdown file(s) scanned; 16 fence(s) reference content.link or strip ' +
      `text-decoration on an anchor (${CORPUS_ACCESSIBILITY_DISCLAIMER}).`,
  )
})

// --- Item 7's copy-lint clause, asserted rather than argued ---

test("this script's own printed lines carry no conformance framing (copy-lint, item 7)", () => {
  // The header answers item 7 by CALL-SITE reasoning: `findConformanceFraming` is invoked
  // against specific in-package strings and nothing calls it against `scripts/`. That is true
  // and it is a different question from the one item 6 asks, which is whether this output
  // WOULD be clean if it were linted. The output is interpolated, so the honest form is an
  // assertion, not an argument — with adversarial path fixtures, because RATIO_PATTERN
  // (/\d+(?:\.\d+)?\s*:\s*1/) trips on a bare `path:line` pair whose path ends in a digit.
  const printed = [
    '28 of 28 tracked markdown file(s) scanned; 0 fence(s) reference content.link or strip ' +
      'text-decoration on an anchor (surfaced for human review, this is not an accessibility ' +
      "verdict — see this script's header comment).",
    '  - docs/03-tech-docs/index.md:42',
    '  - docs/03-tech-docs/index.md:42 (unclosed fence)',
    // Adversarial, and the worst this script's own line format admits: digits immediately
    // before the extension, and inside a directory segment, next to line number 1.
    '  - docs/v2.md:1',
    '  - docs/v2/guide.md:1',
    '  - 2.md:1',
    'check-content-link-corpus: 1 tracked markdown file(s) could not be read and were NOT ' +
      'scanned, so the count above is over a partial corpus:',
    '  - docs/index.md (ENOENT)',
    'check-content-link-corpus: git ls-files resolved to zero tracked markdown files. This is ' +
      'not "0 fences flagged" — the corpus itself is empty or unreachable, which means a path ' +
      'moved or the glob rotted. Failing closed rather than reporting a clean run.',
  ]
  for (const line of printed) {
    assert.equal(findConformanceFraming(line), undefined, `conformance framing in: "${line}"`)
  }
})

test('the ratio pattern DOES trip on a bare path:line pair — this corpus is safe by its .md filter, not by luck', () => {
  // Pins exactly where the boundary is, so the fixtures above are not mistaken for proof that
  // any path is safe. `docs/v2:1` is a real violation of copy-lint's framing rule; this script
  // cannot print it only because every path it prints ends in `.md`, which puts a non-digit
  // between the number and the colon. That is a property of the SUBJECT SET, not of the output
  // format, so it does not carry to a sibling report over a wider corpus.
  assert.notEqual(findConformanceFraming('docs/v2:1'), undefined)
  assert.equal(findConformanceFraming('docs/v2.md:1'), undefined)
})

// --- The summary line's CALL SITE ---
//
// `formatCorpusSummaryLine`'s own fixtures above pin the FORMAT. They cannot pin which count
// reaches which slot, because the formatter has no knowledge of which count is which, and on
// the real corpus a transposition is not merely untested but UNDETECTABLE: `scannedCount` and
// `files.length` are both 40, so swapping them at the call site prints a byte-identical line
// with the whole suite green. Swapping `scannedCount` with `fenceCount` instead prints
// `0 of 40 ... 40 fence(s)` — a gate reporting it scanned nothing and flagged everything — at
// exit 0, inside `ci:check`.
//
// `main()` is not exported and this layer deliberately does not export it: making it drivable
// in-process needs an injectable root AND an injectable `execFile` reaching every read, which
// is more new production surface than the property is worth. Instead the SHIPPED script runs as
// a child process against a throwaway git corpus, the pattern check-license-parity.test.mjs
// already uses. `ROOT` is derived from the script file's own location, so a copy placed at
// `<fixture>/scripts/` resolves its whole corpus inside the fixture; the script imports node
// builtins only, so the copy is self-contained. Nothing here changes the shipped script.

const SCRIPT_NAME = 'check-content-link-corpus.mjs'
const SCRIPT_PATH = path.join(ROOT, 'scripts', SCRIPT_NAME)
const FLAGGED_FENCE = ['```css', 'a { color: var(--nave-color-content-link); }', '```'].join('\n')

/**
 * A throwaway git repository the SHIPPED script can be run against.
 *
 * `readable` maps a markdown path to the number of flagged fences to put in it; `missing` names
 * markdown paths that are staged in the index and then DELETED from disk, which is what makes
 * `scannedCount` diverge from `files.length` — `git ls-files` reads the index, so the file is
 * still tracked while `readFileSync` throws ENOENT. That is the only fixture shape that
 * separates those two coordinates, and it is the one the script's own docblock names.
 *
 * The temp root is realpath'd: on macOS `tmpdir()` is a symlink, and this
 * script's entry-point guard compares realpaths on both sides, so a symlinked fixture path
 * risks `main()` never running and the child exiting 0 having printed nothing — a vacuous pass
 * indistinguishable from a real one. `runCorpusScript`'s zero-bytes assertion is what actually
 * catches that; the realpath keeps the path canonical regardless.
 */
function buildCorpusFixture({ missing, readable }) {
  const dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), 'nave-content-link-')))
  mkdirSync(path.join(dir, 'scripts'))
  cpSync(SCRIPT_PATH, path.join(dir, 'scripts', SCRIPT_NAME))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '--quiet')

  const write = (relPath, body) => {
    const absolute = path.join(dir, relPath)
    mkdirSync(path.dirname(absolute), { recursive: true })
    writeFileSync(absolute, body)
  }
  for (const [relPath, fenceCount] of Object.entries(readable)) {
    const fences = []
    for (let index = 0; index < fenceCount; index += 1) fences.push(FLAGGED_FENCE)
    write(relPath, `# ${relPath}\n\n${fences.join('\n\n')}\n`)
  }
  for (const relPath of missing) write(relPath, `# ${relPath}\n`)

  // Staged, never committed: `git ls-files` reads the index, which is all this script shells
  // out for. Only the markdown files are added, so the copied script never enters the corpus
  // (it would be filtered by extension anyway) and the counts below are exactly as declared.
  git('add', '--', ...Object.keys(readable), ...missing)
  for (const relPath of missing) rmSync(path.join(dir, relPath))
  return dir
}

/**
 * Run the shipped script as a child process from the fixture root. Asserts the run PRODUCED
 * something: the failure mode this layer guards against surfaces as exit 0 with no output at
 * all, which satisfies every assertion written about a green run.
 */
function runCorpusScript(cwd) {
  const result = spawnSync(process.execPath, [path.join('scripts', SCRIPT_NAME)], {
    cwd,
    encoding: 'utf8',
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  assert.ok(
    stdout.length + stderr.length > 0,
    'zero bytes on stdout AND stderr: either the entry-point guard did not fire and main() ' +
      'never ran, or main() ran and returned down a branch that prints nothing. A silent ' +
      'exit 0 satisfies every assertion written about a green run.',
  )
  return { status: result.status, stderr, stdout }
}

test('end to end: the summary line binds each count to its own slot, distinguishably from every other count in scope', () => {
  // TWO properties, and the second is the one a "simplified" fixture silently gives back.
  //
  // (1) NOT A LITERAL, and not a fixed offset. Two cases at different sizes, so no constant
  //     substituted for any coordinate survives both.
  //
  // (2) NOT A DIFFERENT COUNT IN SCOPE. main() holds FIVE same-typed counts when it composes
  //     this line — `scannedCount`, `files.length`, `fenceCount`, `flaggedByFile.length` and
  //     `unreadable.length` — not the three the line prints. Four of the five are coincident at
  //     0 or equal to each other on the real corpus, which is why `fenceCount ->
  //     flaggedByFile.length` and `fenceCount -> unreadable.length` both print a byte-identical
  //     line there. Each case below therefore leaves all five DIFFERENT from one another:
  //
  //       case  scannedCount  files.length  fenceCount  flaggedByFile  unreadable
  //          1             5             7           6              3           2
  //          2             3             4           5              2           1
  //
  //     Do NOT reduce these fixtures to "some markdown files with a fence in them". The
  //     DELETED-but-tracked entries are what separate `scannedCount` from `files.length` at
  //     all, and spreading an uneven number of fences across a smaller number of files is what
  //     separates `fenceCount` from `flaggedByFile.length`. Removing either restores the defect
  //     with the whole suite still green.
  const cases = [
    {
      // 5 readable (3 of them flagged, carrying 3 + 2 + 1 = 6 fences), 2 tracked-but-deleted.
      missing: ['gone/a.md', 'gone/b.md'],
      readable: { 'a.md': 3, 'b.md': 2, 'c.md': 1, 'docs/d.md': 0, 'docs/e.md': 0 },
      summary: [5, 7, 6],
      unreadable: ['gone/a.md', 'gone/b.md'],
    },
    {
      // 3 readable (2 of them flagged, carrying 4 + 1 = 5 fences), 1 tracked-but-deleted.
      missing: ['gone.md'],
      readable: { 'x.md': 4, 'y.md': 1, 'z.md': 0 },
      summary: [3, 4, 5],
      unreadable: ['gone.md'],
    },
  ]

  for (const { missing, readable, summary, unreadable } of cases) {
    const dir = buildCorpusFixture({ missing, readable })
    try {
      const { status, stdout } = runCorpusScript(dir)
      const lines = stdout.split('\n').filter((line) => line !== '')
      const label = `case ${summary.join('/')}`

      assert.equal(status, 0, label)
      // The summary is the FIRST line and is compared against the formatter's own output for
      // the declared census, so a coordinate bound to the wrong slot reddens here even when
      // the format itself is untouched.
      assert.equal(lines[0], formatCorpusSummaryLine(...summary), label)
      // ...and EXACTLY ONCE. Selecting `lines[0]` pins WHICH line the summary is; it says
      // nothing about how many there are, so main() emitting the same line twice satisfies the
      // assertion above with the whole suite green. The sibling allow-list call-site test
      // fences the identical mutation with `lines.length === 1`, which is that gate's
      // single-line form of this count; the corpus gate prints detail lines too, so the count
      // is taken over the summary line rather than over the whole stream.
      assert.equal(
        lines.filter((line) => line === formatCorpusSummaryLine(...summary)).length,
        1,
        `${label}: the summary line is printed exactly once`,
      )
      // The filter above matches the CORRECT line's exact bytes, so a second, fully-transposed
      // summary line (wrong numbers, still the summary shape) would not be counted by it and
      // would ship green. This filter instead matches the summary line's SHAPE regardless of
      // its numbers, so any extra summary-shaped line — transposed or not — reddens here; no
      // detail line (`  - path:line...` or the partial-corpus notice) matches this shape.
      assert.equal(
        lines.filter((line) =>
          /^\d+ of \d+ tracked markdown file\(s\) scanned; \d+ fence\(s\) reference/.test(line),
        ).length,
        1,
        `${label}: exactly one summary-shaped line is printed, not the correct one plus a mis-bound second`,
      )

      // The detail lines are asserted too, because they are what make the census checkable
      // rather than asserted: one line per flagged fence (so `fenceCount` is a real count of
      // them) and one per unreadable file.
      const flaggedLines = lines.filter((line) =>
        /^ {2}- \S+\.md:\d+( \(unclosed fence\))?$/.test(line),
      )
      assert.equal(flaggedLines.length, summary[2], `${label}: one detail line per flagged fence`)
      assert.equal(
        lines.filter((line) => line.startsWith('check-content-link-corpus: ')).length,
        1,
        `${label}: the partial-corpus notice`,
      )
      for (const relPath of unreadable) {
        assert.ok(
          lines.some((line) => line.startsWith(`  - ${relPath} (`)),
          `${label}: ${relPath} named as unreadable`,
        )
      }
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  }
})
