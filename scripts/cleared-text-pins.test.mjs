/**
 * A BACKSTOP, NOT A GATE, ON PROSE THAT WAS REVIEWED BEFORE IT SHIPPED.
 *
 * Some of the plain-English text in this repository's contributor and consumer-facing surfaces
 * states a term of the project rather than describing what the code does: the contributor
 * licence terms and the Developer Certificate of Origin in `.github/CONTRIBUTING.md`, the licence
 * checklist and affirmation in the pull request template, the whole of `TRADEMARKS.md`, and the
 * `README.md` sections stating what this project promises and does not promise about
 * accessibility. Each of those passages was reviewed and agreed before it shipped. THIS TEST
 * PINS EACH ONE AGAINST A DIGEST TAKEN AT THAT MOMENT AND FAILS IF THE SHIPPED BYTES MOVE.
 *
 * THIS TEXT WAS REVIEWED AND AGREED BEFORE IT SHIPPED. If this test fails because you changed
 * one of the pinned passages, that is not a test to fix: it is a change to the project's terms,
 * and it needs the same review the current wording had, not a recomputed hash. Open an issue
 * describing what should change and why, get the maintainer's agreement, and only then update
 * the pinned digest below to match the newly agreed wording. If the failure instead comes from
 * something else moving the same bytes by accident (a reflow, a merge, a generated header), no
 * review is owed and the fix is exactly that: restore the wording.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. A green run here shows only that the pinned bytes have
 * not moved since somebody recorded their digest. It does NOT show that the recorded digest is
 * itself correct, that the wording is legally sound, or that a passage not listed here needs no
 * review of its own — this file is not exhaustive over the repository, only over the passages
 * enumerated below. Treat a red run as "this text moved", never as "this text is wrong", and a
 * green run as "this text is unchanged", never as "this text was checked here for the first
 * time".
 *
 * WHY A DIGEST AND NOT A SECOND COPY OF THE WORDING. Typing the reviewed sentences into this file
 * a second time would create exactly the drift hazard this guard exists to catch: a later editor
 * who changes the shipped file would see this file's copy sitting right next to it and update
 * both together, "in sync", which is indistinguishable from the file simply having no guard at
 * all. A digest can only be right, red, or deliberately recomputed after a real review, and
 * recomputing it is a visibly different act from editing prose. So every pin below is a hash, and
 * a failing assertion prints the CURRENT text read from the file being checked, never a second
 * stored copy, so a reader can see what changed without this file ever holding it.
 *
 * WHY WHITESPACE-COLLAPSED, NOT RAW BYTES, FOR MOST PINS. This project's standing practice is
 * that a passage is cleared as WORDS: reflowing the same words across different line breaks is
 * not a re-wording and does not need a fresh review, while changing a word does. So most pins
 * below compare the SHA-256 of the text with every run of whitespace folded to one space and the
 * ends trimmed, which is insensitive to exactly that kind of harmless reflow and sensitive to
 * everything else. The one exception is the Developer Certificate of Origin text, which is a
 * third party's document reproduced verbatim under its own "changing it is not allowed" notice:
 * that one is pinned on its raw bytes, including its own line breaks, because nothing about it is
 * this project's wording to reflow.
 *
 * LOCATION, NOT CONTAINMENT. A plain substring search would pass a cleared paragraph moved
 * anywhere else in the file, including into the middle of the Developer Certificate of Origin's
 * own fenced block — a paragraph relocated there would still be "in the file", and simple
 * containment cannot tell the difference. Every pin below is instead LOCATED first: inside a
 * named section of the file, as the one paragraph whose first line matches a fixed pattern, and
 * outside every fenced code block. Extraction that finds zero or more than one match throws
 * immediately, distinctly, and BEFORE any digest is compared: a location failure must never fall
 * through to comparing an empty or wrong string against a pin, which would either miss a real
 * change or invent one. This still asserts only what it names: it says nothing about whether the
 * surrounding document, or a passage this file does not enumerate, still means what it meant.
 *
 * WHY THIS FILE, AND NOT A PACKAGE'S OWN TEST SUITE. Every passage pinned here lives at the
 * repository root or under `.github/`, which belongs to no package, so it has no existing home.
 * Cleared text that already has a package-local guard (for example the re-theming notice and the
 * consumer-facing contrast note in `packages/tokens`, each checked against its own source
 * constant) is deliberately NOT re-pinned here: a second digest for one passage is the very drift
 * hazard this file exists to prevent, one level down.
 *
 * WIRING. This file matches `scripts/*.test.mjs`, which `scripts:test` already runs and
 * `ci:check` already chains, so it enters the build by existing: nothing else needed a change for
 * this guard to run on every pull request.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ALLOWLIST_FAILURE_GUIDANCE } from './check-license-allowlist.mjs'
import { fences, headingLines, sectionRange } from './readme-sections.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), 'utf8')
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function fold(text) {
  return text.split(/\s+/).filter(Boolean).join(' ')
}

/**
 * Thrown by extraction, never by a digest mismatch: a distinct class so a location failure
 * (wrong section, wrong count, inside a fence) cannot be mistaken for a wording change, and so it
 * is impossible to fall through to comparing an empty string.
 */
class LocateError extends Error {}

/**
 * The maximal runs of consecutive non-blank lines in `lines[start, end)`, skipping every line
 * that sits inside a fenced code block (per `fences()`, reused from `readme-sections.mjs` rather
 * than re-parsed). A fenced line is treated as a gap, never as prose: this is what makes a
 * paragraph search structurally unable to find a cleared paragraph that has been relocated inside
 * a fence, which is the mutation this repository's own contributor guide names as the one
 * containment alone would miss.
 *
 * A TOP-LEVEL LIST ITEM (a line starting `- `, unindented) ALSO STARTS A NEW PARAGRAPH, even with
 * no blank line before it: `CONTRIBUTING.md`'s "Making changes" bullets run back to back with no
 * blank line between them, so a blank-line-only splitter would merge every bullet in the list into
 * one paragraph and this file's own first-line patterns would never match the one bullet they
 * name. A continuation line of a list item is indented and does not trigger this.
 */
function paragraphsOutsideFences(doc, range) {
  const { lines, fenceLines } = doc
  const paragraphs = []
  let current = []
  let currentFrom = -1
  const flush = () => {
    if (current.length > 0) paragraphs.push({ from: currentFrom, lines: current })
    current = []
    currentFrom = -1
  }
  for (let i = range.start; i < range.end; i += 1) {
    const line = lines[i]
    if (line.trim() === '' || fenceLines.has(i)) {
      flush()
      continue
    }
    if (line.startsWith('- ') && current.length > 0) flush()
    if (current.length === 0) currentFrom = i
    current.push(line)
  }
  flush()
  return paragraphs
}

/**
 * Locates exactly one paragraph inside `doc` (`{ lines, fenceLines }`) restricted to `range`
 * (a section's `{ start, end }` line range, both 0-indexed) whose first line matches
 * `spec.firstLine`, asserts it is exactly `spec.lineCount` lines long, and returns it joined with
 * `\n`. Throws `LocateError` — never returns an empty or partial match — if zero or more than one
 * paragraph matches, or if the match's length is wrong: a line silently added to or removed from
 * reviewed text is exactly the kind of change a digest mismatch alone would still catch, but
 * naming it as a COUNT mismatch here gives a more specific first reading than a bare hex-string
 * diff would.
 */
function locateParagraph(doc, range, label, spec) {
  const matches = paragraphsOutsideFences(doc, range).filter((p) => spec.firstLine.test(p.lines[0]))
  if (matches.length !== 1) {
    throw new LocateError(
      `expected exactly one paragraph matching ${spec.firstLine} for "${label}" in this section, found ${matches.length}`,
    )
  }
  const [match] = matches
  assert.equal(
    match.lines.length,
    spec.lineCount,
    `"${label}" is expected to be exactly ${spec.lineCount} lines long; found ${match.lines.length}. A line added to or removed from reviewed text is a wording change, never a re-wrap`,
  )
  return match.lines.join('\n')
}

/**
 * Asserts that `text`'s whitespace-collapsed SHA-256 equals `expectedSha256`. This is the BINDING
 * form for every pinned passage except the Developer Certificate of Origin (see the module
 * docblock): a pure re-wrap never changes it, so a red run here can only mean the words moved.
 */
function assertClearedText(label, text, expectedSha256) {
  const folded = fold(text)
  const actual = sha256(folded)
  assert.equal(
    actual,
    expectedSha256,
    `"${label}" no longer matches its reviewed wording (expected digest ${expectedSha256}, ` +
      `got ${actual} over the whitespace-folded text below). This text was reviewed and agreed ` +
      `before it shipped: changing it is a change to the project's terms and needs the same ` +
      `review, not a test fixup. If the wording changed, open an issue proposing the new ` +
      `wording and get the maintainer's agreement before updating this pin. Current text:\n\n${text}`,
  )
}

/**
 * The text of a heading's whole section, HEADING INCLUDED, from `lines[range.start]` up to (but
 * not including) the next heading, with any trailing blank separator lines trimmed off the end.
 * This differs on purpose from `readme-sections.mjs`'s own `bodyOf`, which excludes the heading:
 * every section pinned in this file is compared for EQUALITY as one whole unit, heading and all,
 * because that is how its reviewed digest was originally taken.
 */
function wholeSectionText(lines, range) {
  let end = range.end
  while (end > range.start + 1 && lines[end - 1].trim() === '') end -= 1
  return lines.slice(range.start, end).join('\n')
}

/**
 * Asserts `text`'s raw (unfolded) SHA-256 equals `expectedSha256`: for the one passage in this
 * file that is not this project's wording to reflow (see the module docblock).
 */
function assertVerbatim(label, text, expectedSha256) {
  const actual = sha256(text)
  assert.equal(
    actual,
    expectedSha256,
    `"${label}" no longer matches its required verbatim text (expected digest ${expectedSha256}, ` +
      `got ${actual}). This text is a third party's document reproduced verbatim under its own ` +
      `"changing it is not allowed" notice: it is never reworded and never reflowed. Current text:\n\n${text}`,
  )
}

// ---------------------------------------------------------------------------------------------
// .github/CONTRIBUTING.md
// ---------------------------------------------------------------------------------------------

const CONTRIBUTING = read('.github/CONTRIBUTING.md')
const CONTRIBUTING_LINES = CONTRIBUTING.split('\n')
const CONTRIBUTING_HEADINGS = headingLines(CONTRIBUTING_LINES)
const CONTRIBUTING_FENCE_LINES = fences(CONTRIBUTING).reduce((set, fence) => {
  for (let i = fence.from; i <= fence.to; i += 1) set.add(i)
  return set
}, new Set())
const CONTRIBUTING_DOC = { lines: CONTRIBUTING_LINES, fenceLines: CONTRIBUTING_FENCE_LINES }

/**
 * A section's paragraph range, one past its heading line through its own end boundary.
 */
function afterHeading(range) {
  return { start: range.start + 1, end: range.end }
}

test('CONTRIBUTING.md: the "Adding a dependency" change-control item', () => {
  const range = sectionRange(CONTRIBUTING_LINES, CONTRIBUTING_HEADINGS, /^## Making changes\b/, 2)
  const text = locateParagraph(CONTRIBUTING_DOC, afterHeading(range), 'Adding a dependency', {
    firstLine: /^- Adding a dependency:/,
    lineCount: 6,
  })

  // The bullet's closing sentence is shared, word for word, with the licence allow-list gate's
  // own printed guidance, so that a contributor sees the identical repair whichever surface they
  // meet first. That shared sentence has its own source of truth (`ALLOWLIST_FAILURE_GUIDANCE`)
  // and must not be pinned a second time here: this test asserts it is still the same substring
  // of that constant, never a second copy of its bytes. It is stripped off before this
  // paragraph's own digest is taken, so a wording change to that shared sentence is caught over
  // there, and a wording change to this bullet's own opening is caught here, and neither can hide
  // behind the other's clearance.
  const linkPattern = /\[([^[\]]*)\]\(([^()]*)\)/g
  const links = [...text.matchAll(linkPattern)]
  assert.equal(
    links.length,
    1,
    `expected exactly one markdown link in the "Adding a dependency" bullet; found ${links.length}`,
  )
  const stripped = text.replaceAll(linkPattern, '$1')
  const foldedStripped = fold(stripped)

  const sharedTail =
    'open an issue naming the package, its version and its licence, and leave it out of the ' +
    'pull request until that issue is answered.'
  assert.ok(
    foldedStripped.endsWith(sharedTail),
    'the "Adding a dependency" bullet must end with the sentence shared with the licence ' +
      "allow-list gate's own printed guidance",
  )
  assert.ok(
    ALLOWLIST_FAILURE_GUIDANCE.includes(sharedTail),
    'the sentence shared between this bullet and ALLOWLIST_FAILURE_GUIDANCE has drifted apart: ' +
      'update whichever one moved so they read identically again',
  )

  // `.trimEnd()`: the slice below cuts a folded string mid-way, right before the shared tail, so
  // it inherits that boundary's own single separating space. Trimming it keeps `ownWords` in the
  // same canonical (no leading/trailing whitespace) form `fold()` itself always produces, so
  // `assertClearedText`'s own `fold()` call is a true no-op here rather than a second pass that
  // would silently drop that trailing character and change the digest out from under the pin.
  const ownWords = foldedStripped.slice(0, foldedStripped.length - sharedTail.length).trimEnd()
  assertClearedText(
    'CONTRIBUTING.md "Adding a dependency" bullet (own wording)',
    ownWords,
    '923faabde0298f48302e80b75cb5913ec13c577bdc91699b39f133ace9befe9f',
  )
})

test('CONTRIBUTING.md: the "Text the build prints or ships" paragraphs', () => {
  const range = sectionRange(
    CONTRIBUTING_LINES,
    CONTRIBUTING_HEADINGS,
    /^### Text the build prints or ships\b/,
    3,
  )

  const paragraphRange = afterHeading(range)

  assertClearedText(
    'CONTRIBUTING.md printed-text rule, paragraph 1',
    locateParagraph(CONTRIBUTING_DOC, paragraphRange, 'printed-text rule paragraph 1', {
      firstLine: /^Anything this build can print\b/,
      lineCount: 4,
    }),
    '86167c6340875137b57964e33a5fa1980399df70e8bd031eeccc6a99d44bbd8f',
  )

  assertClearedText(
    'CONTRIBUTING.md printed-text rule, paragraph 2',
    locateParagraph(CONTRIBUTING_DOC, paragraphRange, 'printed-text rule paragraph 2', {
      firstLine: /^Two things follow\b/,
      lineCount: 7,
    }),
    'c411688adf284132f6d1ab8feaf69408a038bcc3368ea8a7caf5ecd40da9ece4',
  )

  assertClearedText(
    'CONTRIBUTING.md comments/docblocks/test-names paragraph',
    locateParagraph(
      CONTRIBUTING_DOC,
      paragraphRange,
      'comments, docblocks and test names paragraph',
      {
        firstLine: /^Comments, docblocks and test names are read by contributors\b/,
        lineCount: 12,
      },
    ),
    '14e5bc1a2bb431f7d090a236aa73e71d232b6f9ae0e596b6e2ad1d50742b57d1',
  )

  assertClearedText(
    'CONTRIBUTING.md comments/test-names-treated-alike paragraph',
    locateParagraph(
      CONTRIBUTING_DOC,
      paragraphRange,
      'comments and test names treated alike paragraph',
      { firstLine: /^Comments and test names are treated alike\b/, lineCount: 9 },
    ),
    'a453cca5960313e932e5233a19fc36f7c2ba538a87d7226a71d47a5862524e00',
  )

  assertClearedText(
    'CONTRIBUTING.md "No gate checks any of this" paragraph',
    locateParagraph(CONTRIBUTING_DOC, paragraphRange, 'no gate checks any of this paragraph', {
      firstLine: /^No gate checks any of this\b/,
      lineCount: 3,
    }),
    '869d9ea753b3daf0fdd659dff8c6db4a3f4675492e53c28df4f9408cf6561159',
  )
})

test('CONTRIBUTING.md: the contributor licence terms and the DCO', () => {
  const range = sectionRange(
    CONTRIBUTING_LINES,
    CONTRIBUTING_HEADINGS,
    /^## Licensing your contribution\b/,
    2,
  )

  const paragraphRange = afterHeading(range)

  assertClearedText(
    'CONTRIBUTING.md MIT contribution-licence grant',
    locateParagraph(CONTRIBUTING_DOC, paragraphRange, 'MIT contribution-licence grant', {
      firstLine: /^Nave is MIT licensed\b/,
      lineCount: 4,
    }),
    'eea4185413babd1589a0b8dbdd5ace95edea346df0941232144443c27a0ffd85',
  )

  assertClearedText(
    'CONTRIBUTING.md by-act DCO certification paragraph',
    locateParagraph(CONTRIBUTING_DOC, paragraphRange, 'by-act DCO certification paragraph', {
      firstLine: /^By submitting a contribution you also certify\b/,
      lineCount: 4,
    }),
    '92b4002b5ad1fac06a56d686200600a6370c78e61a5807fca719035a2930d034',
  )

  const dcoFence = fences(CONTRIBUTING).find((fence) =>
    fence.content.startsWith('Developer Certificate of Origin'),
  )
  if (dcoFence === undefined) {
    throw new LocateError(
      'expected a fenced "Developer Certificate of Origin" block in CONTRIBUTING.md',
    )
  }
  const fenceLines = CONTRIBUTING_LINES.slice(dcoFence.from - 1, dcoFence.to + 2)
  assertVerbatim(
    'CONTRIBUTING.md Developer Certificate of Origin fence (with markers)',
    fenceLines.join('\n'),
    '3ae7e0294a7ed055a5f1264934b740f2a76e53474f57af2354464eef6eb2dd8a',
  )

  // A whole SECTION, heading and both its paragraphs together, not a single paragraph: that is
  // the unit this disclosure was originally reviewed and recorded as.
  const disclosureRange = sectionRange(
    CONTRIBUTING_LINES,
    CONTRIBUTING_HEADINGS,
    /^### Content you did not write yourself\b/,
    3,
  )
  assertClearedText(
    'CONTRIBUTING.md "Content you did not write yourself" disclosure',
    wholeSectionText(CONTRIBUTING_LINES, disclosureRange),
    '5eae43aa824e59b6247361a6882782f5a642df32359d67d06a09c1bdb7c41475',
  )
})

// ---------------------------------------------------------------------------------------------
// .github/PULL_REQUEST_TEMPLATE.md
// ---------------------------------------------------------------------------------------------

const TEMPLATE = read('.github/PULL_REQUEST_TEMPLATE.md')
const TEMPLATE_LINES = TEMPLATE.split('\n')

test('PULL_REQUEST_TEMPLATE.md: the disclosure checklist line', () => {
  const matches = TEMPLATE_LINES.filter((line) =>
    /^- \[ \] Anything in this change that was copied or adapted from outside this repository/.test(
      line,
    ),
  )
  assert.equal(matches.length, 1, 'expected exactly one disclosure checklist line')
  assertClearedText(
    'PULL_REQUEST_TEMPLATE.md disclosure checklist line',
    matches[0],
    '464381c42595679977a879e4964cbfdc1440a507ba91c53dd9a84b5423cba3b1',
  )
})

test('PULL_REQUEST_TEMPLATE.md: the printed-text checklist line', () => {
  const matches = TEMPLATE_LINES.filter((line) =>
    /^- \[ \] Any text this change prints or ships states its constraint in words/.test(line),
  )
  assert.equal(matches.length, 1, 'expected exactly one printed-text checklist line')
  assertClearedText(
    'PULL_REQUEST_TEMPLATE.md printed-text checklist line',
    matches[0],
    'd4dfd907586824bcceef8e422dde54dddf5474bd2ee9546a181784d134aef811',
  )
})

test('PULL_REQUEST_TEMPLATE.md: the pull-request-body licence affirmation', () => {
  const start = TEMPLATE_LINES.findIndex((line) => /^By opening this pull request\b/.test(line))
  assert.notEqual(start, -1, 'expected a "By opening this pull request" paragraph')
  let end = start
  while (end + 1 < TEMPLATE_LINES.length && TEMPLATE_LINES[end + 1].trim() !== '') end += 1
  assertClearedText(
    'PULL_REQUEST_TEMPLATE.md licence affirmation',
    TEMPLATE_LINES.slice(start, end + 1).join('\n'),
    'dd84a57d38535ff41a5d2948ff9e9ca6e0759a6c053588a40e94a2df67c5c96c',
  )
})

// ---------------------------------------------------------------------------------------------
// TRADEMARKS.md — the whole file. It states the project's mark and name policy in its own voice
// and nothing in this repository reads it (there is no code-level anchor to attach a
// package-local guard to), so it is pinned here as one unit rather than by section.
// ---------------------------------------------------------------------------------------------

test('TRADEMARKS.md: the whole file', () => {
  assertClearedText(
    'TRADEMARKS.md',
    read('TRADEMARKS.md'),
    '6c163ddbcd9f42649da267ea43a3517db1e2ac8b52a087a5c18f39c12ce20ba5',
  )
})

// ---------------------------------------------------------------------------------------------
// README.md — the two sections with no existing package-local guard. The re-theming notice, its
// worked-example transcription variant, the rung-5 validate scope sentence and the "## License"
// attribution line already have their own guard in `readme-cleared-copy.test.mjs` and are
// deliberately not duplicated here.
// ---------------------------------------------------------------------------------------------

const README = read('README.md')
const README_LINES = README.split('\n')
const README_HEADINGS = headingLines(README_LINES)

test('README.md: the "## Accessibility" section', () => {
  const range = sectionRange(README_LINES, README_HEADINGS, /^## Accessibility\b/, 2)
  assertClearedText(
    'README.md ## Accessibility',
    wholeSectionText(README_LINES, range),
    'efe2f71fa1f93385a0ff5af7edc6def7ad224eccbfe27c133ae58d94c6cba659',
  )
})

test('README.md: the "## Brand and name" section', () => {
  const range = sectionRange(README_LINES, README_HEADINGS, /^## Brand and name\b/, 2)
  assertClearedText(
    'README.md ## Brand and name',
    wholeSectionText(README_LINES, range),
    '5695c111e9d10f28e6b7f931bafc4f7393a21943c2562cf356f414331835c280',
  )
})
