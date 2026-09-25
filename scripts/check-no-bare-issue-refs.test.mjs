/**
 * The repo-wide counterpart to `packages/core/test/no-bare-issue-refs.test.ts`, which pins the
 * same property for `packages/core/` alone. Run under Node's built-in test runner, no new
 * dependency; `scripts/` is not covered by any package's vitest project, so a guard living here
 * has to be a `node:test` file to run at all.
 *
 * WHY A BARE REFERENCE IS A DEFECT HERE. This repository is public. A bare `#<digits>` written in
 * it resolves, for every reader who is not the author, against THIS repository's own issue and PR
 * tracker — so it silently names a wrong, unrelated item rather than the one the author meant.
 * That is worse than a reference that merely fails to resolve: a dangling pointer announces
 * itself, and a retargeted one does not.
 *
 * NO NUMBER IS EXEMPT, including one that names a pull request of this repository. That exemption
 * existed and is withdrawn: the public repository starts from FRESH HISTORY, so a number correct
 * today names nothing on day one there, and then names a real and unrelated item as the tracker
 * fills. A citation worth keeping is a citation of what the change DID, written in words, which
 * is the only form that survives the move.
 *
 * THE REGEX, stated rather than left to be read off the source:
 *
 *     /(?<!\w)#(\d{1,4})(?!\d)/g
 *
 * The lookbehind excludes exactly one shape: a word character directly before the `#`, which is
 * what a fully qualified `owner/repo#N` reference always has right there (`repo` ends in a word
 * character), so any `owner/repo#N` or `repo#N` spelling is excluded by construction rather than
 * by a list of spellings. Nothing else is excused by this lookbehind. A URL or SVG fragment
 * written directly after `url(` or `href=` and a quote (`url(#N)`, `href="#N"`) is excused
 * separately, by `isLawfulNonReference`'s own clause below. A fragment after a path segment
 * (`url(dir/#N)`, `href="page/#N"`) is not, and is reported: no such spelling exists in this
 * repository today, so that residual is pinned as a reported row below rather than fenced out.
 * Widen that clause, not this lookbehind, if a real one ever appears.
 *
 * THE CLASS USED TO ALSO CARRY `-` AND `/` MEMBERS, BOTH REMOVED because they excluded the wrong
 * population. The stated reason for both was the same "qualified form" reasoning above, but a
 * qualified reference's repo segment ends in a word character, never a bare hyphen or slash, so
 * neither excluded a single qualified spelling. What `-` silently excluded instead was this
 * repository's own hyphenated-prefix prose for "before/after issue N" (a hyphen directly followed
 * by a bare reference, e.g. `pre-` or `post-` immediately before the `#`), and what `/` silently
 * excluded was prose ending a path-like segment directly before a bare reference (e.g. `R27/`
 * immediately before the `#`). Both are the bare form this guard exists to catch, not a spelling
 * to spare, and every such site was swept across the tree with its reasoning relocated into words,
 * per this file's own rule. Removing `/` also exposed three test fixtures that were never
 * references at all: regex literals asserting on another script's printed `#<number>` output
 * format. Those keep their digits and spell the `#` apart instead, as the rows in this file do.
 * The rows below pin the general property rather than a list of characters: no character other
 * than a word character directly before the `#` excuses a reference.
 *
 * The digit run is capped at four and `.css` files are skipped from the main
 * scan, both for one reason: a CSS hex colour is also a `#` followed by digits, and an all-decimal
 * one (`#001122`) is indistinguishable from an issue number by shape alone. Four digits covers
 * every issue number this project can reach for the life of these pins while excluding the 6- and
 * 8-digit hex forms outright; the 3- and 4-digit shorthands are what the `.css` skip covers. A
 * sibling pass closes the gap that skip opens, by re-scanning only the COMMENT BODIES of the
 * skipped `.css` files, where no lawful hex colour can ever occur. An all-decimal hex written in a
 * non-CSS file (a `.ts` colour literal, say) remains a known residual of this shape, exactly as it
 * is for the core guard this mirrors.
 *
 * THIS FILE USED TO CLAIM "EVERY AREA IS ZERO-ASSERTED ... there is no residue to carry", and
 * that claim was false. It named five areas (`packages/{core,bridge,cli,tokens}/`, `scripts/`)
 * as though their union were the whole repository, and `.github/`, `docs/` and the repository
 * root sat outside every one of them, scanned by nothing. Seven genuine bare references
 * survived there across four prior sweep slices, found only because a fifth pass happened to
 * look outside the named areas, not because anything here would have caught them. A guard that
 * only ever asserts "zero within the areas I remembered to name" can read green while the
 * repository it protects is not, and that is precisely the shape of the miss. The lesson worth
 * keeping: framing this property PER AREA, rather than over the tracked tree as a whole, is
 * what let three directories of a public repository sit outside every named area for four
 * slices running. The fix is the repo-wide test below, which enumerates `git ls-files` with NO
 * pathspec at all, so nothing can be left off the list because nobody thought to add it. The
 * five per-area tests stay — a red naming `packages/tokens/` is cheaper to act on than a red
 * naming a bare file path somewhere in the tree — but they no longer carry the property by
 * themselves; the repo-wide assertion is what actually holds it now.
 *
 * Reaching zero took the exclusion set below as well as the sweep, and the two are not the same
 * act. Sixty-three of those 327 sites were never references: a `#` followed by digits is also a
 * hex colour, an HTML numeric character reference and a URL fragment, and this file used to count
 * all three. The sweep could not have removed them, because several are fixtures that exist
 * precisely to pin those spellings. Zero therefore means "no bare reference", not "no `#` followed
 * by digits", and `isLawfulNonReference` is where that distinction lives.
 *
 * Raising any of these counts off zero is the regression this guard exists to catch: it is a new
 * bare reference entering a public repository.
 *
 * Files are enumerated with `git ls-files`, never a directory walk, so gitignored `dist/`,
 * `node_modules/` and `coverage/` are excluded for free: they are never tracked in the first
 * place. Every tracked file in the five scanned areas is text (verified: the only extensionless
 * ones are the four package `LICENSE` files), so this needs no binary-extension skip.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * THERE USED TO BE AN ALLOWLIST HERE, AND IT IS GONE RATHER THAN LEFT EMPTY. It held two
 * numbers that named pull requests of the repository this code is developed in today, on the
 * reasoning that a reference resolving for a reader is worth keeping. That reasoning does not
 * survive the move to the public repository: it starts from fresh history, so those numbers
 * name nothing on day one and come to name real, unrelated items as it fills up. A reference
 * that silently retargets is the exact misdirection this guard exists to prevent, and it is
 * worse than a dangling one because nothing about it looks wrong.
 *
 * So no bare number was ever going to be admissible again, which made the emptied set itself
 * dead code: an always-empty `Set` plus the `.filter(...)` reading it does nothing a reader
 * could not already tell from this paragraph, and a live-looking mechanism with nothing left to
 * do is an invitation for the next contributor to repopulate it "just this once". Deleting both
 * is what makes the withdrawal permanent instead of merely documented; this paragraph is kept
 * exactly where the constant used to live so the reasoning is not lost with the code. A pull
 * request worth citing is cited by what it DID, in words, which survives any repository move.
 */

/**
 * A bare `#<digits>`, fenced as the docblock above describes.
 */
const BARE_ISSUE_REF = /(?<!\w)#(\d{1,4})(?!\d)/g

/**
 * A `#` followed by digits that is lawfully NOT an issue reference. Judged on the characters
 * around the match rather than on the number, because the number carries no information: the same
 * three digits are a colour in one file and an issue reference in another.
 *
 * WHY THIS EXISTS. Every area of this repository was count-pinned rather than zero-pinned, and
 * 63 of the 327 pinned sites were never references at all. Several of them are fixtures that pin
 * these very shapes (`build-step.test.ts`'s false-positive taxonomy, the seed-form parser's hex
 * widths), so they cannot be reworded away: the test that owns them exists to assert that this
 * exact spelling occurs. Counting them meant the pins measured the guard's own imprecision mixed
 * in with the property it is named for, and no amount of sweeping could reach zero.
 *
 * Each clause is narrow on purpose. The wide version of this — "a `#` preceded by a colon or a
 * quote is a colour" — would also swallow a changelog's `Fixed:` line followed by a bare number,
 * which is a real reference in the one spelling changelogs use. The fences below hold both
 * directions, and the second set is what stops a future widening from buying zero by going blind.
 *
 * THE TAIL IS GATED, NOT OPEN-ENDED. A first version of this ran `[^;{]*$` after the property
 * name and operator — everything to end of line, stopped only by `;` or `{` — so a colour
 * keyword ANYWHERE earlier on the line excused a real reference written anywhere after it, no
 * matter how unrelated the two were: a hex colour value followed by ", see " and a bare
 * reference, all on one `background:` line, read as one declaration and excused the reference.
 * Two fixes, both load-bearing. First, `}` now terminates the tail exactly like `;` and `{` do,
 * so a closed declaration block does not reach past its own close (a bare reference written
 * after a `color: red }` on the same line is no longer excused by it). Second, and this is the
 * one that actually closes the class, the tail itself is no longer "any character" — it is a
 * repeated CSS_VALUE_TOKEN, so the text between the operator and the `#` under test has to look
 * like an actual CSS value (whitespace, punctuation, numbers with units, hex tokens, a function
 * name immediately followed by `(`, or a small named set of CSS value keywords) rather than
 * prose. An alphabetic word that is none of those — "see", "cast", "was" — cannot be consumed by
 * the token pattern, so the whole match fails to reach the `$` anchor and the reference reports.
 *
 * ONE RESIDUAL FAMILY STAYS EXCLUDED, AND NO RULE KEYED ON SURROUNDING CHARACTERS CAN CLOSE IT,
 * because in each member the bytes are genuinely ambiguous rather than merely under-classified.
 * Three shapes belong to it: a quoted three-digit token (`ingestSeed('#123')`, where the quoted
 * digits are a real three-digit colour written identically to a quoted reference); a
 * six-character run right after the digits (`#150abc`, a real hex-colour spelling of that width,
 * indistinguishable from a three-digit reference followed by three unrelated letters); and a bare
 * colour-property value (`outline: #150`, which stays valid CSS under the exact declaration
 * syntax a bare reference would sit in). In every member the digits carry no information at
 * all — only the surrounding context does — and in these three the
 * context reads identically for a colour and for a reference, which is the guard's own point
 * turned back on itself. This is a bounded, known residual of one shape, not a gap to be closed
 * by widening the exclusions further: widening is exactly how the earlier count-pinned version of
 * this guard bought a lower count by going blind, and re-opening that path here would trade a
 * named residual for an unnamed one.
 */
const CSS_VALUE_KEYWORDS = [
  // border/outline shorthand styles — the actual value grammar of the properties this regex
  // gates on (`border`, `outline`).
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
  'hidden',
  'none',
  // generic CSS-wide keywords that can legitimately sit in a colour-bearing value.
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'auto',
].join('|')
// The numeric branch is forced MAXIMAL with a trailing `(?![\d.])`: without it, `\d+` sitting
// inside an alternation that is itself starred lets a run of N digits be partitioned in
// 2^(N-1) ways, and when the tail then fails to reach `$` the engine walks every partition
// before giving up — a committed line carrying 35+ consecutive digits followed by prose hangs
// the process rather than reporting the reference. The lookahead refuses any partition that
// stops short of the run's actual end, so there is only ever one way to consume a digit run and
// the exponential blow-up has nothing left to branch on. See the linearity test below for the
// measured before/after.
const CSS_VALUE_TOKEN = String.raw`(?:\s|[,()'"/]|\d+(?:\.\d+)?[a-z%]*(?![\d.])|#[0-9a-fA-F]+|[a-zA-Z][\w-]*(?=\()|\b(?:${CSS_VALUE_KEYWORDS})\b)`
const COLOUR_DECLARATION = new RegExp(
  String.raw`(?:color|background|border|outline|fill|stroke|shadow|gradient|light-dark)[\w-]*\s*[:(=]\s*${CSS_VALUE_TOKEN}*$`,
  'i',
)
const HEX_WIDTHS = new Set([3, 4, 6, 8])

function isLawfulNonReference(text, matchIndex, digits) {
  // An issue number never carries a leading zero, so `#0`, `#000` and `#00ff00` are colours.
  if (digits.startsWith('0')) return true

  const after = text.slice(matchIndex + 1 + digits.length)
  // A hex letter (or digit) straight after the digit run means the match MAY be a prefix of a
  // longer hex token (`#3366ff`, `#2d6`, `#222D5C`) — but only excuse it when digits-plus-run
  // together form a token of a REAL hex-colour width (3, 4, 6 or 8). A five-character run or a
  // seven-character run (three digits plus two, respectively four, trailing hex letters) is not
  // spellable as a CSS hex colour at all, so nothing legitimate was being protected by excusing
  // them, and they now report (see the dedicated test below for the exact examples). A
  // six-character run stays excused: it genuinely is six valid hex characters and a real
  // hex-colour spelling, and no rule keyed on the surrounding characters can tell it apart from a
  // reference — this tightens the impossible widths only, it does not and cannot claim to close
  // the shape.
  const trailingHex = /^[0-9a-fA-F]*/.exec(after)[0]
  if (trailingHex.length > 0 && HEX_WIDTHS.has(digits.length + trailingHex.length)) return true

  const before = text.slice(0, matchIndex)
  // An HTML numeric character reference: `&#8202;`.
  if (before.endsWith('&')) return true
  // A URL or SVG fragment identifier: `url(#123)`, `href="#123"`, `xlink:href='#456'`.
  if (/(?:url\(|href\s*=\s*["'])$/i.test(before)) return true
  // A colour written in a CSS declaration, a presentation attribute, or a colour function, where
  // the property or function name immediately before the `#` says what the digits are.
  if (COLOUR_DECLARATION.test(before)) return true
  // A quoted token that is nothing but digits of a hex-colour width: `'#123'`, `"#2d6"`. The
  // closing quote has to match the opening one and follow the digits directly, so a reference
  // quoted inside a sentence, with prose either side of it, is untouched.
  const quote = before.slice(-1)
  return (
    (quote === "'" || quote === '"') && after.startsWith(quote) && HEX_WIDTHS.has(digits.length)
  )
}

/**
 * Matches a block comment and captures its body, across as many lines as it spans. Used only to
 * re-scan the `.css` files the main pass skips: a comment body can never contain a lawful hex
 * colour (those only occur in declarations), so running `BARE_ISSUE_REF` over comment bodies
 * excludes hex colours by construction, with none of the digit-count guesswork the main pass needs.
 */
const CSS_COMMENT = /\/\*([\s\S]*?)\*\//g

// `area` is OPTIONAL: omitted (or falsy), `git ls-files` runs with no pathspec at all, which is
// what makes the repo-wide test below actually repo-wide rather than a maintained list of areas
// someone has to remember to extend. Passing an area keeps the five per-area tests scoped and
// cheap to act on.
function listTrackedFiles(area) {
  const args = area ? ['ls-files', '-z', '--', area] : ['ls-files', '-z']
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((line) => line.length > 0)
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length
}

/**
 * The disallowed bare references in a NON-CSS file, one entry per occurrence, each carrying the
 * 1-based line it sits on.
 */
function sitesInText(text) {
  return text
    .split('\n')
    .flatMap((line, index) =>
      [...line.matchAll(BARE_ISSUE_REF)]
        .filter((ref) => !isLawfulNonReference(line, ref.index ?? 0, ref[1]))
        .map((ref) => ({ line: index + 1, n: Number(ref[1]) })),
    )
}

/**
 * The disallowed bare references inside block-comment BODIES only, for the `.css` files the main
 * pass skips. Declarations, where a hex colour could appear, are never visited. The line is
 * computed from the absolute offset, since a comment body can span several lines.
 */
function sitesInCssComments(text) {
  return [...text.matchAll(CSS_COMMENT)].flatMap((comment) => {
    const bodyStart = (comment.index ?? 0) + 2
    const body = comment[1] ?? ''
    return [...body.matchAll(BARE_ISSUE_REF)]
      .filter((ref) => !isLawfulNonReference(body, ref.index ?? 0, ref[1]))
      .map((ref) => ({
        line: lineNumberAt(text, bodyStart + (ref.index ?? 0)),
        n: Number(ref[1]),
      }))
  })
}

/**
 * Every disallowed bare reference under `area`, as `file:line` SITES rather than as a count or a
 * set of numbers: a red naming only numbers leaves the reader to grep for them, and a gate whose
 * failure is work to read is a gate that gets skipped. The count assertions below read
 * `sites.length`, so a pinned count always arrives with the sites that make it up.
 */
function bareIssueRefSites(area) {
  return listTrackedFiles(area).flatMap((relPath) => {
    const text = readFileSync(path.join(ROOT, relPath), 'utf8')
    const found = relPath.endsWith('.css') ? sitesInCssComments(text) : sitesInText(text)
    return found.map(({ line, n }) => `${relPath}:${line}  #${n}`)
  })
}

const QUALIFY =
  'state the reason in words and drop the number. No qualified spelling is admissible ' +
  'either: a private tracker is unreachable, and this repository starts from fresh history, ' +
  'so its own numbers will name unrelated items'

// Asserted as "nothing disallowed" rather than as set equality, so deleting or rewording a
// comment that happens to carry one of the allowed public-PR references is not itself a failure:
// the property pinned is the absence of a bad reference, never the continued presence of a good
// one.
test('ZERO: no bare issue reference under packages/core/', () => {
  assert.deepEqual(bareIssueRefSites('packages/core/'), [], QUALIFY)
})

test('ZERO: no bare issue reference under packages/bridge/', () => {
  assert.deepEqual(bareIssueRefSites('packages/bridge/'), [], QUALIFY)
})

test('ZERO: no bare issue reference under packages/cli/', () => {
  assert.deepEqual(bareIssueRefSites('packages/cli/'), [], QUALIFY)
})

test('ZERO: no bare issue reference under packages/tokens/', () => {
  assert.deepEqual(bareIssueRefSites('packages/tokens/'), [], QUALIFY)
})

test('ZERO: no bare issue reference under scripts/', () => {
  assert.deepEqual(bareIssueRefSites('scripts/'), [], QUALIFY)
})

// THE PROPERTY THAT ACTUALLY HOLDS IT: the five tests above name five areas, and `.github/`,
// `docs/` and the repository root are not any of them. Seven genuine bare references lived in
// exactly that gap across four prior sweep slices. `bareIssueRefSites()` with no argument calls
// `listTrackedFiles()` with no area, which runs `git ls-files` with no pathspec — the whole
// tracked tree, so nothing can be left off the list because nobody thought to name it.
test('ZERO: no bare issue reference anywhere in the tracked tree', () => {
  assert.deepEqual(bareIssueRefSites(), [], QUALIFY)
})

// A bare fixture has to be COMPOSED rather than written literally: this file lives in `scripts/`,
// so a literal one would be counted by this file's own pin above and would make the guard report
// itself as an offender.
const HASH = '#'

// The fences, held rather than only described: each of these would be a silent hole in the pins
// above if it ever stopped holding.
test('the qualified forms are excluded, and the same number written bare is not', () => {
  const qualified = 'see owner/repo#343, some-owner/some-repo#102 and repo#74'
  assert.deepEqual([...qualified.matchAll(BARE_ISSUE_REF)], [])
  assert.deepEqual(
    [...`see ${HASH}343 for the ruling`.matchAll(BARE_ISSUE_REF)].map((m) => m[1]),
    ['343'],
  )
})

// The class used to also carry a `/` member, which excused these two shapes by mistake (see the
// docblock above `BARE_ISSUE_REF` for the full history). Pinned here so the class cannot quietly
// regain it.
test('a slash directly before the hash no longer excuses a genuine reference', () => {
  assert.deepEqual(
    [...`see word${HASH}123 here`.matchAll(BARE_ISSUE_REF)],
    [],
    'a word character immediately before the hash still excludes this (unaffected by this fix)',
  )
  assert.deepEqual(
    [...`see a/${HASH}123 here`.matchAll(BARE_ISSUE_REF)].map((m) => m[1]),
    ['123'],
    'a slash immediately before the hash no longer excludes a bare-prose reference',
  )
  assert.deepEqual(
    [...`the R27/${HASH}409 measurement`.matchAll(BARE_ISSUE_REF)].map((m) => m[1]),
    ['409'],
    'the same shape written as bare prose citing a requirement number',
  )
})

// The lookbehind's whole contract, pinned as a property rather than as the two characters it
// has already had to lose: no character other than a word character directly before the hash
// excludes a reference. A new punctuation member added to the class reds here even before any
// site in the tree uses that spelling.
test('only a word character directly before the hash excludes a reference', () => {
  const nonWord = [
    '/',
    '-',
    '.',
    ',',
    ';',
    ':',
    '!',
    '?',
    '@',
    '#',
    '$',
    '%',
    '^',
    '&',
    '*',
    '+',
    '=',
    '~',
    '`',
    '|',
    '<',
    '>',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    '"',
    "'",
    '\\',
    ' ',
  ]
  for (const c of nonWord) {
    assert.deepEqual(
      [...`x${c}${HASH}12 y`.matchAll(BARE_ISSUE_REF)].map((m) => m[1]),
      ['12'],
      `${JSON.stringify(c)} directly before the hash must not excuse a reference`,
    )
  }
  for (const c of ['a', 'Z', '0', '_']) {
    assert.deepEqual(
      [...`x${c}${HASH}12 y`.matchAll(BARE_ISSUE_REF)],
      [],
      `${JSON.stringify(c)} is a word character and still excludes the reference`,
    )
  }
})

// A fragment after a path segment is outside the `url(`/`href=` clause and is reported (see the
// docblock above `BARE_ISSUE_REF`). Pinned so that residual is a stated trade, not a surprise.
test('a URL fragment after a path segment is reported, not excused', () => {
  const reported = (text) => sitesInText(text).map((site) => site.n)
  assert.deepEqual(reported(`see url(dir/${HASH}123) here`), [123])
  assert.deepEqual(reported(`<a href="page/${HASH}456">`), [456])
  assert.deepEqual(
    reported(`<use href="${HASH}456" />`),
    [],
    'control: the direct form stays excused',
  )
})

test('a six-digit hex colour is out of range, and a CSS comment body is still scanned', () => {
  assert.deepEqual([...'body { color: #001122; }'.matchAll(BARE_ISSUE_REF)], [])
  const css = `/* see ${HASH}343 for the ruling */\n.a { color: #001122; }\n`
  const bodies = [...css.matchAll(CSS_COMMENT)].map((c) => c[1])
  assert.deepEqual(
    bodies.flatMap((b) => [...b.matchAll(BARE_ISSUE_REF)].map((m) => m[1])),
    ['343'],
  )
})

// THE LAWFUL NON-REFERENCE SHAPES, one fence per shape.
//
// A `#` followed by digits is not by itself an issue reference. Four other things in this
// repository spell themselves the same way, and none of them can be rewritten away, because in
// several cases the fixture that carries the shape exists precisely to pin that shape: a hex
// colour literal, an HTML numeric character reference, a URL or SVG fragment identifier, and a
// colour written in a CSS declaration. Counting them made the pins measure noise instead of the
// property the guard is named for, which is what kept every area off zero. Each row below states
// a shape the scan must NOT report; the row after them states the ones it still must.
//
// Every sample is COMPOSED from `HASH` rather than written out, for the reason that constant
// already exists: a literal here would be scanned by this file's own zero-assertion above and
// would make the guard report its own fixtures as offenders. It also keeps the samples stable
// under the formatter, which rewrites quoting and once split an `href='` away from the digits it
// qualifies, turning a passing fence red for a reason that had nothing to do with the rule.
const LAWFUL_NON_REFERENCES = [
  // A leading zero: an issue number never has one, so `#0`, `#000` and `#00ff00` are colours.
  [`$value: '${HASH}000'`, 'three-digit hex, leading zero'],
  [`brand: { x: { $type: 'color', $value: '${HASH}00ff00' } }`, 'six-digit hex, leading zero'],
  // This fixture does NOT exercise the `light-dark` clause below, despite appearances: `#fff`
  // has no digits, so `BARE_ISSUE_REF` never matches it at all, and `#000` short-circuits on the
  // leading-zero rule immediately above, before `COLOUR_DECLARATION` is ever evaluated. It stays
  // because it is still a lawful fixture in its own right (a leading-zero one), but the clause's
  // real coverage is the non-zero-leading pair further down.
  [
    `'light-dark(${HASH}fff, ${HASH}000)'`,
    'hex pair inside a colour function (leading-zero half only; see light-dark row below)',
  ],
  // A hex letter immediately after the digit run: the match was a prefix of a longer hex token.
  [`const seed = '${HASH}3366ff'`, 'six-digit hex whose first four characters are digits'],
  [`{ input: '${HASH}2d6', label: '3-digit hex' }`, 'three-digit hex ending in a letter'],
  [`\`${HASH}3366ff\` is what they typed`, 'hex token inside prose'],
  // An HTML numeric character reference.
  [`'&${HASH}8202;'`, 'numeric character reference'],
  // A URL or SVG fragment identifier.
  [`'background: url(${HASH}123);'`, 'url() fragment'],
  [`'<use href="${HASH}123" />'`, 'href fragment'],
  [`"<use xlink:href='${HASH}456' />"`, 'xlink:href fragment'],
  // A colour in a CSS declaration, where the property name says what the digits are.
  [`body { background: ${HASH}f6f6f6; color: ${HASH}111; }`, 'colour declaration'],
  [`background: linear-gradient(${HASH}111, ${HASH}222)`, 'colour inside a gradient'],
  [`outline: 2px solid ${HASH}123`, 'colour in a shorthand declaration'],
  [`<rect fill="${HASH}369" />`, 'colour in a presentation attribute'],
  // A quoted, pure-digit token of hex-colour width, with nothing else inside the quotes.
  [`const actual = ingestSeed('${HASH}123')`, 'quoted three-digit colour argument'],
  // The `light-dark` clause, exercised with digits that actually reach it (see the comment on
  // the leading-zero `light-dark` row above for why that one does not).
  [
    `'light-dark(${HASH}123, ${HASH}456)'`,
    'light-dark clause exercised with non-zero-leading digits',
  ],
]

for (const [sample, shape] of LAWFUL_NON_REFERENCES) {
  test(`lawful, not a reference: ${shape}`, () => {
    assert.deepEqual(sitesInText(sample), [], `${shape} must not be reported: ${sample}`)
  })
}

// The other direction, and the reason the exclusions above are written as shapes rather than as a
// blanket "a colon or a quote before the hash". Narrowing far enough to lose these would buy a
// zero by going blind, which is the failure mode a count-pinned guard already had.
test('a genuine bare reference is still reported, in each shape it is written in', () => {
  const reported = (text) => sitesInText(text).map((site) => site.n)
  assert.deepEqual(reported(`Fixed: ${HASH}150`), [150], 'a colon-prefixed prose reference')
  assert.deepEqual(reported(`see ${HASH}343 for the ruling`), [343], 'a mid-sentence reference')
  assert.deepEqual(reported(`(${HASH}150)`), [150], 'a parenthesised reference')
  assert.deepEqual(reported(`Refs ${HASH}452`), [452], 'a trailer-style reference')
  assert.deepEqual(reported(`round 20, ${HASH}407`), [407], 'a reference after a comma')
})

// The class used to also carry a `-` member, which excluded these two shapes by mistake (see
// the docblock above `BARE_ISSUE_REF` for the full history). Pinned here so the class cannot
// quietly regain it.
test('a hyphen directly before the hash no longer excuses a genuine reference', () => {
  const reported = (text) => sitesInText(text).map((site) => site.n)
  assert.deepEqual(reported(`the pre-${HASH}219 shape`), [219], 'a hyphenated "before" prefix')
  assert.deepEqual(reported(`the post-${HASH}204 shape`), [204], 'a hyphenated "after" prefix')
})

// `COLOUR_DECLARATION`'s tail used to run `[^;{]*$` — everything to end of line, stopped only by
// `;` or `{`. A colour keyword anywhere earlier on the line therefore excused a real reference
// written anywhere after it, however unrelated the two were. Each row here is a colour keyword
// legitimately opening a declaration, followed by ordinary prose carrying a real reference on
// the SAME line; every one of them must still report. The control at the end is the one shape
// that already worked before this fix (a `;` already terminated the tail), kept here so a future
// change to the tail cannot silently lose it while fixing something else.
test('a colour keyword earlier on the line does not excuse a later reference', () => {
  const reported = (text) => sitesInText(text).map((site) => site.n)
  assert.deepEqual(
    reported(`background: ${HASH}fff, see ${HASH}150 for details`),
    [150],
    'prose after a real colour value, on the same declaration, must still report',
  )
  assert.deepEqual(
    reported(`the shadow: cast by ${HASH}150 was long`),
    [150],
    'a colour keyword used as an ordinary English word must not excuse a later reference',
  )
  assert.deepEqual(
    reported(`a { color: red } fixed in ${HASH}150`),
    [150],
    'a closed declaration block does not extend past its own closing }',
  )
  assert.deepEqual(
    reported(`color: red; fixed in ${HASH}150`),
    [150],
    'control: a `;`-terminated declaration already reported correctly before this fix',
  )
})

// The hex-letter-after rule used to excuse ANY run of a-f/A-F characters straight after the
// digits, whatever width the resulting token came to. A six-hex-character run is a real,
// spellable hex-colour width and stays excluded; a five-character run and a seven-character run
// are not spellable as a hex colour at all, so nothing legitimate was being protected by excusing
// them, and they now report. This is a bounded fix, not a closed one: see the comment on
// `isLawfulNonReference` for what it does and does not claim.
test('the hex-letter-after exclusion is bounded to real hex-colour widths', () => {
  const reported = (text) => sitesInText(text).map((site) => site.n)
  assert.deepEqual(
    reported(`see ${HASH}150ab for the tag`),
    [150],
    'digits + trailing hex run = 5 characters, not a spellable hex-colour width',
  )
  assert.deepEqual(
    reported(`see ${HASH}150abcd for the tag`),
    [150],
    'digits + trailing hex run = 7 characters, not a spellable hex-colour width',
  )
  assert.deepEqual(
    reported(`see ${HASH}150abc for the tag`),
    [],
    'digits + trailing hex run = 6 characters IS a real hex-colour spelling; stays excluded',
  )
})

// Every width this repository actually uses, pinned in both hex-digit/hex-letter arrangements,
// so a future change to the width bound cannot silently narrow past a real spelling in use today.
test('hex tokens of every real hex-colour width stay excluded, wherever they are written', () => {
  const stillHex = [
    `${HASH}3366ff`,
    `${HASH}2d6`,
    `${HASH}2d6f`,
    `${HASH}27d4c6`,
    `${HASH}27d4c6ff`,
    `${HASH}222D5C`,
    `${HASH}2f6feb`,
    `${HASH}19D3C5`,
    `${HASH}3355ff`,
  ]
  for (const token of stillHex) {
    assert.deepEqual(sitesInText(`see ${token} here`), [], `${token} must stay excluded`)
  }
})

// The `light-dark` clause in `COLOUR_DECLARATION` is what excludes its arguments, not merely
// being inside a pair of parentheses after a comma-separated pair of hashes: an unrecognised
// function name must not borrow the exclusion.
test('an unrecognised function name does not borrow the light-dark exclusion', () => {
  const reported = (text) => sitesInText(text).map((site) => site.n)
  assert.deepEqual(
    reported(`foo(${HASH}123, ${HASH}456)`),
    [123, 456],
    'foo is not a colour-bearing keyword; both arguments must report',
  )
})

/**
 * Runs `COLOUR_DECLARATION.test(input)` inside a worker thread and resolves with the elapsed
 * milliseconds, or `null` if it has not finished within `timeoutMs`. A hard `timeoutMs` bound on
 * `COLOUR_DECLARATION.test()` itself cannot be enforced on the MAIN thread: the call is
 * synchronous and, when it backtracks catastrophically, blocks the event loop outright, so a
 * `setTimeout` racing it on the same thread never gets to fire. Running it inside a `Worker` and
 * calling `worker.terminate()` from a timer on the main thread is the only way to bound it for
 * real, which is exactly why this helper exists instead of a plain `Promise.race`. The regex
 * source and flags are read off the live `COLOUR_DECLARATION` (never re-typed), so this test
 * cannot silently stop covering the actual regex if a future edit changes it.
 */
function measureColourDeclarationOnWorker(input, timeoutMs) {
  return new Promise((resolve) => {
    const workerSource = `
      const { parentPort, workerData } = require('node:worker_threads')
      const re = new RegExp(workerData.source, workerData.flags)
      const t0 = Date.now()
      re.test(workerData.input)
      parentPort.postMessage(Date.now() - t0)
    `
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { source: COLOUR_DECLARATION.source, flags: COLOUR_DECLARATION.flags, input },
    })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      worker.terminate()
      resolve(null)
    }, timeoutMs)
    worker.once('message', (elapsedMs) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      resolve(elapsedMs)
    })
    worker.once('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(null)
    })
  })
}

// CSS_VALUE_TOKEN's numeric branch used to be a bare `\d+(?:\.\d+)?[a-z%]*`, sitting inside an
// alternation that is itself repeated with `*`. A run of N digits can be split across that
// alternation in 2^(N-1) ways (any prefix can be consumed by one iteration, the remainder by the
// next), and when the tail beyond the digit run then fails to reach the trailing `$` anchor, the
// engine backtracks through every one of those partitions before giving up — classic catastrophic
// backtracking, ambiguous alternation over `\d+` under a `*`. A committed line carrying a long
// enough run of digits followed by ordinary prose (35+ digits was enough to hang for minutes)
// froze `pnpm run ci:check` rather than reporting the reference. The fix makes the numeric token
// MAXIMAL with a trailing `(?![\d.])`: a partition that stops short of the run's true end is now
// refused outright, so there is exactly one way to consume a digit run and nothing is left to
// branch on. This row is RED before that lookahead exists and GREEN after; if a future edit
// reintroduces the ambiguity (for instance by widening the numeric branch again without
// re-adding the lookahead), this test times out and reds rather than the next hung CI job doing
// the catching.
test(
  'CSS_VALUE_TOKEN stays linear: a long digit run must not catastrophically backtrack',
  async () => {
    const TIMEOUT_MS = 3000
    const pathological = `color: ${'1'.repeat(40)} see `
    const elapsedMs = await measureColourDeclarationOnWorker(pathological, TIMEOUT_MS)
    assert.ok(
      elapsedMs !== null,
      `COLOUR_DECLARATION.test() on a 40-digit run did not finish within ${TIMEOUT_MS}ms; the ` +
        'numeric branch of CSS_VALUE_TOKEN has regained ambiguous alternation over `\\d+` under ' +
        'a `*` and is catastrophically backtracking again',
    )
    assert.ok(
      elapsedMs < 50,
      `COLOUR_DECLARATION.test() took ${elapsedMs}ms on a 40-digit run; expected well under a ` +
        'millisecond for a linear-time match',
    )
  },
  { timeout: 10_000 },
)
