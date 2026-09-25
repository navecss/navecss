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
 * THIS TEXT WAS REVIEWED AND AGREED BEFORE IT SHIPPED. If this test fails because you changed,
 * moved or removed one of the pinned passages, or added text inside a region pinned as a whole,
 * that is not a test to fix: the change needs the same review the current wording had, not a
 * recomputed hash. Open an issue describing what should change and why, get the maintainer's
 * agreement, and only then update the pin below to match the newly agreed wording. If the
 * failure instead comes from something else moving the same bytes by accident (a merge, a
 * generated header), no review is owed and the fix is exactly that: restore the wording.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. A green run here shows only that the pinned bytes have
 * not moved since somebody recorded their digest. It does NOT show that the recorded digest is
 * itself correct, that the wording is legally sound, or that a passage not listed here needs no
 * review of its own: this file is not exhaustive over the repository, only over the passages
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
 * WHY FOLDED, NOT RAW BYTES, FOR MOST PINS. This project's standing practice is that re-wrapping
 * a passage, moving its line breaks without changing a word, is not a re-wording and does not
 * need a fresh review, while changing a word does. So most pins below compare the SHA-256 of a
 * folded form: inside each paragraph, heading or list item, every run of whitespace becomes one
 * space, and the boundaries between paragraphs, headings and list items are kept. That form does
 * not change when a passage is re-wrapped without starting a line with a heading, list or quote
 * marker, and it does change when a word changes, when paragraphs are merged or split, or when a
 * heading or list item is joined onto the text beside it. The one exception is the Developer
 * Certificate of Origin text, which is a third party's document reproduced verbatim under its own
 * "changing it is not allowed" notice: that one is pinned on its raw bytes, including its own
 * line breaks, because nothing about it is this project's wording to reflow.
 *
 * LOCATION, NOT CONTAINMENT. A plain substring search would pass a cleared paragraph moved
 * anywhere else in the file, including into the middle of the Developer Certificate of Origin's
 * own fenced block: a paragraph relocated there would still be "in the file", and simple
 * containment cannot tell the difference. Every pin below is instead LOCATED first: inside a
 * section found by its own heading, matched EXACTLY ONCE, and as the one paragraph, fence or line
 * whose own text matches a fixed pattern. Two kinds of gap are excluded from every locator alike:
 * a fenced code block (its delimiters included, not just its content) and an HTML comment block
 * (a line starting `<!--`, closed at the first line containing `-->`, or otherwise running to the
 * end of the file). Text inside a gap is not read as prose, not read as a heading, and not
 * matched by the checklist or affirmation locators either, because a fenced block renders as code
 * rather than as prose, and a comment does not render at all. Extraction that finds zero or more
 * than one match throws `LocateError`, immediately, distinctly, and BEFORE any digest is compared:
 * a location failure must never fall through to comparing an empty or wrong string against a pin,
 * which would either miss a real change or invent one.
 *
 * This still asserts only what it names. Whole files and sections pinned as one unit, and three
 * runs pinned as complete lists (the contributor licence terms and the Developer Certificate of
 * Origin, the paragraphs on text the build prints or ships, and the part of the pull request
 * template below its horizontal rule), catch text added, removed or reordered inside them;
 * everywhere else a passage is pinned on its own, and text added beside it is not checked. It
 * reads the Markdown source, not the rendered page: fenced blocks and HTML comments are never
 * read as prose, and it cannot tell whether anything else hides a passage from a reader. None of
 * this says whether the surrounding document, or a passage this file does not enumerate, still
 * means what it meant.
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
import { fences, scanFences } from './readme-sections.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), 'utf8')
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Folds `text` into a form that is insensitive to a pure re-wrap (moving line breaks without
 * changing a word) and sensitive to everything else: a word change, a merged or split paragraph,
 * or a heading or list item joined onto the text beside it. Blocks are separated by a blank line
 * or by a line that starts a heading, a list item (`-`, `*`, `+`, or an ordered marker) or a
 * block quote; inside a block, every run of whitespace becomes one space. Two folded blocks are
 * joined by a single newline, so a block boundary is still visible in the folded text even though
 * a line break within a block is not.
 */
const BLOCK_START = /^(#{1,6}(\s|$)|[-*+]\s|\d{1,9}[.)]\s|>)/
function fold(text) {
  const blocks = []
  let run = []
  const flush = () => {
    if (run.length > 0) blocks.push(run.join(' '))
    run = []
  }
  for (const line of text.split('\n')) {
    const words = line.trim()
    if (words === '' || BLOCK_START.test(words)) flush()
    if (words !== '') run.push(words.replaceAll(/\s+/g, ' '))
  }
  flush()
  return blocks.join('\n')
}

/**
 * Thrown by extraction, never by a digest mismatch: a distinct class so a location failure
 * (wrong section, wrong count, inside a gap) cannot be mistaken for a wording change, and so it
 * is impossible to fall through to comparing an empty string.
 */
class LocateError extends Error {}

/**
 * Builds the fence-and-comment-aware view of `text` that every locator in this file reads:
 * `lines` (the raw split), `fenceLines` (every line a fenced code block occupies, delimiters
 * included), `commentLines` (every line an HTML comment block occupies), `gapLines` (the union of
 * the two), and `headings` (the `#`-prefixed lines that sit outside every gap). `fenceLines` and
 * `commentLines` both come from the one shared `scanFences()`, never from a second scanner: a
 * fence and a comment suppress each other (a fence marker inside an open comment is not a fence,
 * and `<!--` inside a fence is literal), which only one pass in document order can track. `label`
 * is carried through so a `LocateError` can name the document it failed against instead of a
 * hardcoded file name.
 */
function docOf(text, label) {
  const lines = text.split('\n')
  const { fenceLines, commentLines } = scanFences(text)
  const gapLines = new Set([...fenceLines, ...commentLines])
  const headings = new Set()
  for (const [i, line] of lines.entries()) {
    if (!gapLines.has(i) && /^#{1,6}\s/.test(line)) headings.add(i)
  }
  return { label, lines, fenceLines, commentLines, gapLines, headings }
}

/**
 * The maximal runs of consecutive non-blank lines in `doc.lines[range.start, range.end)`,
 * skipping every line inside a gap (`doc.gapLines`: a fenced code block or an HTML comment
 * block). A gapped line is never prose, which is what makes a paragraph search structurally
 * unable to find a cleared paragraph that has been relocated inside a fence or hidden inside a
 * comment.
 *
 * A TOP-LEVEL LIST ITEM (a line starting `- `, unindented) ALSO STARTS A NEW PARAGRAPH, even with
 * no blank line before it: `CONTRIBUTING.md`'s "Making changes" bullets run back to back with no
 * blank line between them, so a blank-line-only splitter would merge every bullet in the list
 * into one paragraph and this file's own first-line patterns would never match the one bullet
 * they name. A continuation line of a list item is indented and does not trigger this.
 */
function paragraphsOutsideGaps(doc, range) {
  const { lines, gapLines } = doc
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
    if (line.trim() === '' || gapLines.has(i)) {
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
 * The line range of the section whose own heading matches `pattern` in `doc`: from that heading
 * to the next heading of the same or shallower `depth` (a deeper sub-heading stays inside the
 * section it belongs to), or to the end of the document. Throws `LocateError`, naming
 * `doc.label`, if zero or more than one heading in `doc.headings` matches `pattern`: a coordinate
 * pick (the first match, say) would let a faithful earlier copy of a heading satisfy this locator
 * while the genuine, reviewed one sits somewhere else in the file.
 */
function locateSection(doc, pattern, depth) {
  const { lines, headings, label } = doc
  const matches = [...headings].filter((i) => pattern.test(lines[i]))
  if (matches.length !== 1) {
    throw new LocateError(
      `expected exactly one heading matching ${pattern} in ${label}, found ${matches.length}`,
    )
  }
  const [start] = matches
  const boundary = new RegExp(String.raw`^#{1,${depth}}\s`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (headings.has(i) && boundary.test(lines[i])) {
      end = i
      break
    }
  }
  return { start, end }
}

/**
 * A section's paragraph range, one past its heading line through its own end boundary.
 */
function afterHeading(range) {
  return { start: range.start + 1, end: range.end }
}

/**
 * Locates exactly one paragraph inside `doc` restricted to `range` (a section's `{ start, end }`
 * line range, both 0-indexed, gap-aware paragraphs from `paragraphsOutsideGaps`) whose first line
 * matches `spec.firstLine`, and returns it joined with `\n`. Throws `LocateError`, naming
 * `doc.label` and `description`, if zero or more than one paragraph matches: this never falls
 * through to comparing an empty or wrong string against a pin. A paragraph's LENGTH is not
 * asserted here: a re-wrap that adds or removes a line break changes no word and is not a wording
 * change, and the digest comparison that follows already catches a word added, removed or
 * changed.
 */
function locateParagraph(doc, range, description, spec) {
  const matches = paragraphsOutsideGaps(doc, range).filter((p) => spec.firstLine.test(p.lines[0]))
  if (matches.length !== 1) {
    throw new LocateError(
      `expected exactly one paragraph matching ${spec.firstLine} for "${description}" in ` +
        `${doc.label}, found ${matches.length}`,
    )
  }
  return matches[0].lines.join('\n')
}

/**
 * The one line in `doc.lines[range.start, range.end)` that matches `pattern` and sits outside
 * every gap, returned as `{ index, line }`. Throws `LocateError`, naming `doc.label` and
 * `description`, if zero or more than one line matches: a checklist line hidden inside an HTML
 * comment does not count, because it never renders in the pull request a contributor opens. The
 * INDEX is part of the return value on purpose: a caller that needs it back (to build a range
 * starting after the matched line, say) must not re-derive it with `doc.lines.indexOf(line)`,
 * which finds the first line with that TEXT regardless of gaps and can silently pick a gapped
 * copy of the same wording over the one this function just located.
 */
function locateLine(doc, range, pattern, description) {
  const matches = []
  for (let i = range.start; i < range.end; i += 1) {
    if (!doc.gapLines.has(i) && pattern.test(doc.lines[i]))
      matches.push({ index: i, line: doc.lines[i] })
  }
  if (matches.length !== 1) {
    throw new LocateError(
      `expected exactly one line matching ${pattern} for "${description}" in ${doc.label}, ` +
        `found ${matches.length}`,
    )
  }
  return matches[0]
}

/**
 * The one fence in `fenceList` whose content matches `predicate`. Throws `LocateError`, naming
 * `label`, if zero or more than one fence matches.
 */
function locateFence(fenceList, predicate, label) {
  const matches = fenceList.filter(predicate)
  if (matches.length !== 1) {
    throw new LocateError(`expected exactly one fence matching "${label}", found ${matches.length}`)
  }
  return matches[0]
}

/**
 * The maximal runs of consecutive indexes `lineSet` holds inside `[range.start, range.end)`, as
 * `{ start, end }` pairs (end exclusive), in document order.
 */
function contiguousRuns(lineSet, range) {
  const runs = []
  let runStart = null
  for (let i = range.start; i < range.end; i += 1) {
    if (lineSet.has(i)) {
      if (runStart === null) runStart = i
    } else if (runStart !== null) {
      runs.push({ start: runStart, end: i })
      runStart = null
    }
  }
  if (runStart !== null) runs.push({ start: runStart, end: range.end })
  return runs
}

/**
 * Every block `doc` holds in `range`, in document order: a paragraph (from
 * `paragraphsOutsideGaps`), a fenced code block, or an HTML comment block. Built for the three
 * complete-run pins, where the signed rule is that nothing may be added, removed or reordered
 * inside a named span: a block list is the unit that can be compared for completeness, where a
 * paragraph-by-paragraph pin can only ever check the paragraphs it already knows to look for.
 */
function blocksInRange(doc, range) {
  const paragraphBlocks = paragraphsOutsideGaps(doc, range).map((p) => ({
    type: 'paragraph',
    from: p.from,
    firstLine: p.lines[0],
  }))
  const fenceBlocks = contiguousRuns(doc.fenceLines, range).map((run) => ({
    type: 'fence',
    from: run.start,
  }))
  const commentBlocks = contiguousRuns(doc.commentLines, range).map((run) => ({
    type: 'comment',
    from: run.start,
  }))
  return [...paragraphBlocks, ...fenceBlocks, ...commentBlocks].sort((a, b) => a.from - b.from)
}

/**
 * Asserts that `doc`'s blocks in `range` are EXACTLY `expected`, in the same order: same count,
 * same kind at each position, (where `expected[i].firstLine` is given) the same opening pattern,
 * and (where `expected[i].from` is given) the same starting line. Catches a paragraph interposed,
 * reordered, or appended, and a fence or comment block added where none was reviewed. `from` is
 * for a block whose IDENTITY matters, not only its kind: a fence sitting in the right slot but
 * opened somewhere else in the file is a different fence, not the one the run was reviewed with.
 */
function assertCompleteRun(doc, range, label, expected) {
  const blocks = blocksInRange(doc, range)
  assert.equal(
    blocks.length,
    expected.length,
    `"${label}" is expected to hold exactly ${expected.length} block(s) in document order; ` +
      `found ${blocks.length}`,
  )
  blocks.forEach((block, i) => {
    const spec = expected[i]
    assert.equal(
      block.type,
      spec.type,
      `"${label}" block ${i + 1} is expected to be a ${spec.type}; found a ${block.type}`,
    )
    if (spec.firstLine !== undefined) {
      assert.ok(
        spec.firstLine.test(block.firstLine),
        `"${label}" block ${i + 1} does not start with the expected wording`,
      )
    }
    if (spec.from !== undefined) {
      assert.equal(
        block.from,
        spec.from,
        `"${label}" block ${i + 1} is expected to start at line ${spec.from}; found line ${block.from}`,
      )
    }
  })
}

/**
 * Locates exactly one markdown link in `text` and asserts that its target is `expectedTarget`,
 * then returns `text` with the link markup stripped down to its label, for the caller's own
 * digest. Zero or more than one link is a LOCATION failure (`LocateError`, naming `label`), not a
 * wording change: it means the text this function was asked to read does not have the single,
 * known link shape it was written for. A wrong target, once a single link is found, is a wording
 * change instead, and stays an assertion: the target is pinned as its own property, because the
 * label wording and the destination a contributor is sent to are two separate things a change
 * could move independently.
 */
function locateSingleLink(label, text, expectedTarget) {
  const linkPattern = /\[([^[\]]*)\]\(([^()]*)\)/g
  const links = [...text.matchAll(linkPattern)]
  if (links.length !== 1) {
    throw new LocateError(`expected exactly one markdown link in "${label}"; found ${links.length}`)
  }
  assert.equal(
    links[0][2],
    expectedTarget,
    `"${label}" link target has moved (expected ${expectedTarget}, got ${links[0][2]})`,
  )
  return text.replaceAll(linkPattern, '$1')
}

/**
 * Asserts that `text`'s folded SHA-256 (see `fold`) equals `expectedSha256`. This is the BINDING
 * form for every pinned passage except the Developer Certificate of Origin (see the module
 * docblock): a pure re-wrap never changes it, so a red run here can only mean the words moved, a
 * paragraph or heading was merged or split, or a heading or list item was joined onto the text
 * beside it.
 */
function assertClearedText(label, text, expectedSha256) {
  const folded = fold(text)
  const actual = sha256(folded)
  assert.equal(
    actual,
    expectedSha256,
    `"${label}" no longer matches its reviewed wording (expected digest ${expectedSha256}, ` +
      `got ${actual} over the folded text below). This text was reviewed and agreed before it ` +
      `shipped: changing it needs the same review the current wording had, not a test fixup. If ` +
      `you changed it on purpose, open an issue proposing the new wording and get the ` +
      `maintainer's agreement before updating this pin; otherwise, restore it. Current text:\n\n${text}`,
  )
}

/**
 * Locates the one paragraph in `doc` restricted to `range` whose first line matches
 * `spec.firstLine`, using `label` as both the locator's own description and `assertClearedText`'s
 * label, and asserts its folded digest equals `spec.digest`. The single combination every
 * paragraph pin in this file needs, so a table of `{ label, firstLine, digest }` rows can drive
 * them without repeating the `locateParagraph` / `assertClearedText` pairing at each one.
 */
function assertClearedParagraph(doc, range, label, spec) {
  assertClearedText(label, locateParagraph(doc, range, label, spec), spec.digest)
}

/**
 * The text of a heading's whole section, HEADING INCLUDED, from `lines[range.start]` up to (but
 * not including) the next heading of the same or shallower depth, so a subsection stays inside
 * the section it belongs to, with any trailing blank separator lines trimmed off the end. This
 * differs on purpose from `readme-sections.mjs`'s own `bodyOf`, which excludes the heading: every
 * section pinned in this file is compared for EQUALITY as one whole unit, heading and all,
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
// Rows: fixture-driven cases for each defect fixed in this file, run against the functions above.
// ---------------------------------------------------------------------------------------------

test('row: a paragraph immediately followed by a fence opener locates on its own text (no blank line needed)', () => {
  const text = ['A lone paragraph right before a fence.', '```', 'code', '```'].join('\n')
  const doc = docOf(text, 'fixture.md')
  const paragraphs = paragraphsOutsideGaps(doc, { start: 0, end: doc.lines.length })
  assert.equal(paragraphs.length, 1)
  assert.equal(paragraphs[0].lines.join('\n'), 'A lone paragraph right before a fence.')
})

test('row: a target paragraph wrapped in an HTML comment block fails to locate', () => {
  const text = ['<!--', '', 'Target paragraph text here.', '', '-->', ''].join('\n')
  const doc = docOf(text, 'fixture.md')
  assert.throws(() => {
    locateParagraph(doc, { start: 0, end: doc.lines.length }, 'target', {
      firstLine: /^Target paragraph/,
    })
  }, LocateError)
})

test('row: a template checklist line inside a comment fails to locate', () => {
  const text = ['<!--', '- [ ] Checklist line inside a comment', '-->', ''].join('\n')
  const doc = docOf(text, 'fixture-template.md')
  assert.throws(() => {
    locateLine(doc, { start: 0, end: doc.lines.length }, /^- \[ \] Checklist line/, 'checklist')
  }, LocateError)
})

test('row: a single unclosed <!-- above a pinned heading makes that heading unfindable', () => {
  const text = ['<!--', '## Pinned Heading', 'body'].join('\n')
  const doc = docOf(text, 'fixture.md')
  assert.equal(doc.headings.has(1), false)
  assert.throws(() => locateSection(doc, /^## Pinned Heading\b/, 2), LocateError)
})

test('row: a heading-shaped line inside a closed comment is not a heading', () => {
  const text = ['<!--', '## Not really a heading', '-->', 'body'].join('\n')
  const doc = docOf(text, 'fixture.md')
  assert.equal(doc.headings.has(1), false)
})

test('row: a duplicate heading throws LocateError', () => {
  const text = ['## Licensing', 'a', '## Licensing', 'b'].join('\n')
  const doc = docOf(text, 'fixture.md')
  assert.throws(() => locateSection(doc, /^## Licensing\b/, 2), LocateError)
})

test('row: a duplicate DCO-shaped fence throws LocateError', () => {
  const text = [
    '```text',
    'Developer Certificate of Origin one',
    '```',
    '```text',
    'Developer Certificate of Origin two',
    '```',
  ].join('\n')
  assert.throws(
    () =>
      locateFence(
        fences(text),
        (f) => f.content.startsWith('Developer Certificate of Origin'),
        'Developer Certificate of Origin',
      ),
    LocateError,
  )
})

test('row: a duplicate affirmation paragraph throws LocateError', () => {
  const text = [
    'By opening this pull request, first copy.',
    '',
    'By opening this pull request, second copy.',
  ].join('\n')
  const doc = docOf(text, 'fixture-template.md')
  assert.throws(() => {
    locateParagraph(doc, { start: 0, end: doc.lines.length }, 'affirmation', {
      firstLine: /^By opening this pull request\b/,
    })
  }, LocateError)
})

test("row: a missing heading throws LocateError naming the document's own label", () => {
  const text = ['# Contributing to Nave', 'no matching heading here'].join('\n')
  const doc = docOf(text, 'CONTRIBUTING.md')
  assert.throws(
    () => locateSection(doc, /^## Nonexistent Heading\b/, 2),
    (err) =>
      err instanceof LocateError &&
      err.message.includes('CONTRIBUTING.md') &&
      !err.message.includes('README.md'),
  )
})

test('row: a paragraph re-wrapped to a different line count, no word changed, still passes', () => {
  const original = [
    'Nave is MIT licensed, and contributions come in on the same terms. By submitting a',
    'contribution you license it under the project MIT license, and you keep the copyright',
    'in what you wrote. There is nothing to sign and nothing to assign.',
  ].join('\n')
  const rewrapped = [
    'Nave',
    'is MIT licensed, and contributions come in on the same terms.',
    'By submitting a contribution you license it under the project MIT license,',
    'and you keep the copyright in what you wrote.',
    'There is nothing to sign',
    'and nothing to assign.',
  ].join('\n')
  const digest = sha256(fold(original))
  const doc = docOf(rewrapped, 'fixture.md')
  const located = locateParagraph(doc, { start: 0, end: doc.lines.length }, 'MIT grant', {
    firstLine: /^Nave\b/,
  })
  assertClearedText('MIT grant (rewrapped)', located, digest)
})

test('row: a bullet whose link points somewhere else fails the link-target assertion', () => {
  const text = '- Adding a dependency: [open an issue](https://example.invalid/elsewhere) about it.'
  assert.throws(() => {
    locateSingleLink('dependency bullet', text, 'https://github.com/navecss/navecss/issues')
  }, assert.AssertionError)
})

/**
 * A "## Licensing your contribution" ... "### Content you did not write yourself" fixture whose
 * middle is exactly `blocks`, one per line group, so the three mutations of that run (a paragraph
 * interposed, two paragraphs swapped, a comment block interposed) can share one builder and one
 * expectation instead of three copies of the same surrounding markdown.
 */
function licensingRunFixture(blocks) {
  return [
    '## Licensing your contribution',
    '',
    ...blocks.flatMap((block) => [block, '']),
    '### Content you did not write yourself',
  ].join('\n')
}

const LICENSING_RUN_MUTATIONS = [
  {
    name: 'row: an interposed paragraph inside a complete run is red',
    blocks: [
      'Nave is MIT licensed, first paragraph.',
      'An interposed paragraph that was never reviewed.',
      'By submitting a contribution you also certify, second paragraph.',
    ],
  },
  {
    name: 'row: two paragraphs swapped inside a complete run is red',
    blocks: [
      'By submitting a contribution you also certify, second paragraph.',
      'Nave is MIT licensed, first paragraph.',
    ],
  },
  {
    name: 'row: an extra comment block inside the licensing run is red',
    blocks: [
      'Nave is MIT licensed, first paragraph.',
      '<!-- an aside nobody reviewed -->',
      'By submitting a contribution you also certify, second paragraph.',
    ],
  },
]

for (const { name, blocks } of LICENSING_RUN_MUTATIONS) {
  test(name, () => {
    const doc = docOf(licensingRunFixture(blocks), 'fixture.md')
    const licRange = locateSection(doc, /^## Licensing your contribution\b/, 2)
    const nextRange = locateSection(doc, /^### Content you did not write yourself\b/, 3)
    assert.throws(() => {
      assertCompleteRun(doc, { start: licRange.start + 1, end: nextRange.start }, 'licensing run', [
        { type: 'paragraph', firstLine: /^Nave is MIT licensed\b/ },
        { type: 'paragraph', firstLine: /^By submitting a contribution\b/ },
      ])
    }, assert.AssertionError)
  })
}

test('row: an extra paragraph appended after the affirmation is red', () => {
  const text = [
    '---',
    '',
    'By opening this pull request, I confirm this.',
    '',
    'One more paragraph nobody reviewed.',
  ].join('\n')
  const doc = docOf(text, 'fixture-template.md')
  const { index: ruleIndex } = locateLine(doc, { start: 0, end: doc.lines.length }, /^---$/, 'rule')
  assert.throws(() => {
    assertCompleteRun(doc, { start: ruleIndex + 1, end: doc.lines.length }, 'affirmation run', [
      { type: 'paragraph', firstLine: /^By opening this pull request\b/ },
    ])
  }, assert.AssertionError)
})

test('row: a `---` line inside a comment above the real rule still finds the real rule', () => {
  const text = [
    '<!--',
    '---',
    '-->',
    '',
    '## Summary',
    '',
    '---',
    '',
    'By opening this pull request, I confirm this.',
  ].join('\n')
  const doc = docOf(text, 'fixture-template.md')
  const { index: ruleIndex } = locateLine(doc, { start: 0, end: doc.lines.length }, /^---$/, 'rule')
  assertCompleteRun(doc, { start: ruleIndex + 1, end: doc.lines.length }, 'affirmation run', [
    { type: 'paragraph', firstLine: /^By opening this pull request\b/ },
  ])
})

test('row: a comment holding a lone fence marker does not swallow the heading below it', () => {
  const text = ['<!--', '```', '-->', '', '## Pinned Heading', 'body'].join('\n')
  const doc = docOf(text, 'fixture.md')
  const range = locateSection(doc, /^## Pinned Heading\b/, 2)
  assert.equal(range.start, 4)
})

test('row: a bullet with two links throws LocateError, not an assertion', () => {
  const text = '- [one](https://example.invalid/a) and [two](https://example.invalid/b).'
  assert.throws(
    () => locateSingleLink('two-link bullet', text, 'https://example.invalid/a'),
    LocateError,
  )
})

test("row: a fixture where the run's own fence is not the DCO fence is red", () => {
  const text = [
    '## Licensing your contribution',
    '',
    'Nave is MIT licensed, first paragraph.',
    '',
    'By submitting a contribution you also certify, second paragraph.',
    '',
    '```text',
    'not the dco',
    '```',
    '',
    '### Content you did not write yourself',
    '',
    '```text',
    'Developer Certificate of Origin elsewhere',
    '```',
  ].join('\n')
  const doc = docOf(text, 'fixture.md')
  const licRange = locateSection(doc, /^## Licensing your contribution\b/, 2)
  const nextRange = locateSection(doc, /^### Content you did not write yourself\b/, 3)
  const dcoFence = locateFence(
    fences(text),
    (fence) => fence.content.startsWith('Developer Certificate of Origin'),
    'Developer Certificate of Origin',
  )
  assert.throws(() => {
    assertCompleteRun(doc, { start: licRange.start + 1, end: nextRange.start }, 'licensing run', [
      { type: 'paragraph', firstLine: /^Nave is MIT licensed\b/ },
      { type: 'paragraph', firstLine: /^By submitting a contribution\b/ },
      { type: 'fence', from: dcoFence.from - 1 },
    ])
  }, assert.AssertionError)
})

const FOLD_DIGEST_CASES = [
  {
    name: 'row: a heading joined onto the paragraph above it changes the folded digest',
    before: 'A promise paragraph that ends here.\n\n### A heading\n\nMore text.',
    after: 'A promise paragraph that ends here. ### A heading\n\nMore text.',
    same: false,
  },
  {
    name: 'row: two list items merged onto one line changes the folded digest',
    before: '- First item.\n- Second item.',
    after: '- First item. Second item.',
    same: false,
  },
  {
    name: 'row: a paragraph re-wrapped across different line breaks keeps the same folded digest',
    before: 'One two three four five six seven eight.',
    after: 'One two three four\nfive six seven eight.',
    same: true,
  },
  {
    name: 'row: a list item re-wrapped across different line breaks keeps the same folded digest',
    before: '- One two three four five six.',
    after: '- One two three\n  four five six.',
    same: true,
  },
]

for (const { name, before, after, same } of FOLD_DIGEST_CASES) {
  test(name, () => {
    const compare = same ? assert.equal : assert.notEqual
    compare(sha256(fold(before)), sha256(fold(after)))
  })
}

// ---------------------------------------------------------------------------------------------
// .github/CONTRIBUTING.md
// ---------------------------------------------------------------------------------------------

const CONTRIBUTING = read('.github/CONTRIBUTING.md')
const CONTRIBUTING_DOC = docOf(CONTRIBUTING, '.github/CONTRIBUTING.md')

test('CONTRIBUTING.md: the "Adding a dependency" change-control item', () => {
  const range = locateSection(CONTRIBUTING_DOC, /^## Making changes\b/, 2)
  const text = locateParagraph(CONTRIBUTING_DOC, afterHeading(range), 'Adding a dependency', {
    firstLine: /^- Adding a dependency:/,
  })

  // The bullet's closing sentence is shared, word for word, with the licence allow-list gate's
  // own printed guidance, so that a contributor sees the identical repair whichever surface they
  // meet first. That shared sentence has its own source of truth (`ALLOWLIST_FAILURE_GUIDANCE`)
  // and must not be pinned a second time here: this test derives it from that constant rather
  // than typing it out, so a wording change to that shared sentence is caught over there, and a
  // wording change to this bullet's own opening is caught here, and neither can hide behind the
  // other's clearance.
  const stripped = locateSingleLink(
    'CONTRIBUTING.md "Adding a dependency" bullet',
    text,
    'https://github.com/navecss/navecss/issues',
  )
  const foldedStripped = fold(stripped)

  const openIssuePhrase = 'open an issue'
  const occurrences = ALLOWLIST_FAILURE_GUIDANCE.split(openIssuePhrase).length - 1
  assert.equal(
    occurrences,
    1,
    `expected "${openIssuePhrase}" to occur exactly once in ALLOWLIST_FAILURE_GUIDANCE`,
  )
  const sharedTail = ALLOWLIST_FAILURE_GUIDANCE.slice(
    ALLOWLIST_FAILURE_GUIDANCE.indexOf(openIssuePhrase),
  )

  const actualTail = foldedStripped.slice(Math.max(0, foldedStripped.length - sharedTail.length))
  const sharedSentenceMessage =
    'Shared-sentence gate: the contributor guide and the licence allow-list gate no longer ' +
    'state the rule in the same words (do not resolve this by re-wording either one):\n\n' +
    `${actualTail}\n\n${sharedTail}\n\n` +
    'These two texts are one rule in two places and are meant to stay word-identical, so that ' +
    'neither drifts when the other is edited. Neither is a copy to bring into line with the ' +
    'other by hand: changing the wording changes what the project tells contributors, which is ' +
    'a reviewed change and not a test fixup. Restore the wording your change moved, or, if it ' +
    'should change, open an issue naming both places and what each should say, and leave the ' +
    'change out of the pull request until that issue is answered.'

  assert.ok(foldedStripped.endsWith(sharedTail), sharedSentenceMessage)
  assert.ok(ALLOWLIST_FAILURE_GUIDANCE.includes(sharedTail), sharedSentenceMessage)

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

const PRINTED_TEXT_RANGE = afterHeading(
  locateSection(CONTRIBUTING_DOC, /^### Text the build prints or ships\b/, 3),
)
const COMMITS_RANGE = locateSection(CONTRIBUTING_DOC, /^## Commits\b/, 2)

const PRINTED_TEXT_PARAGRAPHS = [
  {
    label: 'CONTRIBUTING.md printed-text rule, paragraph 1',
    firstLine: /^Anything this build can print\b/,
    digest: '86167c6340875137b57964e33a5fa1980399df70e8bd031eeccc6a99d44bbd8f',
  },
  {
    label: 'CONTRIBUTING.md printed-text rule, paragraph 2',
    firstLine: /^Two things follow\b/,
    digest: 'c411688adf284132f6d1ab8feaf69408a038bcc3368ea8a7caf5ecd40da9ece4',
  },
  {
    label: 'CONTRIBUTING.md comments/docblocks/test-names paragraph',
    firstLine: /^Comments, docblocks and test names are read by contributors\b/,
    digest: '14e5bc1a2bb431f7d090a236aa73e71d232b6f9ae0e596b6e2ad1d50742b57d1',
  },
  {
    label: 'CONTRIBUTING.md comments/test-names-treated-alike paragraph',
    firstLine: /^Comments and test names are treated alike\b/,
    digest: 'a453cca5960313e932e5233a19fc36f7c2ba538a87d7226a71d47a5862524e00',
  },
  {
    label: 'CONTRIBUTING.md "No gate checks any of this" paragraph',
    firstLine: /^No gate checks any of this\b/,
    digest: '869d9ea753b3daf0fdd659dff8c6db4a3f4675492e53c28df4f9408cf6561159',
  },
]

test('CONTRIBUTING.md: the "Text the build prints or ships" paragraphs run, complete', () => {
  assertCompleteRun(
    CONTRIBUTING_DOC,
    { start: PRINTED_TEXT_RANGE.start, end: COMMITS_RANGE.start },
    'CONTRIBUTING.md printed-text paragraphs run',
    PRINTED_TEXT_PARAGRAPHS.map(({ firstLine }) => ({ type: 'paragraph', firstLine })),
  )
})

for (const paragraph of PRINTED_TEXT_PARAGRAPHS) {
  test(paragraph.label, () => {
    assertClearedParagraph(CONTRIBUTING_DOC, PRINTED_TEXT_RANGE, paragraph.label, paragraph)
  })
}

const LICENSING_TERMS_RANGE = afterHeading(
  locateSection(CONTRIBUTING_DOC, /^## Licensing your contribution\b/, 2),
)
const DISCLOSURE_RANGE = locateSection(
  CONTRIBUTING_DOC,
  /^### Content you did not write yourself\b/,
  3,
)

// Located FIRST, so the run below can check that its own third block IS the DCO fence (the same
// opener line), not merely a fence somewhere in the file: the by-act certification paragraph
// says the text in this fence is the full document it refers to, which is a claim about THIS
// fence sitting right here, not about a fence of this shape existing anywhere.
const DCO_FENCE = locateFence(
  fences(CONTRIBUTING),
  (fence) => fence.content.startsWith('Developer Certificate of Origin'),
  'Developer Certificate of Origin',
)

const LICENSING_TERMS_PARAGRAPHS = [
  {
    label: 'CONTRIBUTING.md MIT contribution-licence grant',
    firstLine: /^Nave is MIT licensed\b/,
    digest: 'eea4185413babd1589a0b8dbdd5ace95edea346df0941232144443c27a0ffd85',
  },
  {
    label: 'CONTRIBUTING.md by-act DCO certification paragraph',
    firstLine: /^By submitting a contribution you also certify\b/,
    digest: '92b4002b5ad1fac06a56d686200600a6370c78e61a5807fca719035a2930d034',
  },
]

test('CONTRIBUTING.md: the contributor licence terms run, complete, and the DCO', () => {
  assertCompleteRun(
    CONTRIBUTING_DOC,
    { start: LICENSING_TERMS_RANGE.start, end: DISCLOSURE_RANGE.start },
    'CONTRIBUTING.md licensing terms run',
    [
      ...LICENSING_TERMS_PARAGRAPHS.map(({ firstLine }) => ({ type: 'paragraph', firstLine })),
      { type: 'fence', from: DCO_FENCE.from - 1 },
    ],
  )

  const fenceLines = CONTRIBUTING_DOC.lines.slice(DCO_FENCE.from - 1, DCO_FENCE.to + 2)
  assertVerbatim(
    'CONTRIBUTING.md Developer Certificate of Origin fence (with markers)',
    fenceLines.join('\n'),
    '3ae7e0294a7ed055a5f1264934b740f2a76e53474f57af2354464eef6eb2dd8a',
  )

  // A whole SECTION, heading and both its paragraphs together, not a single paragraph: that is
  // the unit this disclosure was originally reviewed and recorded as.
  assertClearedText(
    'CONTRIBUTING.md "Content you did not write yourself" disclosure',
    wholeSectionText(CONTRIBUTING_DOC.lines, DISCLOSURE_RANGE),
    '5ce4e731003a2bea76600066edfe0335784403297ee1802ac6fc033989ee8181',
  )
})

for (const paragraph of LICENSING_TERMS_PARAGRAPHS) {
  test(paragraph.label, () => {
    assertClearedParagraph(CONTRIBUTING_DOC, LICENSING_TERMS_RANGE, paragraph.label, paragraph)
  })
}

// ---------------------------------------------------------------------------------------------
// .github/PULL_REQUEST_TEMPLATE.md
// ---------------------------------------------------------------------------------------------

const TEMPLATE = read('.github/PULL_REQUEST_TEMPLATE.md')
const TEMPLATE_DOC = docOf(TEMPLATE, '.github/PULL_REQUEST_TEMPLATE.md')
const TEMPLATE_FULL_RANGE = { start: 0, end: TEMPLATE_DOC.lines.length }

const TEMPLATE_CHECKLIST_LINES = [
  {
    label: 'PULL_REQUEST_TEMPLATE.md disclosure checklist line',
    description: 'disclosure checklist line',
    pattern:
      /^- \[ \] Anything in this change that was copied or adapted from outside this repository/,
    digest: '464381c42595679977a879e4964cbfdc1440a507ba91c53dd9a84b5423cba3b1',
  },
  {
    label: 'PULL_REQUEST_TEMPLATE.md printed-text checklist line',
    description: 'printed-text checklist line',
    pattern: /^- \[ \] Any text this change prints or ships states its constraint in words/,
    digest: 'd4dfd907586824bcceef8e422dde54dddf5474bd2ee9546a181784d134aef811',
  },
]

for (const { label, description, pattern, digest } of TEMPLATE_CHECKLIST_LINES) {
  test(label, () => {
    const { line } = locateLine(TEMPLATE_DOC, TEMPLATE_FULL_RANGE, pattern, description)
    assertClearedText(label, line, digest)
  })
}

test('PULL_REQUEST_TEMPLATE.md: the licence affirmation run, complete', () => {
  const { index: ruleIndex } = locateLine(
    TEMPLATE_DOC,
    TEMPLATE_FULL_RANGE,
    /^---$/,
    'horizontal rule',
  )
  const affirmationRange = { start: ruleIndex + 1, end: TEMPLATE_DOC.lines.length }

  assertCompleteRun(TEMPLATE_DOC, affirmationRange, 'PULL_REQUEST_TEMPLATE.md affirmation run', [
    { type: 'paragraph', firstLine: /^By opening this pull request\b/ },
  ])

  assertClearedText(
    'PULL_REQUEST_TEMPLATE.md licence affirmation',
    locateParagraph(TEMPLATE_DOC, affirmationRange, 'licence affirmation', {
      firstLine: /^By opening this pull request\b/,
    }),
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
    '608397b082f88eca73884c6d91e5b35c72075fa6b51eb16bae6b4fd62d2064c3',
  )
})

// ---------------------------------------------------------------------------------------------
// README.md — the two sections with no existing package-local guard. The re-theming notice, its
// worked-example transcription variant, the rung-5 validate scope sentence and the "## License"
// attribution line already have their own guard in `readme-cleared-copy.test.mjs` and are
// deliberately not duplicated here.
// ---------------------------------------------------------------------------------------------

const README = read('README.md')
const README_DOC = docOf(README, 'README.md')

test('README.md: the "## Accessibility" section', () => {
  const range = locateSection(README_DOC, /^## Accessibility\b/, 2)
  assertClearedText(
    'README.md ## Accessibility',
    wholeSectionText(README_DOC.lines, range),
    'a27cefc5413c94f46d821c101907ad228d4e090ed65b3da7b1d248ba9d394ee5',
  )
})

test('README.md: the "## Brand and name" section', () => {
  const range = locateSection(README_DOC, /^## Brand and name\b/, 2)
  assertClearedText(
    'README.md ## Brand and name',
    wholeSectionText(README_DOC.lines, range),
    '3568193eea6a12eb64760e2c386991f01377cc07e8ea262f6ac53886725dd041',
  )
})
