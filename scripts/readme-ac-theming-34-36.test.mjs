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

// RUNG 4's REACH is an AFFIRMATIVE claim: the consumer's own build invokes the entry point. The
// phrase "entry point" appearing in the rung does not make it, and a rung 4 that says the entry
// point is not reached, not invoked or gone around fails, even with the phrase present. Scanning
// for the phrase alone passed a rung 4 reduced to "This rung is not reached through the entry
// point at all.", which says the opposite.
//
// HOW IT READS. The rung is cut into sentences (a bullet start counts as a boundary, and the full
// stop of "e.g.", "i.e.", "etc." or "vs." does not end one), and each sentence into lower-cased
// words, with both apostrophes read the same and "entrypoint" / "entry-point" read as "entry
// point". The only patterns run over README text are the sentence and word splitters, which
// cannot backtrack; everything after them compares words in order.
//
// THE AFFIRMATIVE is a closed list of accepted shapes, kept as data below (`AFFIRMATIVE_SHAPES`):
// the published "the script or the task that invokes the entry point", the consumer's own build,
// script or task invoking it, and the passive "the entry point is invoked by" the same. A
// sentence affirms when its words contain one of those shapes word for word and it holds no
// negation or contrast word (not, never, no, nothing, any n't word, cannot, no longer, without,
// instead of, rather than, unlike). Rung 4 must hold one such sentence.
//
// A LAWFUL REWORDING OUTSIDE THE LIST FAILS THE INSTRUMENT, NOT THE CRITERION, and it fails loudly:
// the message quotes the rung, lists the accepted shapes and says to add the new wording to the
// list in the same change as the README edit. Every shape in the list must itself be an
// affirmative: a consumer-side build, script or task, owned by your, your own or the consumer's
// outside the published sentence, before a form of invoke, run or call, the entry point or
// `navecss-tokens` after it, no Nave word ("token" counts as one) and no negation. A row checks
// that, so the remedy cannot add "Nave invokes the entry point", "the token build invokes the entry
// point" or "its build invokes the entry point".
//
// THE DENIAL GUARD is a closed list too, read clause by clause (a clause ends at `;`, `:` or the
// end of the sentence) and, for the first two forms, comma segment by comma segment, so a negator
// never reaches past a comma ("Your build, not Nave, invokes the entry point" denies nothing).
// Inside a segment, a joining word (and, but, so, yet) followed by a subject of the consumer's
// (your, your own, the consumer's, you, we, they) ends a negator's reach the same way ("No file is
// discovered and your own build invokes the entry point" denies nothing). A part of a sentence
// denies reach when it holds:
// - a negator (not, never, cannot, any n't word, no, nothing, without, instead of, rather than,
//   unlike, fails to, unable to; "no longer" is caught by "no"), then a reach verb (reach, invoke,
//   call, run, use, go through), then the object (the entry point, `navecss-tokens`, or "it"), all
//   in one comma segment;
// - an avoidance verb (bypass, skip, avoid, circumvent, go around / past, stop short of) with the
//   object right after it ("skips the entry point", "goes around it");
// - or "the entry point is / was not / never / no longer (one word) invoked / reached / called /
//   run / used", with "isn't", "wasn't", "cannot be" and "can't be" read the same way.
// A denial is reported even beside the affirmative, once per sentence, so a long sentence is quoted
// once.
//
// RESIDUALS, stated rather than discovered later, and each pinned by rows below.
// - A denial outside that closed list is not caught by it and is left to whoever reads the change:
//   a negating word that is not listed ("neither ... nor", "impossible", "prevented from"), a
//   negator that reaches its verb only across a comma ("Your build does not, at any point, invoke
//   the entry point"), a verb left out ("but it never does"), a negator after the verb ("invokes no
//   entry point"), a negated passive whose subject is not "the entry point" itself, or not next to
//   it, or a negation shared by a second subject joined with "and" ("Never do Nave and your build
//   invoke the entry point"), which reads like a new clause starting at "and your". Each still
//   fails when it is the whole rung, because it holds no accepted shape or holds a negation.
// - A Nave invoker beside the affirmative passes: the rung then holds the affirmative and denies
//   nothing ("Nave invokes the entry point for you." fails alone).
// - A sentence holding a shape and contrasted with Nave as the real invoker, in another clause or
//   sentence and without a listed negation word, passes even alone ("In rung 3 your build invokes
//   the entry point; here Nave does."). Closing it would also fail lawful conditionals ("If your
//   build invokes the entry point from a script, pin the version.").
// - In the other direction, the negation scan does not know what a negation governs, so a lawful
//   sentence that also holds one ("Without a config file, your build invokes the entry point") is
//   not read as the affirmative and fails loudly with the shapes message.

const WORD = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu
const CLOSED_UP_ENTRY_POINTS = ['entrypoint', 'entry-point']
const ENTRY_POINT_HEADS = new Set(['point', 'points', "point's", "points'"])

// A slot's alternatives, each written as a phrase.
const anyOf = (...phrases) => phrases.map((phrase) => phrase.split(' '))

const CONSUMER_SUBJECTS = anyOf('your', 'your own', "the consumer's")
const CONSUMER_INVOKERS = anyOf(
  'build',
  'build script',
  'script',
  'task',
  'pipeline',
  'ci',
  'toolchain',
  'build system',
)
const INVOKING_VERBS = anyOf(
  'invoke',
  'invokes',
  'invoked',
  'run',
  'runs',
  'ran',
  'call',
  'calls',
  'called',
)
const OBJECTS = anyOf('the entry point', 'navecss-tokens')

// The published wording, pinned on its own.
const PUBLISHED_SHAPE = [anyOf('the script or the task that invokes the entry point')]

// The accepted shapes: each a list of slots, each slot a list of alternative word sequences.
const AFFIRMATIVE_SHAPES = [
  PUBLISHED_SHAPE,
  [CONSUMER_SUBJECTS, CONSUMER_INVOKERS, INVOKING_VERBS, OBJECTS],
  [
    anyOf('the entry point'),
    anyOf('is', 'was'),
    anyOf('invoked', 'run', 'called'),
    anyOf('by'),
    CONSUMER_SUBJECTS,
    CONSUMER_INVOKERS,
  ],
]

const NEGATION_WORDS = new Set(['not', 'never', 'no', 'nothing', 'cannot', 'without', 'unlike'])
// "no longer" is caught by "no".
const NEGATION_PAIRS = new Set(['instead of', 'rather than'])

const DENIAL_NEGATORS = new Set(['not', 'never', 'cannot', 'no', 'nothing', 'without', 'unlike'])
const DENIAL_NEGATOR_PAIRS = new Set([
  'instead of',
  'rather than',
  'fails to',
  'fail to',
  'failed to',
  'unable to',
])
// A joining word, and the subjects after it that start a clause of the consumer's.
const JOINING_WORDS = new Set(['and', 'but', 'so', 'yet'])
const NEW_SUBJECTS = new Set(['your', 'you', 'we', 'they'])
const REACH_VERBS = new Set(
  ['reach', 'invoke', 'call', 'run', 'use'].flatMap((verb) => verbForms(verb)),
)
const GO = new Set(['go', 'goes', 'going', 'went', 'gone'])
const STOP = new Set(['stop', 'stops', 'stopped', 'stopping'])
const AVOIDING_STEMS = ['bypass', 'skip', 'avoid', 'circumvent']
const PARTICIPLES = anyOf('invoked', 'reached', 'called', 'run', 'used')
const ANY_WORD = [['*']]

// "the entry point is not (one word) invoked", and its spellings.
const PASSIVE_DENIALS = [
  [
    anyOf('the entry point'),
    anyOf(
      'is not',
      'was not',
      'is never',
      'was never',
      'is no longer',
      'was no longer',
      "isn't",
      "wasn't",
      'cannot be',
      "can't be",
    ),
  ],
].flatMap((head) => [
  [...head, PARTICIPLES],
  [...head, ANY_WORD, PARTICIPLES],
])

function verbForms(verb) {
  if (verb === 'run') return ['run', 'runs', 'ran', 'running']
  const stem = verb.endsWith('e') ? verb.slice(0, -1) : verb
  return [verb, `${verb}s`, `${stem}ed`, `${stem}ing`]
}

// Sentences, with a bullet start counting as a boundary. The text is whitespace-collapsed first,
// so each split point is one literal space; the full stop of a listed abbreviation is not one.
function sentencesOf(text) {
  return text
    .replaceAll(/\s+/g, ' ')
    .split(/(?<=[.!?])(?<!\b(?:e\.g|i\.e|etc|vs)\.) | - (?=\*\*)/i)
    .filter((sentence) => sentence.trim() !== '')
}

// A text's words, lower-cased, with both apostrophes read the same and the closed-up spellings
// of "entry point" split into two words.
function wordsOf(text) {
  const words = []
  for (const [word] of text.replaceAll('’', "'").toLowerCase().matchAll(WORD)) {
    const stem = CLOSED_UP_ENTRY_POINTS.find((spelling) => word.startsWith(spelling))
    const head = stem === undefined ? '' : `point${word.slice(stem.length)}`
    if (ENTRY_POINT_HEADS.has(head)) words.push('entry', head)
    else words.push(word)
  }
  return words
}

// Every word sequence a shape stands for.
function phrasesOf(shape) {
  return shape.reduce(
    (phrases, slot) => phrases.flatMap((phrase) => slot.map((option) => [...phrase, ...option])),
    [[]],
  )
}

// Whether `phrase` occurs in `words` starting at `at`; "*" stands for any one word.
const phraseAt = (words, at, phrase) =>
  phrase.every((word, k) => (word === '*' ? at + k < words.length : words[at + k] === word))

// The phrases of a list of shapes, grouped by first word, so a sentence is scanned once.
function phraseIndex(shapes) {
  const index = new Map()
  for (const phrase of shapes.flatMap((shape) => phrasesOf(shape))) {
    if (!index.has(phrase[0])) index.set(phrase[0], [])
    index.get(phrase[0]).push(phrase)
  }
  return index
}

const AFFIRMATIVE_INDEX = phraseIndex(AFFIRMATIVE_SHAPES)
const PUBLISHED_INDEX = phraseIndex([PUBLISHED_SHAPE])
const PASSIVE_DENIAL_INDEX = phraseIndex(PASSIVE_DENIALS)

// The first phrase of `index` that `words` contain, or null.
function findPhrase(words, index) {
  for (const at of words.keys()) {
    const phrase = index.get(words[at])?.find((candidate) => phraseAt(words, at, candidate))
    if (phrase !== undefined) return words.slice(at, at + phrase.length)
  }
  return null
}

// The negation or contrast word a sentence holds, or null.
function negationIn(words) {
  for (const [at, word] of words.entries()) {
    if (NEGATION_WORDS.has(word) || word.endsWith("n't")) return word
    const pair = `${word} ${words[at + 1]}`
    if (NEGATION_PAIRS.has(pair)) return pair
  }
  return null
}

// How many words the negator, reach verb, avoidance verb or object at `at` spans, or 0.
function negatorAt(words, at) {
  if (DENIAL_NEGATORS.has(words[at]) || words[at].endsWith("n't")) return 1
  return DENIAL_NEGATOR_PAIRS.has(`${words[at]} ${words[at + 1]}`) ? 2 : 0
}

function reachVerbAt(words, at) {
  if (REACH_VERBS.has(words[at])) return 1
  return GO.has(words[at]) && words[at + 1] === 'through' ? 2 : 0
}

function avoidanceAt(words, at) {
  if (AVOIDING_STEMS.some((stem) => words[at].startsWith(stem))) return 1
  const next = words[at + 1]
  if ((next === 'around' || next === 'past') && GO.has(words[at])) return 2
  return next === 'short' && words[at + 2] === 'of' && STOP.has(words[at]) ? 3 : 0
}

function objectAt(words, at) {
  if (words[at] === 'entry' && ENTRY_POINT_HEADS.has(words[at + 1])) return 2
  return words[at] === 'it' || words[at] === 'navecss-tokens' ? 1 : 0
}

// The denial form a comma segment holds, as the words matched, or null: a negator then a reach
// verb then the object, in that order, or an avoidance verb with the object right after it. Read
// per comma segment, so a negator does not reach past a comma ("Your build, not Nave, invokes the
// entry point" denies nothing).
function denialInSegment(words) {
  let matched = []
  let wanted = 'opener'
  for (let at = 0; at < words.length;) {
    if (startsNewSubject(words, at)) {
      matched = []
      wanted = 'opener'
    }
    const avoided = avoidanceAt(words, at)
    if (avoided > 0) {
      const object = objectRightAfter(words, at + avoided)
      if (object !== null) return `${words.slice(at, at + avoided).join(' ')} … ${object}`
    }
    const step = wantedAt(words, at, wanted)
    if (step === 0) {
      at += 1
      continue
    }
    matched.push(words.slice(at, at + step).join(' '))
    if (wanted === 'object') return matched.join(' … ')
    wanted = nextWanted(wanted)
    at += step
  }
  return null
}

// Whether a joining word at `at` opens a clause with a subject of the consumer's ("and your own
// build", "but you"), which ends a negator's reach as a comma does.
function startsNewSubject(words, at) {
  if (!JOINING_WORDS.has(words[at])) return false
  const next = words[at + 1]
  return NEW_SUBJECTS.has(next) || (next === 'the' && words[at + 2] === "consumer's")
}

// The object that starts at `at`, after an optional "the", or null.
function objectRightAfter(words, at) {
  const from = words[at] === 'the' ? at + 1 : at
  const span = objectAt(words, from)
  return span === 0 ? null : words.slice(from, from + span).join(' ')
}

function wantedAt(words, at, wanted) {
  if (wanted === 'opener') return negatorAt(words, at)
  if (wanted === 'verb') return reachVerbAt(words, at)
  return objectAt(words, at)
}

const nextWanted = (wanted) => (wanted === 'opener' ? 'verb' : 'object')

const NO_SHAPE_START = "rung 4 never says, in an accepted shape, that the consumer's own build"

const render = (shape) =>
  shape
    .map((slot) =>
      slot.length === 1 ? slot[0].join(' ') : `{${slot.map((o) => o.join(' ')).join(' | ')}}`,
    )
    .join(' ')

function noShapeMessage(text) {
  const shapes = AFFIRMATIVE_SHAPES.map((shape) => `  ${render(shape)}`).join('\n')
  return (
    `${NO_SHAPE_START} invokes the entry point (AC-theming-36, rung 4's reach clause). It reads: ` +
    `${JSON.stringify(text.replaceAll(/\s+/g, ' ').trim())}. Accepted shapes:\n${shapes}\n` +
    'If rung 4 says this in other words, add that wording to the shapes list in this file in the ' +
    'same change as the README edit. A shape that names Nave as the invoker, or carries a ' +
    'negation, is rejected by the row that checks the list.'
  )
}

const negatedShapeMessage = (sentence, word) =>
  `rung 4's sentence ${JSON.stringify(sentence)} matches an accepted shape but also holds ` +
  `"${word}"; a sentence with a negation or contrast never counts as the affirmative. State the ` +
  'affirmative in a sentence of its own.'

// The denial form of a sentence's first denying clause, or null. One per sentence, so a long
// sentence is quoted once.
function denialIn(sentence) {
  for (const clause of sentence.split(/[;:]/)) {
    const passive = findPhrase(wordsOf(clause), PASSIVE_DENIAL_INDEX)
    if (passive !== null) return passive.join(' ')
    for (const segment of clause.split(',')) {
      const form = denialInSegment(wordsOf(segment))
      if (form !== null) return form
    }
  }
  return null
}

const denialMessage = (sentence, form) =>
  `rung 4 denies the entry point's reach: ${JSON.stringify(sentence)} (matched: ${form}).`

function rung4ReachProblems(text) {
  const problems = []
  const negatedShapes = []
  let affirms = false
  for (const sentence of sentencesOf(text)) {
    const form = denialIn(sentence)
    if (form !== null) problems.push(denialMessage(sentence, form))
    const words = wordsOf(sentence)
    if (findPhrase(words, AFFIRMATIVE_INDEX) === null) continue
    const negation = negationIn(words)
    if (negation === null) affirms = true
    else negatedShapes.push(negatedShapeMessage(sentence, negation))
  }
  if (!affirms) problems.push(noShapeMessage(text), ...negatedShapes)
  return problems
}

// THE REACH CLAUSE FOR THE LIST ITSELF. Every phrase a shape stands for must be an affirmative of
// the consumer's build: a consumer-side build, script or task before a form of invoke, run or
// call and the entry point (or `navecss-tokens`) after it, or the passive "the entry point is
// invoked by" one; no Nave word ("token" and "tokens" count as Nave's unless an owner precedes
// them); no negation; and, outside the published sentence, an owner (your, your own or the
// consumer's) on the invoker, so "the build" or "its build" cannot be added. Returned as one line
// per phrase that is not.
const INVOKING_WORDS = new Set(INVOKING_VERBS.flat())
const SHAPE_OWNERS = new Set(['your', "consumer's"])
const PUBLISHED_PHRASE = phrasesOf(PUBLISHED_SHAPE)[0].join(' ')
const isNaveWord = (word) =>
  (word.startsWith('nave') && word !== 'navecss-tokens') || word === 'token' || word === 'tokens'
const CONSUMER_WORDS = new Set([
  'your',
  "consumer's",
  'build',
  'script',
  'task',
  'pipeline',
  'ci',
  'toolchain',
])

function shapeProblems(shapes) {
  return shapes
    .flatMap((shape) => phrasesOf(shape))
    .map((phrase) => [phrase.join(' '), affirmativeFlaw(phrase)])
    .filter(([, flaw]) => flaw !== null)
    .map(([phrase, flaw]) => `${phrase}: ${flaw}`)
}

// "token" and "tokens" are Nave's unless an owner comes right before them ("your token build",
// "your own token build"): an owner makes them the consumer's.
const ownedAt = (words, at) =>
  SHAPE_OWNERS.has(words[at - 1]) || (words[at - 1] === 'own' && SHAPE_OWNERS.has(words[at - 2]))
const namesNave = (words) =>
  words.some(
    (word, at) =>
      isNaveWord(word) && !((word === 'token' || word === 'tokens') && ownedAt(words, at)),
  )

function affirmativeFlaw(words) {
  if (namesNave(words)) return 'names Nave'
  if (negationIn(words) !== null) return 'holds a negation'
  if (words.join(' ') !== PUBLISHED_PHRASE && words.every((word) => !SHAPE_OWNERS.has(word))) {
    return "has no owner (your, your own or the consumer's)"
  }
  const verb = words.findIndex((word) => INVOKING_WORDS.has(word))
  if (verb === -1) return 'has no form of invoke, run or call'
  const [before, after] = [words.slice(0, verb), words.slice(verb + 1)]
  const consumer = (part) => part.some((word) => CONSUMER_WORDS.has(word))
  const object = (part) => part.some((word, at) => objectAt(part, at) > 0 && word !== 'it')
  const active = consumer(before) && object(after)
  const passive = object(before) && after[0] === 'by' && consumer(after)
  return active || passive
    ? null
    : 'has no consumer-side invoker with the entry point as its object'
}

// An entry a careless remedy could add: the row that checks the list must red on it.
const NAVE_SHAPE = [anyOf('nave'), anyOf('invokes'), anyOf('the entry point')]

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

// The published wording is pinned on its own: rung 4 holds it, in a sentence with no negation.
test('AC-theming-36: rung 4 states the published shape, "the script or the task that invokes the entry point"', () => {
  const matches = sentencesOf(PUBLISHED_RUNG_4).filter((sentence) => {
    const words = wordsOf(sentence)
    return findPhrase(words, PUBLISHED_INDEX) !== null && negationIn(words) === null
  })
  assert.equal(matches.length, 1)
})

// The list guards itself: every accepted shape is an affirmative of the consumer's build, and the
// check reds on a Nave invoker added to a copy of the list.
test('AC-theming-36: every accepted shape is itself an affirmative, and a Nave invoker added to the list reds', () => {
  assert.deepEqual(shapeProblems(AFFIRMATIVE_SHAPES), [])
  assert.deepEqual(shapeProblems([...AFFIRMATIVE_SHAPES, NAVE_SHAPE]), [
    'nave invokes the entry point: names Nave',
  ])
  // Each other way an entry can fail the reach clause, on its own copy of the list.
  const flawed = [
    [anyOf('your build does not invoke the entry point'), 'holds a negation'],
    [anyOf('your build the entry point'), 'has no form of invoke, run or call'],
    [anyOf('a library invokes the entry point'), "has no owner (your, your own or the consumer's)"],
    [anyOf('the token build invokes the entry point'), 'names Nave'],
    [anyOf('the build invokes the entry point'), "has no owner (your, your own or the consumer's)"],
    [anyOf('its build invokes the entry point'), "has no owner (your, your own or the consumer's)"],
    [anyOf('the entry point is invoked by the token build'), 'names Nave'],
    [
      anyOf('the library invokes your entry point'),
      'has no consumer-side invoker with the entry point as its object',
    ],
    [
      anyOf('your build invokes a script'),
      'has no consumer-side invoker with the entry point as its object',
    ],
    [
      anyOf('the entry point is invoked by a library'),
      "has no owner (your, your own or the consumer's)",
    ],
  ]
  for (const [shape, flaw] of flawed) {
    assert.deepEqual(shapeProblems([...AFFIRMATIVE_SHAPES, [shape]]), [
      `${shape[0].join(' ')}: ${flaw}`,
    ])
  }
  // An owner makes a token build the consumer's, so the remedy can accept it.
  for (const entry of [
    'your token build invokes the entry point',
    'your own token build runs the entry point',
    "the entry point is invoked by the consumer's token build",
  ]) {
    assert.deepEqual(shapeProblems([...AFFIRMATIVE_SHAPES, [anyOf(entry)]]), [], entry)
  }
})

// Denials inside the closed denial list: each reds alone and beside the published rung.
const DENIES = "rung 4 denies the entry point's reach"

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
  'Nothing invokes the entry point.',
  'No step of your build invokes the entry point.',
  'The entry point is not directly invoked.',
  'The entry point is never actually called.',
  'The entry point is no longer invoked at this rung.',
  'Instead of invoking the entry point, your build writes the file itself.',
  'Rather than invoking the entry point, your build writes the file itself.',
  'Your build produces tokens.css without invoking the entry point.',
  'Your build doesn’t invoke the entry point.',
  'Your build fails to reach the entry point.',
  'Your build stops short of the entry point.',
  'Your build avoids the entry point.',
  'Your build does not go through the entry point.',
  'Your build does not invoke the entrypoint.',
  'Your build does not invoke the entry-point.',
  'Your build does not invoke Nave’s entry point.',
  'Your build does not invoke the token build’s entry point.',
  'Your build never runs `navecss-tokens`.',
  'Your build is unable to invoke the entry point.',
  // One row per entry of the closed denial list that no row above uses.
  'Your build cannot invoke the entry point.',
  'Your build failed to invoke the entry point.',
  'Your build and your task fail to invoke the entry point.',
  'Your build skips the entry point.',
  'Your build circumvents the entry point.',
  'The entry point is not reached.',
  'The entry point is never run.',
  'The entry point is not used.',
  'Your build does not use the entry point.',
  'Your build went around the entry point.',
  'Your build is not going through the entry point.',
  'Your build has not gone through the entry point.',
  'Your build stopped short of the entry point.',
  'Your build and your task stop short of the entry point.',
  'Your build is stopping short of the entry point.',
  'The entry point was not invoked.',
  'The entry point was never invoked.',
  'The entry point was no longer invoked.',
  "The entry point wasn't invoked.",
  "The entry point can't be invoked.",
  // Rows that keep each list entry and the sentence splitter in use within one comma segment.
  'Unlike the CLI that calls the entry point, this rung reads a file.',
  'Your build never calls the entry point.',
  'Your build does not e.g. invoke the entry point directly.',
  // A joining word with no new subject after it leaves the negator's reach as it was.
  'Your build reads the seed and does not invoke the entry point.',
  'No file is read and nothing invokes the entry point.',
  'Your build does not read the seed and invoke the entry point.',
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
    RUNG_4_DENIALS.filter((denial) =>
      rung4ReachProblems(`${PUBLISHED_RUNG_4}\n\n${denial}`).every(
        (problem) => !problem.startsWith(DENIES),
      ),
    ),
    [],
    'each of these must red even beside the published affirmative',
  )
})

// The stated residual: denials outside the closed list. Alone each still reds, because it holds
// no accepted shape; beside the published rung the denial guard does not see it, and a person
// reading the change must.
const RUNG_4_DENIAL_RESIDUALS = [
  'Neither your build nor its scripts invoke the entry point.',
  'The entry point, with no seed of its own, is never invoked.',
  'Your build is meant to invoke the entry point, but it never does.',
  'Your build should call the entry point; it does not.',
  'Your build invokes no entry point at all.',
  'Your build calls no entry point.',
  "The entry point's CLI is never invoked by your build.",
  'It is impossible for your build to invoke the entry point.',
  'Your build is prevented from invoking the entry point.',
  "The entry-point's CLI is never invoked by your build.",
  'The entrypoint’s CLI is never invoked by your build.',
  // A negator that reaches its verb only across a comma.
  'Your build does not, at any point in the steps described above, invoke the entry point.',
  'Your build never once, at any stage of the pipeline that it owns, in any form, calls the entry point.',
  'Unlike rung 3, where your build invokes the entry point, this rung reads its inputs from a file Nave discovers.',
  'Your build has never, since 0.1.0, invoked the entry point.',
  'Your build does not, while it runs, invoke the entry point.',
  'Your build will not, then, invoke the entry point.',
  'Your build does not, e.g. via a script, invoke the entry point.',
  'Your build does not invoke, on every single pass, the entry point.',
  'Your build, never once, invokes the entry point.',
  'Your build, not ever, invokes the entry point.',
  'Your build, never, invokes the entry point.',
  'Your build, at no point, invokes the entry point.',
  'Your build, never at any stage of its run, invokes the entry point.',
  'Your build, never in any of its steps, invokes the entry point.',
  // A negation shared by a second subject joined with "and", read as a new clause.
  'Nothing in Nave and your build invokes the entry point.',
  'No step of Nave and your build invokes the entry point.',
  'Never do Nave and your build invoke the entry point.',
]

test('AC-theming-36: a denial outside the closed list reds alone, and beside the published rung is left to the reader', () => {
  for (const denial of RUNG_4_DENIAL_RESIDUALS) {
    assert.ok(
      rung4ReachProblems(denial).some((problem) => problem.startsWith(NO_SHAPE_START)),
      `must red alone: ${denial}`,
    )
    assert.ok(
      rung4ReachProblems(`${PUBLISHED_RUNG_4}\n\n${denial}`).every(
        (problem) => !problem.startsWith(DENIES),
      ),
      `a residual, not caught by the closed denial list: ${denial}`,
    )
  }
})

// Rung 4s whose invoker is Nave, a part of it, or no one: none holds an accepted shape.
const RUNG_4_NOT_THE_CONSUMER = [
  'Nave invokes the entry point for you.',
  'The Nave CLI invokes the entry point.',
  "Nave's build invokes the entry point.",
  'The token build runs the entry point.',
  'The entry point is invoked by Nave.',
  "The entry point is invoked by Nave's build.",
  'Your build hands its inputs to Nave, which invokes the entry point.',
  'Nave ships a build that invokes the entry point.',
  'Nave ships its own build script, which invokes the entry point.',
  'Nave is the invoker: it invokes the entry point.',
  'It invokes the entry point.',
  'Your build is ready; the CLI invokes the entry point.',
  'Nave then ships a build script that invokes the entry point.',
  'Nave since 0.1.0 ships a build script that invokes the entry point.',
  'Nave writes and ships a build script that invokes the entry point.',
  'Nave ships the defaults and a build script that invokes the entry point.',
  'Nave then has a build script invoke the entry point.',
  'Nave, as of 0.1.0, ships a build that invokes the entry point.',
  'Nave ships, as of 0.1.0, a build that invokes the entry point.',
  'Nave, which owns the defaults, also ships a build that invokes the entry point.',
  'Since 0.1.0, Nave ships a build script that invokes the entry point.',
  "Since Nave's own release, its build script invokes the entry point.",
  'Since Nave 0.1.0, its build script invokes the entry point.',
  "Since Nave's 0.1.0 release, its build script invokes the entry point.",
  "Since Nave's 0.1.0, its build script invokes the entry point.",
  'Nave writes the defaults and you get its build script that invokes the entry point.',
  'Since Nave ships the defaults, its build script invokes the entry point.',
  "Since Nave's build ships, its script invokes the entry point.",
  'Nave ships the defaults, and now you get its build script that invokes the entry point.',
  "Since Nave's first release, its build script invokes the entry point.",
  "As of Nave's latest release, its build script invokes the entry point.",
  "Since Nave's 2.0 release notes, its build script invokes the entry point.",
  'Since Nave CSS 0.1.0, its build script invokes the entry point.',
  'Since Nave v0.1.0, its build script invokes the entry point.',
  'Since Nave CSS 0.1.0, a build script invokes the entry point.',
  'Since Nave v0.1.0, a build script invokes the entry point.',
  'Nave ships the defaults; its build script invokes the entry point.',
  'The Nave CLI, while your build waits, invokes the entry point.',
  'Nave, since your build asks for it, invokes the entry point.',
  "Since Nave's build ships the defaults, its script invokes the entry point.",
  "Since Nave's defaults change, its build script invokes the entry point.",
  "Since Nave's best release, its build script invokes the entry point.",
  'The token build ships, and its script invokes the entry point.',
  'Nave lives in the project with its build script that invokes the entry point.',
  'Nave ships a build script, and its task invokes the entry point.',
  "Since Nave's release, a build script invokes the entry point.",
  "Since Nave's own release, a build script invokes the entry point.",
  "Since Nave's first release, a build script invokes the entry point.",
  "Since Nave's latest release, a build script invokes the entry point.",
  "Since Nave's 0.1.0 release, a build script invokes the entry point.",
  "Since Nave's 2.0 release notes, a build script invokes the entry point.",
  'Instead of invoking the entry point, your build writes the file itself.',
  'Your build produces tokens.css without invoking the entry point.',
]

test("AC-theming-36: an invoker that is not the consumer's build is not the affirmative", () => {
  assert.deepEqual(
    RUNG_4_NOT_THE_CONSUMER.filter((sentence) =>
      rung4ReachProblems(sentence).every((problem) => !problem.startsWith(NO_SHAPE_START)),
    ),
    [],
  )
})

// A sentence that holds an accepted shape and a negation or contrast word never affirms, and says
// which word it found.
const RUNG_4_NEGATED_SHAPES = [
  'Unlike rung 3, where your build invokes the entry point, this rung reads a file.',
  'Nothing like the script or the task that invokes the entry point exists.',
  'Instead of the script or the task that invokes the entry point, Nave reads a file.',
  // One row per negation or contrast word the check knows.
  'Your build invokes the entry point, not a script of its own.',
  'Your build invokes the entry point and never a copy.',
  'Your build invokes the entry point with no flags.',
  "Your build invokes the entry point, which isn't optional.",
  'Your build invokes the entry point, which cannot be skipped.',
  'Your build invokes the entry point without flags.',
  'Your build invokes the entry point rather than a copy.',
  'Your build invokes the entry point, no longer a copy.',
]

test('AC-theming-36: a sentence holding a shape and a negation or contrast is not the affirmative', () => {
  assert.deepEqual(
    RUNG_4_NEGATED_SHAPES.filter((sentence) => {
      const problems = rung4ReachProblems(sentence)
      return !(
        problems.some((problem) => problem.startsWith(NO_SHAPE_START)) &&
        problems.some((problem) => problem.includes('matches an accepted shape but also holds'))
      )
    }),
    [],
  )
})

// The check reads a rung in time linear in its length. Each input is far longer than any rung.
test('AC-theming-36: the rung-4 reach check returns quickly on long input', () => {
  const inputs = [
    `Your build${' and its script'.repeat(5000)} invokes the entry point.`,
    `Your build${', and its task'.repeat(1000)}, invokes the entry point.`,
    `${'Nave ships; '.repeat(5000)}your build invokes the entry point.`,
    `${'Your build does not use it; '.repeat(5000)}the script or the task that invokes the entry point.`,
    'Your build does not use it. '.repeat(5000),
  ]
  for (const input of inputs) {
    const started = performance.now()
    assert.ok(Array.isArray(rung4ReachProblems(input)))
    const elapsed = performance.now() - started
    assert.ok(elapsed < 2000, `took ${Math.round(elapsed)} ms on a ${input.length}-character rung`)
  }
})

// Lawful rung-4 text inside the accepted shapes: each sentence, the whole rung, stays green.
const RUNG_4_LAWFUL = [
  'Your build script runs the entry point with your inputs.',
  'Your build calls the entry point with your inputs.',
  'The entry point is invoked by your own build.',
  'Your build invoked the entry point, and it does so on every run.',
  'Your build runs `navecss-tokens` with your inputs.',
  'The script or the task that invokes the entry-point.',
  "The consumer's build invokes the entry point.",
  'Your CI invokes the entry point with your inputs.',
  'Your toolchain runs the entry point with your inputs.',
  'The entry point is invoked by your CI.',
  // One sentence per entry of the accepted shapes, so every entry is in use.
  'Your own build invokes the entry point.',
  'Your script invokes the entry point.',
  'Your task invokes the entry point.',
  'Your pipeline invokes the entry point.',
  'Your build system invokes the entry point.',
  'Your build and your task invoke the entry point.',
  'Your build and your task run the entry point.',
  'Your build and your task call the entry point.',
  'Your build ran the entry point.',
  'Your build called the entry point.',
  'The entry point was invoked by your build.',
  'The entry point is run by your build.',
  'The entry point is called by your build.',
  // A bullet start ends a sentence even when the bullet before it has no full stop.
  '- **What it voids:** nothing about the output\n- **Where it lives:** your build invokes the entry point.',
]

test('AC-theming-36: a lawful rung 4 in an accepted shape stays green', () => {
  assert.deepEqual(
    RUNG_4_LAWFUL.map((sentence) => [sentence, rung4ReachProblems(sentence)]).filter(
      ([, problems]) => problems.length > 0,
    ),
    [],
    'each of these must stay green on its own',
  )
})

// Lawful rung-4 text outside the accepted shapes, kept rather than deleted: each fails LOUDLY with
// the shapes message, quoting what it read. This pins the failure mode: the remedy for any of
// them is to add its shape to the list in the same change as the README edit.
const RUNG_4_FAILS_LOUDLY = [
  'Your build invokes Nave’s entry point with your inputs.',
  'Your build invokes the token build’s entry point with your inputs.',
  'Do not use a config file; it is read from what your build hands it, and the script or the task that invokes the entry point supplies it.',
  'You do not run a separate step: it happens inside the script or the task that invokes the entry point.',
  'You do not need a config file; your build invokes the entry point.',
  'There is no Nave configuration file, and you do not need one; your build invokes the entry point.',
  'Nothing else is needed: your build invokes the entry point, and nothing is discovered.',
  'No file is discovered; your own build invokes the entry point with what it has.',
  'No file is discovered, and your own build invokes the entry point with what it has.',
  'Your build skips ahead and invokes the entry point.',
  'Instead of a seed you typed into a script once, your own build invokes the entry point with them.',
  'Without a config file, your build invokes the entry point with its own inputs.',
  'Your build, not Nave, invokes the entry point.',
  'It is your build, not a Nave config file, that invokes the entry point.',
  'The entry point, which reads no file, is invoked by your build.',
  'Your build runs, not Nave, the entry point.',
  'Your build invokes the entry point; Nave does not.',
  "Your build invokes the entry point; Nave doesn't.",
  'Your build invokes the entry point’s command-line interface with your inputs.',
  'Your build invokes, on every pass, the entry point.',
  'Your build invokes, on every single pass, the entry point.',
  'Your build invokes the entry-point’s command-line interface.',
  "Your build invokes the entrypoint's CLI.",
  'Your bundler runs the entry point with your inputs.',
  'Nave runs inside your build, which invokes the entry point.',
  "Your build's codegen step invokes the entry point.",
  'You invoke the entry point from your own build.',
  'Your token build invokes the entry point.',
  'Your build loads your tokens and invokes the entry point with them.',
  'The entry point is invoked by a step in your build.',
  'Your build is the invoker: it invokes the entry point with your inputs.',
  'The CI invokes the entry point with your inputs.',
  "The build's generator invokes the entry point.",
  'A build script invokes the entry point and hands the result to Nave.',
  'The entry point is invoked by one of the many tasks in your build.',
  'Nave ships the tokens, and a build script invokes the entry point.',
  'Nave writes the defaults, and a build invokes the entry point with your inputs.',
  'Nave ships the defaults, but a build script invokes the entry point.',
  'Your repo, not Nave, holds a build script that invokes the entry point.',
  'Nave ships the tokens and a build script invokes the entry point.',
  'Nave ships the defaults, then a build script invokes the entry point.',
  'Nave ships the defaults, and you keep a build script that invokes the entry point.',
  'Nave ships the defaults, but your repo holds a build script that invokes the entry point.',
  'Nave ships the defaults and you keep a build script that invokes the entry point.',
  'Nave ships the defaults, so you write a build script that invokes the entry point.',
  'Since Nave ships the defaults, a build script invokes the entry point.',
  'Because Nave ships the defaults, a build script invokes the entry point.',
  'Nave ships the defaults, and then you write a build script that invokes the entry point.',
  'Nave ships the defaults, but now you keep a build script that invokes the entry point.',
  "Since Nave's defaults change, a build script invokes the entry point.",
  "Because Nave's own build ships the defaults, a build script invokes the entry point.",
  'Nave ships the defaults, and your build runs its own script, which invokes the entry point.',
  "Your build reads Nave's defaults, and its script invokes the entry point.",
  'Your repo holds a build script, and its task invokes the entry point.',
  'Nave writes your config, and its build script invokes the entry point.',
  'Nave ships the defaults to the pipeline, and its task invokes the entry point.',
  "Your build reads Nave's scripts, and its task invokes the entry point.",
  'Add Nave to the project, and its build script invokes the entry point.',
  'Nave lives in the project, and its build script invokes the entry point.',
  'Your build pulls in Nave, and its script invokes the entry point.',
  'Your project depends on Nave, and its build script invokes the entry point.',
  'Nave ships the defaults to your repo, and its build script invokes the entry point.',
  "Since Nave's release ships, a build script invokes the entry point.",
  "Because Nave's CLI changes, a build script invokes the entry point.",
  "When Nave's default changes, a build script invokes the entry point.",
  "Since Nave's manifest changed, a build script invokes the entry point.",
  'Your build, while Nave waits, invokes the entry point.',
  'Nave ships the defaults, and your build, not Nave, invokes the entry point.',
  'Nave ships the defaults, then your build runs its own script, which invokes the entry point.',
  "A pipeline reads Nave's tokens, and its job invokes the entry point.",
  'The token builds ship, and its task invokes the entry point.',
  'Your build, because Nave ships no runner, invokes the entry point.',
  'Your build, since Nave reads nothing, invokes the entry point.',
  // A joining word with a new subject of the consumer's ends a negator's reach, as a comma does.
  'No file is discovered and your own build invokes the entry point, with what it has.',
  'No file is read but your build invokes the entry point.',
  'Nothing is discovered, so your own build runs the entry point.',
  'No file is read so your build invokes the entry point.',
  'No file is read yet your build invokes the entry point.',
  "No file is read and the consumer's build invokes the entry point.",
  'No file is read and you invoke the entry point.',
  'No file is read and we invoke the entry point.',
  'No file is read and they invoke the entry point.',
]

test('AC-theming-36: a lawful rewording outside the accepted shapes fails loudly, quoting itself', () => {
  assert.deepEqual(
    RUNG_4_FAILS_LOUDLY.filter((sentence) => {
      const problems = rung4ReachProblems(sentence)
      const loud = problems.some(
        (problem) =>
          problem.startsWith(NO_SHAPE_START) && problem.includes(JSON.stringify(sentence)),
      )
      const denied = problems.some((problem) => problem.startsWith(DENIES))
      const besidePublished = rung4ReachProblems(`${PUBLISHED_RUNG_4}\n\n${sentence}`)
      return !loud || denied || besidePublished.length > 0
    }),
    [],
    'each fails alone with the shapes message and no denial message, and passes beside the published rung',
  )
})

// Residual: a Nave invoker beside the published affirmative. The rung then holds the affirmative
// and does not deny reach, so the check passes it; alone it fails, holding no accepted shape.
const RUNG_4_NAVE_BESIDE_RESIDUALS = [
  'Nave invokes the entry point for you.',
  'The Nave CLI runs the entry point for you.',
]

test('AC-theming-36: residual, a Nave invoker fails alone and passes beside the published rung', () => {
  for (const sentence of RUNG_4_NAVE_BESIDE_RESIDUALS) {
    assert.ok(rung4ReachProblems(sentence).some((problem) => problem.startsWith(NO_SHAPE_START)))
    assert.deepEqual(rung4ReachProblems(`${PUBLISHED_RUNG_4}\n\n${sentence}`), [])
  }
})

// Residual: a sentence holding a shape, contrasted with Nave as the real invoker in another clause
// or sentence and without a listed negation word, reads as the affirmative even alone. Closing it
// would also fail lawful conditionals ("If your build invokes the entry point from a script, pin
// the version."). These rows pin that the check passes them today.
const RUNG_4_KNOWN_FALSE_GREENS = [
  'In rung 3 your build invokes the entry point; here Nave does.',
  'Does your build invoke the entry point? Nave does.',
]

test('AC-theming-36: residual, a contrast with Nave as the real invoker passes even alone', () => {
  for (const sentence of RUNG_4_KNOWN_FALSE_GREENS) {
    assert.deepEqual(rung4ReachProblems(sentence), [], `a known residual: ${sentence}`)
  }
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
