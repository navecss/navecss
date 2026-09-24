/**
 * AC-theming-34 / AC-theming-36 (R29/R30/R33 of the theming spec),
 * "as published" half — carved out of an earlier change.
 *
 * Both criteria are asserted today only against `packages/tokens/src/theming/ladder.ts`'s
 * `LADDER` constant (`packages/tokens/test/theming/ladder.test.ts`). The product lead's
 * ruling states that is not what "as published" ranges over: it means
 * `README.md`'s theming section at 0.1.0, landed in an earlier change.
 * `scripts/readme-theming-ladder.test.mjs`, added by that same carrier, implements
 * `AC-token-build-33`/`-34` instead — a different spec's criteria, asserting the five things
 * R33 adds on top of these two and nothing about what these two range over. This file is the
 * README-side coverage that gap names.
 *
 * `LADDER` STAYS INTERNAL. The product lead's ruling names exporting it as the trap: doing so
 * "would make the criterion pass while still not checking the thing it names" (the
 * proxy-assertion class an earlier issue was raised for). This file imports nothing from
 * `packages/tokens/src`; it reads the rendered `## Theming` section only.
 *
 * Fence-aware section parsing reused from `readme-sections.mjs` (extracted from
 * `readme-theming-ladder.test.mjs` at round 4 of an earlier review for this file and
 * `readme-cleared-copy.test.mjs`) rather than re-derived.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bodyOf, headingLines, readReadme, sectionRange } from './readme-sections.mjs'

const README = readReadme()
const README_LINES = README.split('\n')
const README_HEADINGS = headingLines(README_LINES)
const THEMING_RANGE = sectionRange(README_LINES, README_HEADINGS, /^## Theming\b/, 2)
const THEMING_LINES = bodyOf(README_LINES, THEMING_RANGE).split('\n')
const THEMING_HEADINGS = headingLines(THEMING_LINES)

// The ladder's rungs are DERIVED from the section's own headings, never hardcoded, for the
// same reason readme-theming-ladder.test.mjs derives them: a hardcoded list is blind to a rung
// added later and cannot tell "the ladder has no rungs" from "the list was right".
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

// A rung's OWN `- **Across 0.x:` bullet, and nothing else in the rung.
//
// The last rung of a section has no end-of-section token in markdown, so `rungBody('5')` runs
// to the end of `## Theming` and absorbs the ladder's closing paragraph. That over-range costs
// in both directions, both measured on this PR rather than reasoned about: a false GREEN, where
// rung 5's posture text migrates into the closing paragraph and a body-wide `assert.match`
// still finds it (a reviewer's item M4); and a latent false RED, where the closing paragraph
// may never carry the words this file forbids a rung to be documented with. The
// developer-relations reviewer ruled the closing paragraph stays exactly where it is, so the
// bound belongs in the instrument: an assertion ABOUT a rung's posture reads that rung's own
// bullet.
//
// The label has two spellings in this artifact (`**Across 0.x:** text` at rungs 0, 1a, 1b, 2, 3
// and `**Across 0.x: text**` at rungs 4 and 5), so the extraction keys on `- **Across 0.x:` as
// the bullet START and runs to the next bullet or the next blank line.
const ACROSS_BULLET = /^\s*[-*]\s+\*\*Across 0\.x:/
const NEXT_BULLET = /^\s*[-*]\s+\*\*/

function acrossBullet(name) {
  const lines = rungBody(name).split('\n')
  const start = lines.findIndex((line) => ACROSS_BULLET.test(line))
  assert.ok(start !== -1, `rung ${name} must carry an "Across 0.x" bullet of its own`)
  let end = start + 1
  while (end < lines.length && lines[end].trim() !== '' && !NEXT_BULLET.test(lines[end])) {
    end += 1
  }
  return lines.slice(start, end).join('\n')
}

// The POSTURE POSITION inside an `Across 0.x` bullet: the label, then the posture token that
// opens the bullet. `(?:\*\*)?` covers both label spellings for the same reason `acrossBullet`
// does. This is the only place in this file that reads a posture token, positively at rungs
// `1a`/`1b` (which R33 states ARE fine) and negatively at rung 3 (which it states is not).
//
// POSITIONAL, NOT A WORD SCAN, and the difference was measured. `AC-theming-36`'s round-24
// correction says rung 3's posture is "stated as R33 itself states it, a step-table change that
// re-derives underneath the consumer and may fight the pins that rung creates"; what that
// forbids is rung 3 documenting its POSTURE as fine, which is the shape rungs `1a`/`1b` use. A
// bare `/\bfine\b/` over the bullet forbids the English word instead, and `-` is a word
// boundary, so "Fine-grained control is what you are buying." added to rung 3's bullet RED this
// file at `5ec1816` while the R33 wording sat untouched in front of it.
const POSTURE_IS_FINE = /\*\*Across 0\.x:(?:\*\*)?\s*fine\b/i

test('AC-theming-34: the published ladder has seven rows, ordered 0, 1a, 1b, 2, 3, 4, 5', () => {
  assert.ok(RUNG_NAMES.length > 0, 'the heading scan found no rungs at all in the Theming section')
  assert.deepEqual(
    RUNG_NAMES,
    ['0', '1a', '1b', '2', '3', '4', '5'],
    'G1 R29 fixes the ladder at these seven rows in this order',
  )
})

test('AC-theming-34: every published rung declares all five of what-you-write/where/cost/preserves/voids', () => {
  const labels = [
    'What you write',
    'Where it lives',
    'What it costs',
    'What it preserves',
    'What it voids',
  ]
  for (const name of RUNG_NAMES) {
    const body = rungBody(name)
    for (const label of labels) {
      assert.match(
        body,
        new RegExp(String.raw`\*\*${label}:\*\*\s*\S`),
        `rung ${name} must declare a non-empty "${label}"`,
      )
    }
  }
})

test('AC-theming-34: rung 0 is documented reserved, with zero presets shipped at 0.1.0', () => {
  const rung0 = rungBody('0')
  assert.match(rung0, /reserved/i, 'rung 0 must be documented as reserved')
  assert.match(rung0, /ships no presets/i, 'rung 0 must state that 0.1.0 ships no presets')
})

// PINNING ROW (round-3 terminal read; free under a later ruling).
// The posture assertions in this file range over rungs 1a/1b, 3, and 4/5, so rungs 0 and 2 are
// the two `AC-theming-34`'s "each rung records its 0.x posture" clause covers that no row read.
// MEASURED, not assumed: deleting rung 0's `**Across 0.x:**` bullet, and deleting rung 2's, each
// left the whole `scripts:test` suite at 454/454 GREEN. Ranged over `RUNG_NAMES` rather than over
// the two by name so a rung added later is pinned by construction, which is the same reason the
// names are derived from the section's own headings rather than hardcoded.
test('AC-theming-34: every published rung records its own 0.x posture, in a bullet of its own', () => {
  for (const name of RUNG_NAMES) {
    assert.match(
      rungBody(name),
      /^\s*[-*]\s+\*\*Across 0\.x:/m,
      `rung ${name} must record its own 0.x upgrade posture, in its own "Across 0.x" bullet`,
    )
  }
})

test('AC-theming-34: rungs 1a and 1b document a fine 0.x upgrade posture', () => {
  for (const name of ['1a', '1b']) {
    assert.match(
      acrossBullet(name),
      POSTURE_IS_FINE,
      `rung ${name} must document a "fine" 0.x upgrade posture`,
    )
  }
})

test('AC-theming-34: rungs 4 and 5 document an unbounded-in-0.x, bounded-at-1.0 upgrade posture', () => {
  for (const name of ['4', '5']) {
    const bullet = acrossBullet(name)
    assert.match(bullet, /unbounded in 0\.x/i, `rung ${name} must document "unbounded in 0.x"`)
    assert.match(bullet, /bounded at 1\.0/i, `rung ${name} must document "bounded at 1.0"`)
  }
})

test('AC-theming-36: rungs 1b, 3, 4 and 5 are each documented as reached through the entry point', () => {
  for (const name of ['1b', '3', '5']) {
    assert.match(
      rungBody(name),
      /navecss-tokens/,
      `rung ${name} must show the entry point (\`navecss-tokens\`) invoked`,
    )
  }
  // Rung 4 documents the entry point being invoked FROM the consumer's own build rather than
  // showing the binary literally, which is the rung's own point (R33(c)): there is no config
  // file, and what changes is who supplies the inputs.
  assert.match(
    rungBody('4'),
    /\bentry point\b/i,
    "rung 4 must document the entry point being invoked from the consumer's own build",
  )
})

// Deliberately reads the WHOLE rung body, not the `**Across 0.x:**` bullet the posture
// assertions above read. A posture IS its bullet, so scoping those to it is fidelity; this
// clause is not about the posture. `AC-theming-36` ranges over how the RUNG IS DOCUMENTED, so
// a rung called unavailable in its lead prose violates the criterion exactly as much as one
// called unavailable in its bullet, and bullet-scoping here was MEASURED to lose that catch
// (round 2, probe P4b: RED at the wider range, GREEN at the narrower).
// The cost accepted in exchange is a latent false red: markdown has no end-of-section token, so
// the ladder's closing paragraph falls inside the last rung's body and a coda that ever says
// "not available" reds this test. That construction is absent from HEAD, and under
// an earlier ruling a present catch outranks a false red on bytes that do not exist.
//
// THE RANGE STAYS WIDE AND THE DIAGNOSTIC IS WHAT WAS FIXED (the
// gate-disposition pass). Every scheme that bounds the last rung's body trades this loud false
// RED for a silent false GREEN, which is the worse direction: the bound would have to truncate
// at the rung's final bullet block, and a rung 5 that later grew a trailing prose sentence
// saying it is not available would be dropped un-scanned by the one assertion written to catch
// it. What the false red actually costs a reader is misdirection, not noise — measured at
// `5ec1816`, a coda reading "No rung is documented as not available." failed with `rung 5 must
// not be documented as unavailable`, sending its reader to a rung whose own text is clean. So
// the failure now quotes what it matched and where, and the verdict on every input is unmoved.
const UNAVAILABLE =
  /\bnot\b(?:\s+\w+){0,2}\s+(?:shipped|available|supported|implemented)\b|unavailable|unsupported|(?:merely|only|just)\s+tracked|tracked (?:on|in|at) (?:an? )?(?:open )?issue/i

/**
 * The line containing raw offset `at` in `text`, and its 1-based number within `text`.
 */
function lineAt(text, at) {
  const before = text.slice(0, at)
  const start = before.lastIndexOf('\n') + 1
  const end = text.indexOf('\n', at)
  return {
    number: before.split('\n').length,
    text: text.slice(start, end === -1 ? text.length : end),
  }
}

test('AC-theming-36: none of rungs 1b, 3, 4 or 5 is documented as unavailable, unsupported or merely tracked', () => {
  for (const name of ['1b', '3', '4', '5']) {
    const body = rungBody(name)
    const hit = UNAVAILABLE.exec(body)
    let message = `rung ${name} must not be documented as unavailable, unsupported or merely tracked`
    if (hit !== null) {
      const where = lineAt(body, hit.index)
      message += `. Matched ${JSON.stringify(hit[0])} on line ${where.number} of the rung body: ${JSON.stringify(where.text)}. Note that the last rung's body runs to the end of "## Theming", so it includes the ladder's closing paragraph`
    }
    assert.doesNotMatch(body, UNAVAILABLE, message)
  }
})

// --- AC-theming-34's ORDERING clauses. Nothing above reads them, and they are most of what
// --- the criterion's own `Then` says: the primary key, rung 3-to-4's retention EQUALITY, the
// --- subordinate key stated in the ladder's own words, and the two readings the criterion
// --- names as FAILING by name.

const THEMING = bodyOf(README_LINES, THEMING_RANGE)

test("AC-theming-34: the ladder states its PRIMARY key, how much of Nave's generation is retained", () => {
  assert.match(
    THEMING,
    /ordered by[\s\S]{0,120}?keep/i,
    "the ladder must state that its primary key is how much of Nave's generation the rung retains",
  )
})

test('AC-theming-34: rung 4 keeps everything rung 3 keeps, the generated ramp included', () => {
  const preserves = /\*\*What it preserves:\*\*([\s\S]*?)(?:\n- \*\*|$)/.exec(rungBody('4'))
  assert.ok(preserves, 'rung 4 must declare what it preserves')
  assert.match(
    preserves[1],
    /everything Nave generates[\s\S]*?\bramp\b/i,
    'AC-theming-34: rung 4 keeps everything rung 3 keeps, the generated ramp included',
  )
  assert.doesNotMatch(
    preserves[1],
    /\bless than rung 3\b|\brung 3 keeps more\b/i,
    'a row that states rung 4 keeps LESS than rung 3 fails AC-theming-34 by name',
  )
})

test("AC-theming-34: the ladder STATES rung 3-to-4's subordinate key rather than leaving it to be inferred", () => {
  assert.match(
    THEMING,
    /rung 4[\s\S]{0,200}?second measure[\s\S]{0,200}?(?:stable input shape|stability)/i,
    'the ladder must state, in its own text, that rung 3 to rung 4 is ordered on a SECOND key (published stability / a stable input shape), not on retention',
  )
})

test('AC-theming-34: the ladder does not present retention as the ONLY property ordering all seven rows', () => {
  assert.doesNotMatch(
    THEMING,
    /retention is the only|ordered by (?:exactly )?that and by nothing else|the only property that (?:decreases|increases)/i,
    'a reading that treats retention as the only property increasing monotonically down all seven rows fails AC-theming-34 by name',
  )
})

test("AC-theming-34/-36: rung 4's 0.x posture is grounded in the entry point's INVOCATION SURFACE, never in a config file", () => {
  const rung4 = rungBody('4')
  assert.match(
    rung4,
    /invocation surface/i,
    "rung 4 must ground its 0.x cost in the entry point's invocation surface",
  )
  for (const named of [/flag names/i, /exit codes/i]) {
    assert.match(rung4, named, `rung 4 must name ${named.source} as part of that surface`)
  }
  assert.doesNotMatch(
    rung4,
    /(?:configuration|config) file[^.]{0,80}(?:unstable|unbounded|move before 1\.0|reserve the right)|(?:unstable|unbounded)[^.]{0,80}(?:configuration|config) file/i,
    'a ladder that grounds this key in a Nave-owned config file fails AC-theming-34 by name: no such file exists at 0.1.0 and none may be named',
  )
})

test("AC-theming-36: rung 0's reservation is a SCOPE decision, never attributed to a missing entry point", () => {
  assert.doesNotMatch(
    rungBody('0'),
    /because[^.]{0,80}\bbuild\b|\bbuild\b[^.]{0,40}(?:cannot|can't|does not|doesn't|is not able)/i,
    "AC-theming-36: rung 0's absence is never attributed to a missing entry point",
  )
  assert.match(
    rungBody('0'),
    /scope decision/i,
    'rung 0 must state its reservation as a scope decision (R29)',
  )
})

// ONE EXTRACTOR IN THIS FILE, NOT TWO. This test read its bullet through an inline
// `/\*\*Across 0\.x:\*\*([\s\S]*?).../` while rungs 4 and 5 read theirs through
// `acrossBullet()`, and the two do not agree: the inline one knows only the first label
// spelling, so re-spelling rung 3's bullet the lawful second way (the way rungs 4 and 5 already
// ship, content byte-identical) RED this file at `5ec1816` with `rung 3 must carry an "Across
// 0.x" bullet` — a message that is false about the artifact it is reading. Measured, not argued
// from tidiness; it is the same "points its reader at the wrong thing" defect the review
// already fixed once in the sibling guard.
test("AC-theming-36: rung 3's 0.x posture is R33's, a re-derivation that may fight the pins this rung creates", () => {
  const bullet = acrossBullet('3')
  assert.match(
    bullet,
    /re-derives?[\s\S]{0,80}?fight[\s\S]{0,40}?\bpins\b/i,
    "AC-theming-36: rung 3 must state R33's own posture, a step-table change that re-derives underneath the consumer and may fight the pins this rung creates",
  )
  // The two forbidden postures are two limbs, because they are two different shapes. "fine" is
  // an ordinary English word and is forbidden only in the POSTURE POSITION (see
  // `POSTURE_IS_FINE`); "unbounded in 0.x" is a posture claim wherever it sits in the bullet and
  // is nobody's ordinary prose, so it stays a phrase scan.
  assert.doesNotMatch(
    bullet,
    POSTURE_IS_FINE,
    'rung 3 must not document its posture as fine: R33 states "fine at rungs 1a and 1b" and names rung 3, in the same parenthesis, as where the re-derivation fights the consumer\'s pins',
  )
  assert.doesNotMatch(
    bullet,
    /\bunbounded in 0\.x\b/i,
    'rung 3 must not document its posture as unbounded in 0.x: R33 reserves that for rungs 4 and 5',
  )
})

test('AC-theming-36: rungs 1b, 3, 4 and 5 each name their own upgrade posture', () => {
  for (const name of ['1b', '3', '4', '5']) {
    assert.match(
      rungBody(name),
      /\*\*Across 0\.x:/i,
      `rung ${name} must name its own "Across 0.x" upgrade posture`,
    )
  }
})
