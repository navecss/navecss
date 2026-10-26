/**
 * AC-theming-34 / AC-theming-36 (R29/R30/R33 of the theming spec),
 * "as published" half — carved out of an earlier change.
 *
 * Both criteria are asserted today only against `packages/tokens/src/theming/ladder.ts`'s
 * `LADDER` constant (`packages/tokens/test/theming/ladder.test.ts`). That is not what
 * "as published" ranges over: it means
 * `README.md`'s theming section at 0.1.0, landed in an earlier change.
 * `scripts/readme-theming-ladder.test.mjs`, added by that same carrier, implements
 * `AC-token-build-33`/`-34` instead — a different spec's criteria, asserting the five things
 * R33 adds on top of these two and nothing about what these two range over. This file is the
 * README-side coverage that gap names.
 *
 * `LADDER` STAYS INTERNAL. Exporting it is the trap: doing so would make the
 * criterion pass while still not checking the thing it names (the
 * proxy-assertion class an earlier issue was raised for). This file imports nothing from
 * `packages/tokens/src`; it reads the rendered `## Theming` section only.
 *
 * Fence-aware section parsing reused from `readme-sections.mjs` (extracted from
 * `readme-theming-ladder.test.mjs` for this file and
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
// still finds it; and a latent false RED, where the closing paragraph
// may never carry the words this file forbids a rung to be documented with. The
// closing paragraph stays exactly where it is, so the
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

// PINNING ROW.
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

// RUNG 4's REACH is an AFFIRMATIVE claim, and the phrase "entry point" appearing in the rung does
// not make it. Rung 4 shows no `navecss-tokens` (the rung's point, R33(c), is that the consumer's
// own build supplies the inputs), so what it must say is that the consumer's build reaches the
// entry point: the published text says "the script or the task that invokes the entry point".
// Scanning for the phrase alone passed a rung 4 reduced to "This rung is not reached through the
// entry point at all.", which says the opposite.
//
// HOW IT READS. The rung is cut into sentences (a bullet start counts as a boundary, since a
// rung's bullets carry no full stop between them, and the full stop of "e.g.", "i.e.", "etc." or
// "vs." does not end one), each sentence into clauses at `;` and `:`, and each clause into
// lower-cased words, with the comma-separated segment each word sits in. Every check below
// compares word POSITIONS inside one clause, so a negation stops where its clause does: "You do
// not need a config file; your build invokes the entry point." is the affirmative, not a denial.
// The only patterns run over README text are the sentence and word splitters, and neither can
// backtrack; every check after them is a comparison of word positions.
//
// THE OBJECT is "the entry point" (also spelled "entrypoint" or "entry-point", after a possessive
// such as "Nave's", or itself possessive, as in "the entry point's CLI" or "the entry-point's
// CLI"), `navecss-tokens`, or, for a denial only, the pronoun "it" ("does not invoke it"). Up to
// five words may sit between the verb and "entry point", so four before "the entry point"
// ("invokes, on every single pass, the entry point"), and at most one between the verb and the
// pronoun or the binary. A negator in that gap, in the object's own comma segment, negates the
// object: "invokes no entry point".
//
// A NEGATOR is not, never, cannot, no, nothing, none, nobody, neither, impossible, any n't word
// (either apostrophe), fails to, unable to, prevented from, without, unlike, instead of or rather
// than. Its SCOPE depends on where it sits:
// - one that opens a comma segment after the first, or sits in a segment opening with where /
//   which / who / whose / that, negates only that segment: "Your build, not Nave, invokes the
//   entry point." and "The entry point, which reads no file, is invoked by your build." deny
//   nothing. An aside opened by a negator negates only itself when it names an alternative
//   invoker, that is when the first word after the negator and any determiners names Nave or the
//   consumer ("not Nave", "not a Nave config file"). Otherwise it qualifies the verb and negates
//   the whole clause: "Your build, never once, invokes the entry point." and "Your build, never
//   in any of its steps, invokes the entry point." deny;
// - without, unlike, instead of and rather than govern a phrase, so their scope is their own
//   segment plus any that open with a relative word: "Instead of invoking the entry point, ..."
//   and "Unlike rung 3, where your build invokes the entry point, ..." deny, while "Instead of a
//   seed you typed into a script once, your own build invokes the entry point" does not;
// - any other runs to the end of the clause, or to a joining word (and, but, so, because, since,
//   while, then and the like) that starts a new clause without punctuation: "No file is
//   discovered, and your build invokes the entry point." denies nothing. A joining word inside a
//   middle segment, closed by commas on both sides, is a parenthetical and does not end the scope:
//   "Your build has never, since 0.1.0, invoked the entry point." denies.
//
// A CLAUSE DENIES REACH when any of these holds:
// - a negator is followed, in its scope, by a reach verb (reach, invoke, call, run, use, go
//   through) whose object follows it: "Nothing invokes the entry point.", "Your build does not, at
//   any point in the steps described above, invoke the entry point.";
// - a reach verb is followed by a negated object: "Your build calls no entry point.";
// - "the entry point" is followed by a negator and then, within three words and the negator's
//   scope, a reach verb: "The entry point is not directly invoked.", "... is no longer invoked";
// - an avoidance verb (bypass, circumvent, skip, avoid, go around / past, stop short of) has the
//   object after it, or "the entry point" is followed within three words by one: "The entry
//   point is bypassed.";
// - the clause ends on a negated auxiliary after a pronoun subject, in a sentence that names the
//   entry point: "Your build is meant to invoke the entry point, but it never does.", "...; it does
//   not.". After another subject it is not a denial of reach: "Your build invokes the entry
//   point; Nave does not.".
// "The entry point reads nothing it was not handed: no file is discovered." holds "not",
// "nothing" and "no" beside the entry point and denies nothing, because none of them reaches a
// reach verb.
//
// A SENTENCE AFFIRMS REACH when it denies nothing and one clause has invoke, run or call with the
// object after it ("Your build runs `navecss-tokens`", "invokes Nave's entry point"), or the
// passive "the entry point is invoked / run / called by ...", where an aside between commas after
// the entry point is skipped. The invoker must be the consumer's side.
// - A word NAMES THE CONSUMER when it is "you", "your" or "yourself", or a build, script, task,
//   bundler, pipeline, makefile, runner, job, workflow, CI, toolchain, step or codegen noun (plural
//   or possessive too) that is the consumer's. Such a noun is Nave's instead when, within three
//   words before it and back to its determiner, a word starts with "nave" or the word "token" or
//   "tokens" appears with no owner ("Nave's build", "the token build"); an owner ("your", "our",
//   "the consumer's") makes it the consumer's ("your token build"). It is also Nave's when its
//   determiner is "a" or "its" and the clause names Nave before it ("Nave ships a build that ..."),
//   looking back no further than a joining word and skipping an aside between commas. A word NAMES
//   NAVE when it starts with "nave" (Nave, Nave's, navecss-tokens). A bare "token" or "tokens"
//   names neither side.
// - For the active form, the invoker is the first word that names either side, walking back from
//   the verb through its clause and skipping an aside between commas. A relative clause is walked
//   through to its antecedent the same way, which is how the published "the script or the task
//   that invokes the entry point" finds "task". Past a subject pronoun ("it", "they") the walk
//   continues into the sentence's earlier clauses, so "Your build is the invoker: it invokes the
//   entry point." affirms and "It invokes the entry point." alone does not.
// - For the passive, the invoker is the first word that names either side after "by", read to
//   the end of its aside or clause.
// So "Nave invokes the entry point for you." and "The entry point is invoked by Nave." are not the
// affirmative. Rung 4 must carry one, and every sentence of it is also checked for a denial, so a
// denial placed beside the affirmative still reds. This reads English with word lists and
// positions, not a grammar: it closes the forms listed in the rows below and keeps the published
// sentences green, and a denial phrased outside these lists would still pass.
const REACH_VERBS = new Set(
  ['reach', 'invoke', 'call', 'run', 'use'].flatMap((verb) => verbForms(verb)),
)
const INVOKING_VERBS = new Set(['invoke', 'call', 'run'].flatMap((verb) => verbForms(verb)))
const INVOKED_PARTICIPLES = new Set(['invoked', 'called', 'run'])
const GO = new Set(['go', 'goes', 'going', 'went', 'gone'])
const STOP = new Set(['stop', 'stops', 'stopped', 'stopping'])
const AVOIDING_STEMS = ['bypass', 'circumvent', 'skip', 'avoid']
const NEGATORS = new Set([
  'not',
  'never',
  'cannot',
  'no',
  'nothing',
  'none',
  'nobody',
  'neither',
  'impossible',
])
// Two-word negators: the first word, and the word that must follow it.
const PAIRED_NEGATORS = new Map([
  ...['fail', 'fails', 'failed', 'failing'].map((word) => [word, 'to']),
  ['prevented', 'from'],
  ['unable', 'to'],
])
const PHRASE_NEGATORS = new Set(['without', 'unlike'])
const CLAUSE_BREAKERS = new Set([
  'and',
  'but',
  'so',
  'yet',
  'because',
  'since',
  'while',
  'whereas',
  'although',
  'though',
  'then',
])
const RELATIVES = new Set(['where', 'which', 'who', 'whose', 'that'])
const PRONOUNS = new Set(['it', 'they', 'this', 'that'])
const AUXILIARIES = new Set(['do', 'does', 'did', 'will', 'would', 'can', 'could', 'is', 'was'])
const ENTRY_POINT_HEADS = new Set(['point', 'points', "point's", "points'"])
const CLOSED_UP_ENTRY_POINTS = ['entrypoint', 'entry-point']
// Words that name what invokes the entry point on the consumer's side.
const CONSUMER_HEADS = new Set(
  [
    'build',
    'script',
    'task',
    'bundler',
    'pipeline',
    'makefile',
    'runner',
    'job',
    'workflow',
    'ci',
    'toolchain',
    'step',
    'codegen',
  ].flatMap((noun) => [noun, `${noun}s`, `${noun}'s`, `${noun}s'`]),
)
// Words that name the consumer directly.
const CONSUMER_WORDS = new Set(['you', 'your', 'yourself'])
// Determiners that make what follows the consumer's own.
const OWNERS = new Set(['your', 'our', "consumer's"])
const DETERMINERS = new Set(['the', 'a', 'an', 'its', 'their', 'this', 'that'])
// After Nave is named in the clause, a build these introduce is Nave's ("Nave ships a build").
const NAVE_OWNED_DETERMINERS = new Set(['a', 'its'])
// Subject pronouns, read through to the invoker they stand for.
const SUBJECT_PRONOUNS = new Set(['it', 'they'])
const WORD = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu

function verbForms(verb) {
  if (verb === 'run') return ['run', 'runs', 'ran', 'running']
  const stem = verb.endsWith('e') ? verb.slice(0, -1) : verb
  const third = verb.endsWith('h') ? `${verb}es` : `${verb}s`
  return [verb, third, `${stem}ed`, `${stem}ing`]
}

// Sentences, with a bullet start counting as a boundary. The text is whitespace-collapsed first,
// so each split point is one literal space; the full stop of a listed abbreviation is not one.
function sentencesOf(text) {
  return text
    .replaceAll(/\s+/g, ' ')
    .split(/(?<=[.!?])(?<!\b(?:e\.g|i\.e|etc|vs)\.) | - (?=\*\*)/i)
    .filter((sentence) => sentence.trim() !== '')
}

// "entrypoint", "entry-point" and their plurals and possessives, as the two words "entry" and
// "point..." the checks read; null for any other word.
function splitClosedUp(word) {
  const stem = CLOSED_UP_ENTRY_POINTS.find((spelling) => word.startsWith(spelling))
  if (stem === undefined) return null
  const head = `point${word.slice(stem.length)}`
  return ENTRY_POINT_HEADS.has(head) ? ['entry', head] : null
}

// A clause's words, lower-cased, each with the index of the comma segment it sits in.
function wordsOf(clause) {
  const words = []
  const segments = clause.replaceAll('’', "'").toLowerCase().split(',')
  for (const [segment, text] of segments.entries()) {
    for (const [word] of text.matchAll(WORD)) {
      for (const part of splitClosedUp(word) ?? [word]) words.push({ word: part, segment })
    }
  }
  return words
}

const isEntryPointAt = (words, i) =>
  words[i]?.word === 'entry' && ENTRY_POINT_HEADS.has(words[i + 1]?.word)

const isNegatorWord = (word) => NEGATORS.has(word) || word.endsWith("n't")

// A segment after the first that commas close on both sides: a parenthetical.
const isClosedMiddle = (words, segment) => segment > 0 && segment < (words.at(-1)?.segment ?? 0)

// The object that starts within the allowed gap after `from` and before `end`: 'object', or
// 'negated' when a negator sits before it in its own comma segment, or null when there is none.
function objectFollows(words, from, end, { pronoun }) {
  for (let i = from; i < Math.min(end, from + 6); i += 1) {
    const near = i - from <= 1
    const word = words[i].word
    const found =
      isEntryPointAt(words, i) ||
      (near && word === 'navecss-tokens') ||
      (near && pronoun && word === 'it')
    if (found) {
      const gap = words.slice(from, i)
      const negated = gap.some((w) => w.segment === words[i].segment && isNegatorWord(w.word))
      return negated ? 'negated' : 'object'
    }
  }
  return null
}

// Whether the negator at `i` opens a comma segment after the first, or sits in one that opens
// with a relative word: either way it negates only that segment.
function negatesOnlyItsSegment(words, i) {
  const segment = words[i].segment
  if (segment === 0) return false
  const start = words.findIndex((w) => w.segment === segment)
  if (RELATIVES.has(words[start].word)) return true
  return start === i && asideNamesAlternative(words, i)
}

// Whether the aside the negator at `i` opens names an alternative invoker: the first word after
// the negator and any determiners names Nave or the consumer ("not Nave", "not a Nave config
// file"). An aside that names none ("never once", "never in any of its steps") qualifies the verb
// instead, so it negates the whole clause.
function asideNamesAlternative(words, i) {
  let k = i + 1
  while (k < words.length && (DETERMINERS.has(words[k].word) || OWNERS.has(words[k].word))) {
    k += 1
  }
  if (k >= words.length || words[k].segment !== words[i].segment) return false
  return sideAt(words, k) !== null
}

// The index after a negator starting at `i`, and the kind of scope it has, or null.
function negatorAt(words, i) {
  const word = words[i].word
  const next = words[i + 1]?.word
  const own = negatesOnlyItsSegment(words, i) ? 'segment' : 'clause'
  if (isNegatorWord(word)) return { after: i + 1, scope: own }
  if (PAIRED_NEGATORS.has(word) && PAIRED_NEGATORS.get(word) === next) {
    return { after: i + 2, scope: own }
  }
  if (PHRASE_NEGATORS.has(word)) return { after: i + 1, scope: 'phrase' }
  const pair = `${word} ${next}`
  if (pair === 'instead of' || pair === 'rather than') return { after: i + 2, scope: 'phrase' }
  return null
}

// The index after a reach verb starting at `i`, or null. "go" reaches only as "go through".
function reachVerbAt(words, i) {
  if (REACH_VERBS.has(words[i].word)) return i + 1
  if (GO.has(words[i].word) && words[i + 1]?.word === 'through') return i + 2
  return null
}

// The index after an avoidance verb starting at `i`, or null.
function avoidanceAt(words, i) {
  const word = words[i].word
  if (AVOIDING_STEMS.some((stem) => word.startsWith(stem))) return i + 1
  const next = words[i + 1]?.word
  if ((next === 'around' || next === 'past') && GO.has(word)) return i + 2
  if (next === 'short' && words[i + 2]?.word === 'of' && STOP.has(word)) return i + 3
  return null
}

// Where a scope that starts at `from` ends, for a 'clause', 'phrase' or 'segment' scope.
function scopeEnd(words, from, scope) {
  const home = words[from - 1]?.segment ?? 0
  for (let i = from; i < words.length; i += 1) {
    const { word, segment } = words[i]
    if (scope === 'segment' && segment !== home) return i
    if (CLAUSE_BREAKERS.has(word) && !isClosedMiddle(words, segment)) return i
    const opensSegment = segment !== words[i - 1]?.segment
    if (scope === 'phrase' && opensSegment && !RELATIVES.has(word)) return i
  }
  return words.length
}

function negatedReach(words, at) {
  const negator = negatorAt(words, at)
  if (negator === null) return false
  const end = scopeEnd(words, negator.after, negator.scope)
  for (let i = negator.after; i < end; i += 1) {
    const after = reachVerbAt(words, i)
    if (after !== null) return objectFollows(words, after, end, { pronoun: true }) !== null
  }
  return false
}

function reachesNegatedObject(words, at) {
  const after = reachVerbAt(words, at)
  if (after === null) return false
  return (
    objectFollows(words, after, scopeEnd(words, after, 'clause'), { pronoun: true }) === 'negated'
  )
}

// "the entry point" at `at`, then a negator, then a reach verb within three words and the
// negator's scope.
function entryPointNegated(words, at) {
  if (!isEntryPointAt(words, at)) return false
  const end = scopeEnd(words, at + 2, 'clause')
  for (let i = at + 2; i < end; i += 1) {
    const negator = negatorAt(words, i)
    if (negator === null) continue
    const stop = Math.min(scopeEnd(words, negator.after, negator.scope), negator.after + 3)
    for (let k = negator.after; k < stop; k += 1) {
      if (reachVerbAt(words, k) !== null) return true
    }
  }
  return false
}

function avoided(words, at) {
  const after = avoidanceAt(words, at)
  if (after !== null) {
    return objectFollows(words, after, scopeEnd(words, after, 'clause'), { pronoun: true }) !== null
  }
  if (!isEntryPointAt(words, at)) return false
  const window = words.slice(at + 2, at + 5)
  return window.some((_, k) => avoidanceAt(words, at + 2 + k) !== null)
}

// Whether the clause ends on a negated auxiliary ("does not", "never does", "doesn't", an
// optional trailing "so") whose subject is a pronoun.
function endsOnNegatedAuxiliary(words) {
  const tail = (words.at(-1)?.word === 'so' ? words.slice(0, -1) : words).map((w) => w.word)
  const [third, before, last] = [tail.at(-3), tail.at(-2), tail.at(-1)]
  if (last === undefined) return false
  if (last.endsWith("n't")) return PRONOUNS.has(before)
  const negated = (word) => word === 'not' || word === 'never'
  const elided =
    (negated(before) && AUXILIARIES.has(last)) || (AUXILIARIES.has(before) && negated(last))
  return elided && PRONOUNS.has(third)
}

function clauseDenies(words) {
  return words.some(
    (_, i) =>
      negatedReach(words, i) ||
      reachesNegatedObject(words, i) ||
      entryPointNegated(words, i) ||
      avoided(words, i),
  )
}

const clausesOf = (sentence) => sentence.split(/[;:]/).map((clause) => wordsOf(clause))

function deniesReach(sentence) {
  const clauses = clausesOf(sentence)
  const namesEntryPoint = clauses.some((words) => words.some((_, i) => isEntryPointAt(words, i)))
  return clauses.some(
    (words) => clauseDenies(words) || (namesEntryPoint && endsOnNegatedAuxiliary(words)),
  )
}

// The first `count` word indexes from `from`, skipping a parenthetical segment that is not the
// one `from` starts in.
function nextWords(words, from, count) {
  const home = words[from - 1]?.segment
  const picked = []
  for (let i = from; i < words.length && picked.length < count; i += 1) {
    const segment = words[i].segment
    if (segment === home || !isClosedMiddle(words, segment)) picked.push(i)
  }
  return picked
}

const isTokenWord = (word) => word === 'token' || word === 'tokens'

// Whether the consumer-side noun at `head` is the consumer's rather than Nave's, read from the
// up to three words before it, back to its determiner: an owner ("your", "our", "the consumer's")
// makes it the consumer's; a Nave word, or "token" without an owner, makes it Nave's; and "a" or
// "its" make it Nave's when the clause names Nave before it ("Nave ships a build").
function namesConsumer(words, head) {
  let token = false
  for (let k = head - 1; k >= Math.max(0, head - 3); k -= 1) {
    const { word, segment } = words[k]
    if (segment !== words[head].segment) break
    if (OWNERS.has(word)) return true
    if (word.startsWith('nave')) return false
    token ||= isTokenWord(word)
    if (DETERMINERS.has(word)) {
      return !token && !(namesNaveBefore(words, k) && NAVE_OWNED_DETERMINERS.has(word))
    }
  }
  return !token
}

// Whether the clause names Nave before index `k`, looking back no further than a joining word
// (and, but, so ...) and skipping an aside between commas, as the invoker walk does: in "Nave ships
// the tokens, and a build script invokes ...", the build is not Nave's.
function namesNaveBefore(words, k) {
  for (let j = k - 1; j >= 0; j -= 1) {
    const { word, segment } = words[j]
    if (segment !== words[k].segment && isClosedMiddle(words, segment)) continue
    if (CLAUSE_BREAKERS.has(word)) return false
    if (word.startsWith('nave')) return true
  }
  return false
}

// The side the word at `k` names: 'consumer', 'nave', or null for a word that names neither. A
// bare "token" or "tokens" is not an invoker, so it names neither.
function sideAt(words, k) {
  const word = words[k].word
  if (CONSUMER_WORDS.has(word)) return 'consumer'
  if (word.startsWith('nave')) return 'nave'
  if (CONSUMER_HEADS.has(word)) return namesConsumer(words, k) ? 'consumer' : 'nave'
  return null
}

// The side that invokes the active verb at `verb` in clause `c` of a sentence: the first word,
// walking back through the clause and skipping an aside between commas, that names either side.
// Past a subject pronoun ("it", "they") the walk continues into the sentence's earlier clauses,
// so the pronoun takes the side of the invoker it stands for.
function invokerSide(clauses, c, verb) {
  let pronoun = false
  for (let at = c; at >= 0; at -= 1) {
    const words = clauses[at]
    for (let k = (at === c ? verb : words.length) - 1; k >= 0; k -= 1) {
      const aside = at === c && words[k].segment !== words[verb].segment
      if (aside && isClosedMiddle(words, words[k].segment)) continue
      pronoun ||= SUBJECT_PRONOUNS.has(words[k].word)
      const side = sideAt(words, k)
      if (side !== null) return side
    }
    if (!pronoun) return null
  }
  return null
}

// The side the agent of a passive names: the first naming word after the "by" at `by`, read to
// the end of its aside, or of its clause.
function agentSide(words, by) {
  const segment = words[by].segment
  const inAside = isClosedMiddle(words, segment)
  const end = inAside ? words.findLastIndex((w) => w.segment === segment) + 1 : words.length
  for (let k = by + 1; k < Math.min(end, scopeEnd(words, by + 1, 'clause')); k += 1) {
    const side = sideAt(words, k)
    if (side !== null) return side
  }
  return null
}

function clauseAffirms(clauses, c) {
  const words = clauses[c]
  return words.some((_, i) => {
    if (INVOKING_VERBS.has(words[i].word)) {
      const end = scopeEnd(words, i + 1, 'clause')
      const object = objectFollows(words, i + 1, end, { pronoun: false })
      return object === 'object' && invokerSide(clauses, c, i) === 'consumer'
    }
    if (!isEntryPointAt(words, i)) return false
    return nextWords(words, i + 2, 3).some(
      (k) =>
        INVOKED_PARTICIPLES.has(words[k].word) &&
        words[k + 1]?.word === 'by' &&
        agentSide(words, k + 1) === 'consumer',
    )
  })
}

function affirmsReach(sentence) {
  if (deniesReach(sentence)) return false
  const clauses = clausesOf(sentence)
  return clauses.some((_, c) => clauseAffirms(clauses, c))
}

function rung4ReachProblems(text) {
  const sentences = sentencesOf(text)
  const problems = sentences
    .filter((sentence) => deniesReach(sentence))
    .map((sentence) => `rung 4 denies the entry point's reach: ${JSON.stringify(sentence)}`)
  if (sentences.every((sentence) => !affirmsReach(sentence))) {
    problems.push('rung 4 never says its own build invokes the entry point')
  }
  return problems
}

const PUBLISHED_RUNG_4 = rungBody('4')

test('AC-theming-36: rungs 1b, 3 and 5 show the entry point invoked, and rung 4 says its own build invokes it', () => {
  for (const name of ['1b', '3', '5']) {
    assert.match(
      rungBody(name),
      /navecss-tokens/,
      `rung ${name} must show the entry point (\`navecss-tokens\`) invoked`,
    )
  }
  assert.deepEqual(rung4ReachProblems(rungBody('4')), [])
})

const RUNG_4_DENIALS = [
  'This rung is not reached through the entry point at all.',
  'Your build does not invoke the entry point.',
  'Your build does not invoke it.',
  'Your build bypasses the entry point.',
  'Your build goes around it.',
  'The entry point is never invoked here.',
  'The entry point cannot be invoked from your build.',
  'The entry point is not invoked.',
  "The entry point isn't invoked by your build.",
  'Your build is not reaching the entry point.',
  "Your build can't invoke it.",
  // The subject is the negation: nothing, no step, neither ... nor.
  'Nothing invokes the entry point.',
  'No step of your build invokes the entry point.',
  'Neither your build nor its scripts invoke the entry point.',
  // A long way between the negator and the verb, or an adverb between the negator and the
  // participle.
  'Your build does not, at any point in the steps described above, invoke the entry point.',
  'Your build never once, at any stage of the pipeline that it owns, in any form, calls the entry point.',
  'The entry point is not directly invoked.',
  'The entry point is never actually called.',
  'The entry point is no longer invoked at this rung.',
  'The entry point, with no seed of its own, is never invoked.',
  // The verb left out after the negator.
  'Your build is meant to invoke the entry point, but it never does.',
  'Your build should call the entry point; it does not.',
  // A gerund negated by a preposition, or a contrast.
  'Instead of invoking the entry point, your build writes the file itself.',
  'Rather than invoking the entry point, your build writes the file itself.',
  'Your build produces tokens.css without invoking the entry point.',
  'Unlike rung 3, where your build invokes the entry point, this rung reads its inputs from a file Nave discovers.',
  // A typographic apostrophe, and verbs that deny reach without a negator.
  'Your build doesn’t invoke the entry point.',
  'Your build fails to reach the entry point.',
  'Your build stops short of the entry point.',
  'Your build avoids the entry point.',
  'Your build does not go through the entry point.',
  // Other spellings of the object.
  'Your build does not invoke the entrypoint.',
  'Your build does not invoke the entry-point.',
  'Your build does not invoke Nave’s entry point.',
  'Your build does not invoke the token build’s entry point.',
  'Your build never runs `navecss-tokens`.',
  // A negator between the verb and its object.
  'Your build invokes no entry point at all.',
  'Your build calls no entry point.',
  // A joining word inside a parenthetical between commas does not end the negation.
  'Your build has never, since 0.1.0, invoked the entry point.',
  'Your build does not, while it runs, invoke the entry point.',
  'Your build will not, then, invoke the entry point.',
  // An abbreviation's full stop does not end the sentence.
  'Your build does not, e.g. via a script, invoke the entry point.',
  // A possessive on the entry point, and four words between the verb and its object.
  "The entry point's CLI is never invoked by your build.",
  'Your build does not invoke, on every single pass, the entry point.',
  // Negatives carried by an adjective or a participle.
  'Your build is unable to invoke the entry point.',
  'It is impossible for your build to invoke the entry point.',
  'Your build is prevented from invoking the entry point.',
  // An aside between commas that negates the whole clause, not a noun.
  'Your build, never once, invokes the entry point.',
  'Your build, not ever, invokes the entry point.',
  'Your build, never, invokes the entry point.',
  'Your build, at no point, invokes the entry point.',
  // A hyphenated or closed-up possessive on the entry point.
  "The entry-point's CLI is never invoked by your build.",
  'The entrypoint’s CLI is never invoked by your build.',
  // A negator-led aside that names no alternative invoker negates the clause.
  'Your build, never at any stage of its run, invokes the entry point.',
  'Your build, never in any of its steps, invokes the entry point.',
]

test('AC-theming-36: a rung 4 that keeps only a denial of the entry point reds', () => {
  assert.deepEqual(
    RUNG_4_DENIALS.filter((denial) => rung4ReachProblems(denial).length === 0),
    [],
    'each of these must red on its own',
  )
})

test('AC-theming-36: a denial reds even beside the published rung-4 affirmative', () => {
  assert.deepEqual(
    RUNG_4_DENIALS.filter(
      (denial) => rung4ReachProblems(`${PUBLISHED_RUNG_4}\n\n${denial}`).length === 0,
    ),
    [],
    'each of these must red even beside the published affirmative',
  )
})

// The affirmative names the consumer's own build, script or task as what invokes the entry point. A
// sentence where Nave, or a part of Nave, invokes it says nothing about the consumer's build, so a
// rung 4 made only of one is reported as missing the affirmative.
test("AC-theming-36: an invoker that is not the consumer's build is not the affirmative", () => {
  const naveSide = [
    'Nave invokes the entry point for you.',
    'The Nave CLI invokes the entry point.',
    "Nave's build invokes the entry point.",
    'The token build runs the entry point.',
    'The entry point is invoked by Nave.',
    "The entry point is invoked by Nave's build.",
    'Your build hands its inputs to Nave, which invokes the entry point.',
    // A build introduced by "a" or "its" after Nave is named in the same clause is Nave's.
    'Nave ships a build that invokes the entry point.',
    'Nave ships its own build script, which invokes the entry point.',
    // A pronoun subject is read through to the invoker it stands for in the same sentence, and
    // with none there it names no one.
    'Nave is the invoker: it invokes the entry point.',
    'It invokes the entry point.',
    'Your build is ready; the CLI invokes the entry point.',
  ]
  assert.deepEqual(
    naveSide.filter(
      (sentence) =>
        !rung4ReachProblems(sentence).includes(
          'rung 4 never says its own build invokes the entry point',
        ),
    ),
    [],
  )
})

// A sentence that denies reach is never also read as the affirmative, so a rung 4 made only of a
// negated gerund or a contrast is reported as saying nothing affirmative, not just as a denial.
test('AC-theming-36: a negated gerund or a contrast is not read as the affirmative', () => {
  const contrasts = [
    'Instead of invoking the entry point, your build writes the file itself.',
    'Your build produces tokens.css without invoking the entry point.',
    'Unlike rung 3, where your build invokes the entry point, this rung reads its inputs from a file Nave discovers.',
  ]
  assert.deepEqual(
    contrasts.filter(
      (sentence) =>
        !rung4ReachProblems(sentence).includes(
          'rung 4 never says its own build invokes the entry point',
        ),
    ),
    [],
  )
})

// Lawful rung-4 text, each sentence the whole rung: it says the consumer's build reaches the entry
// point, so it must stay green.
const RUNG_4_LAWFUL = [
  // Forms of run and call, the passive, the past tense, and a possessive or hyphenated object.
  'Your build script runs the entry point with your inputs.',
  'Your build calls the entry point with your inputs.',
  'The entry point is invoked by your own build.',
  'Your build invoked the entry point, and it does so on every run.',
  'Your build invokes Nave’s entry point with your inputs.',
  'Your build invokes the token build’s entry point with your inputs.',
  'Your build runs `navecss-tokens` with your inputs.',
  'The script or the task that invokes the entry-point.',
  // A negation in one clause does not reach into the next.
  'Do not use a config file; it is read from what your build hands it, and the script or the task that invokes the entry point supplies it.',
  'You do not run a separate step: it happens inside the script or the task that invokes the entry point.',
  'You do not need a config file; your build invokes the entry point.',
  'There is no Nave configuration file, and you do not need one; your build invokes the entry point.',
  'Nothing else is needed: your build invokes the entry point, and nothing is discovered.',
  'No file is discovered; your own build invokes the entry point with what it has.',
  'No file is discovered, and your own build invokes the entry point with what it has.',
  'Your build skips ahead and invokes the entry point.',
  // "Instead of" negates the noun it governs here, not the build's invocation.
  'Instead of a seed you typed into a script once, your own build invokes the entry point with them.',
  'Without a config file, your build invokes the entry point with its own inputs.',
  'No file is discovered and your own build invokes the entry point, with what it has.',
  // A negator opening an aside, or inside a relative clause, negates only that aside.
  'Your build, not Nave, invokes the entry point.',
  'It is your build, not a Nave config file, that invokes the entry point.',
  'The entry point, which reads no file, is invoked by your build.',
  'Your build runs, not Nave, the entry point.',
  // A verb left out after a subject that is not a pronoun is not a denial of reach.
  'Your build invokes the entry point; Nave does not.',
  "Your build invokes the entry point; Nave doesn't.",
  // A possessive on the entry point, and three or four words between the verb and its object.
  'Your build invokes the entry point’s command-line interface with your inputs.',
  'Your build invokes, on every pass, the entry point.',
  'Your build invokes, on every single pass, the entry point.',
  // A hyphenated or closed-up possessive on the entry point.
  'Your build invokes the entry-point’s command-line interface.',
  "Your build invokes the entrypoint's CLI.",
  // Other consumer-side invokers, and an invoker found past an aside or a relative clause.
  "The consumer's build invokes the entry point.",
  'Your bundler runs the entry point with your inputs.',
  'Nave runs inside your build, which invokes the entry point.',
  // More consumer-side invokers: the consumer named as "you", other tools, an owned token build.
  'Your CI invokes the entry point with your inputs.',
  'Your toolchain runs the entry point with your inputs.',
  "Your build's codegen step invokes the entry point.",
  'You invoke the entry point from your own build.',
  'Your token build invokes the entry point.',
  'Your build loads your tokens and invokes the entry point with them.',
  // The passive agent read to the end of its by-phrase.
  'The entry point is invoked by a step in your build.',
  'The entry point is invoked by your CI.',
  // A pronoun subject read through to its antecedent in the same sentence.
  'Your build is the invoker: it invokes the entry point with your inputs.',
  // Consumer-side nouns with no "your" to decide them.
  'The CI invokes the entry point with your inputs.',
  "The build's generator invokes the entry point.",
  'A build script invokes the entry point and hands the result to Nave.',
  'The entry point is invoked by one of the many tasks in your build.',
  // Nave named in an earlier clause, or in an aside, does not make a later "a build" Nave's.
  'Nave ships the tokens, and a build script invokes the entry point.',
  'Nave writes the defaults, and a build invokes the entry point with your inputs.',
  'Nave ships the defaults, but a build script invokes the entry point.',
  'Your repo, not Nave, holds a build script that invokes the entry point.',
]

test('AC-theming-36: a lawful rung 4 that says its build reaches the entry point stays green', () => {
  assert.deepEqual(
    RUNG_4_LAWFUL.map((sentence) => [sentence, rung4ReachProblems(sentence)]).filter(
      ([, problems]) => problems.length > 0,
    ),
    [],
    'each of these must stay green on its own',
  )
})

test('AC-theming-36: "not" and "entry point" in one sentence is not a denial of reach', () => {
  const sentence = 'The entry point reads nothing it was not handed: no file is discovered.'
  assert.ok(
    rung4ReachProblems(sentence).every((problem) => !problem.includes('denies')),
    'the published sentence holds "not" and "entry point" and negates nothing about reach',
  )
})

test('AC-theming-36: the published rung 4 says its own build invokes the entry point', () => {
  assert.deepEqual(rung4ReachProblems(PUBLISHED_RUNG_4), [])
})

// Deliberately reads the WHOLE rung body, not the `**Across 0.x:**` bullet the posture
// assertions above read. A posture IS its bullet, so scoping those to it is fidelity; this
// clause is not about the posture. `AC-theming-36` ranges over how the RUNG IS DOCUMENTED, so
// a rung called unavailable in its lead prose violates the criterion exactly as much as one
// called unavailable in its bullet, and bullet-scoping here was MEASURED to lose that catch
// (RED at the wider range, GREEN at the narrower).
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
// from tidiness; it is the same "points its reader at the wrong thing" defect
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
