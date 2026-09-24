/**
 * Mechanical guard for safety-critical cleared copy shipping in `README.md`, resting on the
 * rule that cleared consumer-facing copy shipping in a
 * consumer-facing artifact must be held by a mechanical guard in this repository, and this
 * README's cleared units were owed one the moment an earlier change landed them with none.
 *
 * A follow-up change adds a SEVENTH, LICENSING test to this same file rather than widening the
 * six accessibility ones, on three grounds. The rule above is written about cleared copy in a
 * consumer artifact and says nothing about which kind, so it reaches a licensing unit unchanged.
 * The project's licensing policy independently requires the same shape in its own words: a text
 * that was signed off and then copied into an implementation artifact needs a mechanical equality
 * check against the source it was copied from, or the copy quietly becomes the operative wording.
 * And the maintainer's instruction was that this test may land here if this file is its
 * cleanest home, which it is. It asserts only the LANDED bytes: the README's `## License`
 * block must fold-whitespace-match `MIT © Nave Contributors`. It mints no constant to compare
 * against: the README is the only place this repository carries that line, and a constant
 * typed here would be a second copy checked against nothing but itself.
 *
 * FIVE ACCESSIBILITY CONSTRAINTS, SIX ACCESSIBILITY TESTS. The re-theming notice, its
 * separately cleared worked-example transcription variant, the worked
 * example's empty caption slot, rung 5's `validate` scope sentence, and the standing rule that
 * a conformance parenthetical never leaves a prose sentence.
 *
 * THAT LAST RULE IS NOT `findConformanceFraming`'s, and the two must not be conflated.
 * `copy-lint.ts`'s
 * `findConformanceFraming` forbids a success-criterion identifier OUTRIGHT on the surfaces it
 * governs (token descriptions, the emitted notice, and the contrast harness's own name and
 * output); this README lawfully
 * carries three, so that lint would red it. What this file holds is the README's own cleared
 * rule about WHERE such an identifier may sit, and it holds it over the `## Accessibility`
 * SECTION ALONE and never over the whole README: a conformance parenthetical anywhere else in
 * this artifact is read by nothing here, and by nothing in `copy-lint.ts` either.
 *
 * DELIBERATELY DOES NOT COVER the `## Accessibility` block's bytes: the README is the block's
 * only copy in this repository, and a copy minted here to compare it against would be a second
 * canon checked against nothing but itself, which is worse than no check because it reads as
 * one. Its
 * one mechanically checkable standing rule, the conformance parenthetical never leaving a
 * prose sentence, IS covered (test 6).
 *
 * `RETHEMING_NOTICE` is read out of `copy-lint.ts` rather than re-typed, so this guard cannot
 * drift into checking a string that is no longer the cleared one — the cost
 * `packages/tokens/test/theming/cleared-copy.ts` already paid once by hand-transcribing its
 * own variant with nothing comparing it back.
 *
 * Every comparison folds whitespace on both sides first: the README hard-wraps at ~78
 * columns, so a naive substring/`includes()` check is green-blind on the only form any of
 * this copy actually takes in the shipped file.
 *
 * Fence-aware section parsing reused from `readme-sections.mjs` (extracted from
 * `readme-theming-ladder.test.mjs`) rather than re-derived.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RETHEMING_NOTICE } from '../packages/tokens/src/theming/copy-lint.ts'
import { TRANSCRIPTION_VARIANT } from '../packages/tokens/test/theming/cleared-copy.ts'
import { bodyOf, headingLines, readReadme, sectionRange } from './readme-sections.mjs'

const README = readReadme()
const README_LINES = README.split('\n')
const README_HEADINGS = headingLines(README_LINES)

function fold(text) {
  return text.split(/\s+/).filter(Boolean).join(' ')
}

/**
 * `text` with HTML comments removed, reached ONLY through `visibleOccurrences` and test 5 (see
 * the split below; it is a PRESENCE-side helper and nothing else). `fold()` counts BYTES, so a
 * notice wrapped in `<!-- ... -->` folds to a string that still CONTAINS the notice, and the
 * guard whose entire purpose is that notice reports it present while no reader can see it
 * (measured 436/0 GREEN before this change). Commenting a paragraph out is the most ordinary
 * thing a copy edit does, so this is a FALSE GREEN on the signed constraint rather than an
 * uncovered mutation. Fenced text is deliberately NOT stripped: a fenced instance is visible to
 * a reader, and R34's own landing point 3 puts the notice inside a code artifact as a comment,
 * so reding one would forbid a shape R34 itself clears.
 */
function visible(text) {
  return text.replaceAll(/<!--[\s\S]*?-->/g, ' ')
}

/**
 * SPLIT DELIBERATELY, AND THE SPLIT IS THE POINT. `occurrences` reads the SOURCE;
 * `visibleOccurrences` reads what a reader of the RENDERED README sees. Stripping HTML comments
 * is right for a PRESENCE check (a commented-out notice is not present to any reader, which is
 * the false green closed at round 2) and WRONG for every ABSENCE check
 * in this file, because the harm those record is a SOURCE-level duplication:
 * the clearance's own ground is that "a second byte-identical copy
 * thirty lines apart is the shape a later editor harmonises", and commenting that copy out does
 * not remove it from the file. It hides it from the reader and leaves it for the editor, which
 * is strictly worse than the plain duplicate the clearance forbids by name.
 *
 * MEASURED, NOT REASONED ABOUT. With one shared stripped `occurrences`, FIVE catches that were
 * RED at `ea90247` went GREEN, each one wrapped in `<!-- -->`: a second byte-identical notice
 * inside rung `1b` (the SIGNED ceiling), a copy pasted
 * into `## Getting started` (containment), a notice at rung 0 (its zero), the canonical notice
 * inside the worked example, and a second copy of the worked example's own cleared variant. So
 * the floor and the variant's PRESENCE read `visibleOccurrences`, and rung `1b`'s `=== 1`, rung
 * 0's `=== 0`, both sides of the containment invariant, the worked example's `=== 0` and the
 * variant's exact count all read the raw source. An exact count is two constraints wearing one
 * assertion, so the variant's is written as both: a visible floor and a source ceiling.
 */
function occurrences(haystack, needle) {
  const folded = fold(haystack)
  const target = fold(needle)
  if (target === '') return 0
  let count = 0
  let at = folded.indexOf(target)
  while (at >= 0) {
    count += 1
    at = folded.indexOf(target, at + target.length)
  }
  return count
}

/**
 * `occurrences`, counting only what a reader of the RENDERED README can see.
 */
function visibleOccurrences(haystack, needle) {
  return occurrences(visible(haystack), needle)
}

const THEMING_RANGE = sectionRange(README_LINES, README_HEADINGS, /^## Theming\b/, 2)
const THEMING_LINES = bodyOf(README_LINES, THEMING_RANGE).split('\n')
const THEMING_HEADINGS = headingLines(THEMING_LINES)

const RUNG_HEADING = /^### Rung (\S+?)[:\s]/
const RUNG_NAMES = THEMING_LINES.filter((line, i) => THEMING_HEADINGS.has(i))
  .map((line) => RUNG_HEADING.exec(line))
  .filter((match) => match !== null)
  .map((match) => match[1])

const RUNG_RANGES = new Map(
  RUNG_NAMES.map((name) => [
    name,
    sectionRange(
      THEMING_LINES,
      THEMING_HEADINGS,
      new RegExp(String.raw`^### Rung ${name}[:\s]`),
      3,
    ),
  ]),
)

function rungBody(name) {
  const range = RUNG_RANGES.get(name)
  assert.ok(range, `expected the Theming section to carry a "### Rung ${name}" heading`)
  return bodyOf(THEMING_LINES, range)
}

// R34's canonical notice lands at every rung that performs a re-theming act — every rung
// except rung 0, which performs none.
const RETHEMING_RUNGS = ['1a', '1b', '2', '3', '4', '5']

// A FLOOR AT EVERY RUNG, PLUS THE ONE EXACT COUNT THAT WAS ACTUALLY CLEARED.
// `AC-theming-39` (round 22 of that review; settled round 23) counts RUNGS COVERED
// and never notice OCCURRENCES — "a rung with an act of its own needs its own instance" — and
// round 22's own correction says in terms that on a DOCUMENTATION surface "any number of
// BYTE-IDENTICAL occurrences of the one text the round-12 routing selects for that surface is
// not a third wording and does not fail". So a rung that lawfully grows a SECOND act must grow
// a second instance, and an `=== 1` reds exactly the edit the criterion REQUIRES (measured: a
// second `build --source=` act at rung 5 carrying its own instance was 434/2 RED before this).
//
// Rung `1b` is the one rung with an exact count, and it is exact because it was RULED exact.
// Piece A ("Seeding with
// no colour") re-shows THE SAME command with a grey rather than performing a second act, and one
// act is owed one instance. Its own words: "A second byte-identical copy thirty lines apart is
// the shape a later editor harmonises. Do not add one." If rung `1b` ever grows a genuine second
// ACT, this red is the correct behaviour rather than a defect: it returns the edit to the
// project's steward, who ruled this rung by name.
test('the re-theming notice appears at every rung that performs a re-theming act', () => {
  for (const name of RETHEMING_RUNGS) {
    const count = visibleOccurrences(rungBody(name), RETHEMING_NOTICE)
    assert.ok(
      count >= 1,
      `rung ${name} must carry the re-theming notice at least once (whitespace-folded), found ${count}`,
    )
  }
  assert.equal(
    occurrences(rungBody('1b'), RETHEMING_NOTICE),
    1,
    'rung 1b performs ONE act, re-shown at piece A with a grey: a second byte-identical copy is the harmonisation shape the clearance forbids by name',
  )
})

test('rung 0 carries no re-theming notice, and no instance sits outside the ladder', () => {
  assert.equal(
    occurrences(rungBody('0'), RETHEMING_NOTICE),
    0,
    'rung 0 performs no re-theming act and must carry no notice',
  )
  // CONTAINMENT, which is the one real catch the retired README-wide `=== 6` was buying. R34
  // places the notice at the rung where responsibility transfers and `AC-theming-39`'s `Given`
  // names the README THEMING SECTION as the surface, so every instance in this file belongs to
  // a rung. A copy pasted anywhere else is the duplication the clearance names by shape, and it
  // drifts with nothing comparing it. This is a CONTAINMENT invariant and not a count: a rung
  // may hold as many instances as it has acts.
  const insideRungs = RUNG_NAMES.reduce(
    (total, name) => total + occurrences(rungBody(name), RETHEMING_NOTICE),
    0,
  )
  assert.equal(
    occurrences(README, RETHEMING_NOTICE),
    insideRungs,
    'every re-theming notice instance in the README must sit inside a ladder rung',
  )
})

// Round 12 of that review: the "Neutral actions" worked example at rung 2 is
// the one landing point where a reader transcribes values Nave chose rather than values they
// set themselves, and it carries a separately cleared TRANSCRIPTION VARIANT instead of the
// canonical notice. `copy-lint.ts` carries no constant for it (out of that package's scope),
// but `packages/tokens/test/theming/cleared-copy.ts` already declares it, and that file's own
// docblock says it was declared once so the drift surface would be ONE hand transcription
// rather than several. Import it; a second literal here would be the several.
const WORKED_EXAMPLE_VARIANT = TRANSCRIPTION_VARIANT

const rung2Lines = rungBody('2').split('\n')
const rung2Headings = headingLines(rung2Lines)
const WORKED_EXAMPLE_RANGE = sectionRange(
  rung2Lines,
  rung2Headings,
  /^#### Worked example: neutral actions\b/,
  4,
)
const workedExample = bodyOf(rung2Lines, WORKED_EXAMPLE_RANGE)

test("the worked example's separately-cleared notice variant appears exactly once and is not harmonised with the canonical wording", () => {
  assert.ok(
    visibleOccurrences(workedExample, WORKED_EXAMPLE_VARIANT) >= 1,
    'the "Neutral actions" worked example must carry its own cleared transcription variant, visible to a reader',
  )
  assert.equal(
    occurrences(workedExample, WORKED_EXAMPLE_VARIANT),
    1,
    'the "Neutral actions" worked example must carry its own cleared transcription variant exactly once, in the SOURCE: a second copy is the harmonisation shape, whether or not it is commented out',
  )
  assert.notEqual(
    fold(WORKED_EXAMPLE_VARIANT),
    fold(RETHEMING_NOTICE),
    'the worked-example variant and the canonical notice are separately cleared and must stay textually distinct',
  )
  assert.equal(
    occurrences(workedExample, RETHEMING_NOTICE),
    0,
    'the canonical notice must not additionally appear inside the worked example, which carries its own variant instead',
  )
})

test('the worked example carries no "tested against ..." caption', () => {
  // The caption slot is empty at 0.1.0: no sentence claims the worked-example values were
  // tested against anything. Adding one is exactly the mutation a reviewer proposed, and which
  // this guard exists to catch.
  //
  // A LETTER-BOUNDED LOOKAROUND, NOT `\b`: markdown emphasis wraps a caption in `_..._`, and
  // `_` is a word character to regex, so `_Tested` has NO `\b` between them and `\btested\b`
  // is green-blind on exactly the caption shape it exists to catch (found by mutation-testing
  // this guard, not asserted from the draft).
  // THE WHOLE OF §6 ITEM 3, NOT A THIRD OF IT. The cleared sentence forbids three things in
  // this slot — "a caption, a verification claim or the word 'tested'" — and the single-word
  // scan held only the third: `_Verified against the 4.5:1 floor for body text._` was GREEN,
  // measured. Two limbs, because a verification claim does not need one of these verbs.
  assert.doesNotMatch(
    workedExample,
    /(?<![a-z])(?:tested|verified|audited|measured|checked|conforms?|conformant|complies|compliant|passe[sd]|pass|clears?|cleared|meets?)(?![a-z])/i,
    'the worked example must not carry a "tested against ..." (or similar) verification caption',
  )
  // The CLAIM SHAPE, borrowed from `AC-theming-40`'s already-cleared lint vocabulary rather
  // than minted here: a success-criterion identifier, the word WCAG, a
  // conformance level, or a contrast ratio. Case-INSENSITIVE here, because every shape in this
  // limb has a real lowercase or mixed-case form a caption might use (`wcag`, `Accessible`).
  assert.doesNotMatch(
    workedExample,
    /\bSC\s+\d+\.\d+\.\d+|(?<![a-z])WCAG(?![a-z])|(?<![a-z])accessible(?![a-z])|\b\d+(?:\.\d+)?\s*:\s*1\b/i,
    'the worked example must not carry a conformance claim: no success-criterion identifier, no WCAG mention, no contrast ratio',
  )
  // THE CONFORMANCE LEVEL IS ITS OWN LIMB, AND IT IS THE ONE CASE-SENSITIVE CHECK IN THIS FILE.
  // It was folded into the `i`-flagged alternation above, where `A{1,3}` matches a lone
  // lowercase article and `Level\s+A{1,3}\b` therefore matches the two ordinary English words
  // `level a` — measured: the sentence "Pick the level a reader expects, then be consistent."
  // added to this worked example RED this test, carrying no claim §6 item 3 forbids.
  //
  // The token this limb is for is a WCAG conformance level, which is uppercase by construction
  // (`Level A`, `Level AA`, `Level AAA`), so pinning the `A`s uppercase costs no catch while
  // the false red it removes is ordinary prose. The word itself keeps its three realistic
  // spellings rather than an `i` flag that would give the `A`s back their lowercase forms. It
  // stays anchored on the word "Level" for the reason it always was: a bare `AA` would
  // false-positive on a hex colour inside this very fence.
  assert.doesNotMatch(
    workedExample,
    /\b(?:LEVEL|Level|level)\s+A{1,3}\b/,
    'the worked example must not carry a conformance level',
  )
})

test("rung 5's validate scope sentence is present, and the forbidden completeness widening is absent", () => {
  const rung5 = visible(rungBody('5'))
  assert.match(
    fold(rung5),
    /checks that list and nothing else, so a clean run means the names the contract carries are present, not that your palette is complete/i,
    'rung 5 must state the scope of a clean `validate` run exactly: it means the required contract is present, not that the palette is complete',
  )
  // The clearance's forbidden widening, by name: turning the true scoped
  // statement above into a false reassurance that a clean run means the token source itself is
  // complete.
  assert.doesNotMatch(
    fold(rung5),
    /clean run means (?:your token source|the token source) is complete/i,
    'rung 5 must not widen the scope sentence to claim a clean run means the token source is complete',
  )
})

// The standing rule for this section: a conformance
// parenthetical stays inline in a prose sentence. Checked STRUCTURALLY, on the raw text, by
// asserting that the markdown BLOCK each one sits in is prose - not a heading, not a table
// row, not a list item - and that the parenthetical is not inside a link or image label.
//
// The enumerate-the-containers shape this replaces was green-blind on the normal form of two
// of the four containers it named: folding collapses a table's cell padding, so
// `folded[index - 1]` is a SPACE for every table a formatter produces and the table check
// only fired on `|(supports`, which nobody writes; and the list check was anchored at column
// zero, so an indented list item passed. Measured on this PR, not reasoned about.
const ACCESSIBILITY_RANGE = sectionRange(README_LINES, README_HEADINGS, /^## Accessibility\b/, 2)
const accessibility = bodyOf(README_LINES, ACCESSIBILITY_RANGE)
const CONFORMANCE_PARENTHETICAL = /\(supports\s+SC\s+\d+\.\d+\.\d+\b/gi
const PARENTHETICAL_OPENER = /\(supports/gi
const OPENS_CONFORMANCE = /^\(supports\s+SC\s+\d+\.\d+\.\d+\b/i

/**
The maximal run of non-blank lines containing `index`: the markdown block it belongs to.
 */
function blockAround(lines, index) {
  let first = index
  while (first > 0 && lines[first - 1].trim() !== '') first -= 1
  let last = index
  while (last + 1 < lines.length && lines[last + 1].trim() !== '') last += 1
  return { first, last, lines: lines.slice(first, last + 1) }
}

/**
 * Every `(supports` occurrence that opens a CONFORMANCE parenthetical, as raw `{ index, at }`
 * positions. Two corrections over the first structural draft, both measured rather than argued.
 *
 * IT READS THE CONFORMANCE FORM, NOT THE BARE WORD. `/\(supports\b/` treated any line carrying
 * "(supports" as an opener, so an ordinary English parenthesis in a section whose whole subject
 * is what Nave supports (measured: "every browser Nave targets (supports the modern colour
 * functions) renders these tokens") made the count invariant disagree with itself and redded
 * this guard with "every conformance parenthetical must be locatable on a raw line", which
 * points its reader at the wrong thing entirely. The standing rule governs the CONFORMANCE
 * parenthetical (the standing rule stated above test 6);
 * it says nothing about the
 * English verb.
 *
 * IT SCANS EVERY OCCURRENCE ON A LINE, NOT THE LINE ONCE. `map` over lines yielded one opener
 * per line, so two conformance parentheticals on one raw line counted 1 raw against 2 folded.
 *
 * The form is tested against the rest of the parenthetical's own BLOCK, folded, because this
 * README hard-wraps and one instance today is split as `(supports` / `SC 1.4.4`: the block is
 * exactly the run of lines a reader sees as one paragraph, so this is the shape the artifact
 * actually takes rather than the shape a one-line check imagines.
 */
function conformanceOpeners(lines) {
  const found = []
  for (const [index, line] of lines.entries()) {
    for (const hit of line.matchAll(PARENTHETICAL_OPENER)) {
      const block = blockAround(lines, index)
      const rest = [line.slice(hit.index), ...block.lines.slice(index - block.first + 1)].join(' ')
      if (OPENS_CONFORMANCE.test(fold(rest))) found.push({ index, at: hit.index })
    }
  }
  return found
}

/**
 * The `[` nesting depth at the end of `text`, clamped at zero: non-zero means a link, image or
 * badge label is still open. Read over the BLOCK up to the parenthetical rather than over its
 * one raw line, and clamped rather than signed, for the same hard-wrapping reason: a `]` closing
 * a label that opened on the previous line left the old per-line balance at -1 and redded a
 * lawful sentence as unclosed badge syntax. Clamping keeps the direction that matters (a label
 * still open AT the parenthetical, whether or not it ever closes) and drops the one that never
 * meant anything (a label that closed before it).
 */
function labelDepth(text) {
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1
    else if (text[i] === '[') depth += 1
    else if (text[i] === ']' && depth > 0) depth -= 1
  }
  return depth
}

test('every "(supports SC ...)" parenthetical stays inline in a prose sentence', () => {
  const folded = fold(accessibility)
  const matches = [...folded.matchAll(CONFORMANCE_PARENTHETICAL)]
  assert.ok(
    matches.length > 0,
    'expected at least one conformance parenthetical in the Accessibility section',
  )

  const lines = accessibility.split('\n')
  const openers = conformanceOpeners(lines)
  assert.equal(
    openers.length,
    matches.length,
    `every conformance parenthetical must be locatable on a raw line: ${matches.length} folded, ${openers.length} raw`,
  )

  for (const { index, at } of openers) {
    const block = blockAround(lines, index)
    for (const line of block.lines) {
      assert.doesNotMatch(
        line,
        /^\s*#{1,6}\s/,
        `a conformance parenthetical must not sit in a heading block: ${line}`,
      )
      assert.doesNotMatch(
        line,
        /^\s*\|/,
        `a conformance parenthetical must not sit in a table: ${line}`,
      )
      assert.doesNotMatch(
        line,
        /^\s*(?:[-*+]|\d+[.)])\s/,
        `a conformance parenthetical must not sit in a list item: ${line}`,
      )
    }
    // The prose a reader sees before the parenthetical: the block up to it, not the line up to
    // it. Both remaining limbs read this one string, so both survive a hard wrap.
    const prose = [...block.lines.slice(0, index - block.first), lines[index].slice(0, at)].join(
      ' ',
    )
    // Not a link or image label: `(supports` must not sit inside a `[` that is still open.
    assert.equal(
      labelDepth(prose),
      0,
      `a conformance parenthetical must not sit inside link or image (badge) syntax: ${lines[index]}`,
    )
    // INLINE, not standalone: the same standing rule's other limb. The clearance's one
    // REQUIRED change was that this parenthetical stop being "a standalone capitalised
    // sentence between two sentences" and sit inside the sentence that says what the code
    // does, so a reflow that strands it in its own paragraph is the same defect as migrating
    // it into a heading. The clearance names that reflow by name.
    assert.notEqual(
      prose.trim(),
      '',
      `a conformance parenthetical must not open its own paragraph: ${lines[index]}`,
    )
    // Lowercase, for the reason the clearance gives: "Supports", capitalised and standing
    // beside a criterion and a level, is the vocabulary of a conformance REPORT.
    assert.equal(
      lines[index].slice(at, at + '(supports'.length),
      '(supports',
      `a conformance parenthetical stays lowercase: ${lines[index]}`,
    )
  }
})

// A follow-up change: the README's `## License` block carries the signed attribution line.
// The README is the only place this repository carries that line, so this asserts the landed
// bytes only, rather than minting a second copy here to compare them against.
const LICENSE_RANGE = sectionRange(README_LINES, README_HEADINGS, /^## License\b/, 2)
const licenseBody = bodyOf(README_LINES, LICENSE_RANGE)

// FOUR LIMBS, AND LIMB 2 IS THE ONE THAT HOLDS AN ASSERTION RATHER THAN A PRESENCE. Limbs 1 and
// 3 are presence checks: they hold that the 23 characters APPEAR in the block, visibly and
// once, never that the block ASSERTS them. Measured, not reasoned about: with only those two,
// `~~MIT © Nave Contributors~~`, `Not MIT © Nave Contributors`, a negating clause in front of
// the line and a `display: none` span around it were all GREEN, and the strikethrough is a
// two-character edit that RENDERS as a retraction of signed licensing copy. Limb 2 reds all
// four. The cleared unit (per the licensing steward's clearance, §6) is this line standing on
// its own, so holding the line is reading that clearance rather than widening it.
//
// LIMB 4 MAKES LIMBS 1 AND 2 HOLD WHAT THEY ALREADY SAY, and it exists because they did not.
// Limb 2 reads a line in ISOLATION, but "standing on its own" is a property of the line's BLOCK
// CONTEXT and not of the 23 bytes between two newlines. Measured: wrap the block in
// `<details><summary>Legal</summary>`, in `<div hidden>`, in `<div style="display:none">`, in
// `<div aria-hidden="true">` or in `<template>`, leaving the attribution on a line of its own,
// and limbs 1 to 3 are GREEN 7/7 on every one of them. Limb 1's own message says "where a reader
// can see it" and `visible()` strips HTML COMMENTS ONLY, so `<div hidden>` and `<template>` are
// invisible in exactly the sense limb 1 names while passing it, and `<template>` is not rendered
// at all. `<details>` is the other half of the class: visible, but collapsed behind a label this
// block never cleared. One line break is the whole difference between the single-line span limb
// 2 DOES red and the wrapper it does not.
//
// LIMB 4 REFUSES THE CONTAINER CLASS RATHER THAN ENUMERATING WHAT HIDES, and that choice is the
// point. Teaching `visible()` about `hidden`, `display:none`, `visibility:hidden`, `aria-hidden`
// and `<template>` is a known landmine in CSS instead of English: under-inclusive by
// construction, because the list is open and the next attribute is not on it. "This block
// carries no raw HTML" is closed, mechanically decidable, and OVER-inclusive instead, which is
// the safe direction for the reason the routing paragraph below gives. It constrains one
// PROPERTY of the block and never its bytes: prose stays free, and pinning the block stays
// refused for the reason the boundary paragraph gives.
//
// NO LIMB SUBSUMES ANOTHER, measured in every direction: limb 2 alone is GREEN on a MULTI-line
// `<!-- ... -->` wrapper (the inner line still folds to the attribution) and limb 1 reds it;
// limb 1 alone is GREEN on the strikethrough and limb 2 reds it; limbs 1 to 3 TOGETHER are GREEN
// on all five HTML containers above and limb 4 is the only one that reds them.
//
// IT FOLDS, IT DOES NOT `trim()`. Every comparison in this file folds whitespace on both sides
// because the README hard-wraps; this limb keeps that discipline and changes only the UNIT it
// folds, from the block to the line, so `MIT ©  Nave Contributors` stays green (whitespace is
// not the unit of meaning here) while `MIT © Nave Contributors.` does not. The right-hand side
// is already in folded form, so folding it would be a no-op.
//
// A RED HERE IS A ROUTING ACT, NOT A FALSE RED, and it is rung 1b's shape above. Bolding the
// line, wrapping part of it in a link, appending a clause to it or splitting it across two lines
// all red, and every one of those is a byte change to signed copy that costs a clearance turn on
// its own account: the red returns the edit to the project's licensing steward, who cleared this
// line by name. Limb 4's
// OVER-INCLUSION is that same act, and its extent is measured rather than asserted: it reds an
// `<a name>` anchor or a `<sub>` note added to this block, and it also reds the two ANGLE-BRACKET
// AUTOLINKS, `<https://...>` and `<mail@...>`, which are markdown rather than HTML and share only
// the delimiter. The autolink is the one genuinely lawful edit it over-reds, and it is named here
// rather than left to be discovered; the remedy is the ordinary markdown link, which stays green.
// Everything else in ordinary prose stays green, measured: `[the MIT licence](https://...)`, an
// added copyright-year line, a bare `<` in a sentence, `&lt;`/`&gt;` entities, and
// `See [LICENSE](./LICENSE) for the full text.` on the next line.
//
// WHERE THIS GUARD STOPS, stated as a position and not left as a gap. It holds the ATTRIBUTION'S
// OWN LINE, at the top level of this block's own prose. It does not, and no presence-shaped
// guard can, hold that the prose AROUND the line does not negate it: a retraction in the
// neighbouring sentence passes all four limbs, measured. Closing that would mean pinning the
// whole `## License` block, whose surrounding prose is not cleared copy and is not the
// project's licensing steward's to freeze, or minting a vocabulary of negations. A FENCED
// instance stays green for the reason
// `visible()` gives above (a reader sees it), and so do the line moved under a sub-heading
// inside the block (it is still under `## License`) and a four-space-indented instance (the
// fenced shape, rendered). Limb 4 is BLOCK-SCOPED, so a container opened in an earlier section
// and closed after this one is outside its reach, as it is outside the reach of anything scoped
// to this block. Four positions, not four gaps.
test('the README License block carries the signed attribution line', () => {
  assert.ok(
    visibleOccurrences(licenseBody, 'MIT © Nave Contributors') >= 1,
    'the ## License block must carry "MIT © Nave Contributors" (whitespace-folded) where a reader can see it: a commented-out attribution line is present to no one',
  )
  assert.ok(
    licenseBody.split('\n').some((line) => fold(line) === 'MIT © Nave Contributors'),
    'the ## License block must carry "MIT © Nave Contributors" as a line of its OWN: a substring check holds that the bytes appear, never that the block asserts them, so a strikethrough, a negating clause or a wrapper around the same bytes passes the other two limbs',
  )
  assert.equal(
    occurrences(licenseBody, 'MIT © Nave Contributors'),
    1,
    'the ## License block must carry "MIT © Nave Contributors" (whitespace-folded) exactly once, in the SOURCE: a second copy is the harmonisation shape, whether or not it is commented out',
  )
  assert.deepEqual(
    licenseBody.match(/<\/?[A-Za-z][^>]*>/g) ?? [],
    [],
    'the ## License block must carry no raw HTML: "a line of its own" is a property of the line\'s BLOCK CONTEXT, so a container on the lines AROUND it (<details>, <div hidden>, <template>) leaves the attribution on its own line while hiding, collapsing or relabelling it, and passes the other three limbs',
  )
})
