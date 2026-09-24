/**
 * AC-token-build-33 / AC-token-build-34 (R33/R34 of
 * the token-build spec). Reads the shipped consumer-facing artifact itself — the
 * repository-root `README.md`'s `## Theming` section, per R33's own named artifact and
 * `AC-token-build-33`'s second `Given`/`Then` — and asserts the five things R33 requires on
 * top of `AC-theming-36`'s coverage, which is referenced and not re-derived.
 *
 * ONE CODE-BLOCK KIND IS RECOGNISED: THE BACKTICK FENCE. Everything else is prose. This is a
 * deliberate narrowing (round 4 of an earlier review) of a file that had grown a general
 * CommonMark block parser — tilde fences, indented blocks, an inline-span scanner — to assert
 * seven propositions about one fixed, cleared document. Measured on the `## Theming` section
 * this file reads, on this branch rather than taken from the round that reported it: NINE
 * fences (18 delimiter lines), all backtick, info strings `bash` / `css` / `json`; ZERO tilde
 * fences; ZERO indented blocks; 42 list markers. So the deleted machinery guarded constructs
 * the artifact does not contain while adding false-red surface over 42 constructs it does,
 * which is what three rounds of hardening kept re-discovering: a loose nested list and a
 * four-space continuation paragraph are lawful markdown that an indented-block reader calls
 * code.
 *
 * ONE PIECE OF THAT MACHINERY IS BACK, and naming it costs less than letting the paragraph
 * above read as a claim it does not make: `codeSpanLines` scans inline backticked runs. It is
 * one regex over one line, not a CommonMark inline parser (no double-backtick spans, no
 * escapes, no awareness of anything beyond skipping fence lines), and it feeds exactly one
 * check, how a flag is spelled. The unbounded problem the narrowing deleted was deciding what
 * is a CODE BLOCK, because that moves section boundaries and can void the whole scan; getting
 * an inline span wrong can only ever mis-read one flag.
 *
 * The reach is kept by a different question. A guard that recognises only fences must still
 * catch a refused invocation written in prose, because after the narrowing that is what an
 * indented block IS. The discriminator is therefore whether text IS A COMMAND (it names the
 * binary and passes a flag), not which markdown construct it sits in. That is a property of
 * the text rather than of the parser, so it does not grow when markdown does, and it is what
 * makes "Pass `--out` and a path" stay green for a reason rather than by luck: it names a
 * flag and runs nothing.
 *
 * THE LINE IS NOT THAT UNIT, and this paragraph asserted for one round that it was while the
 * reach it claimed was already gone. The document is hard-wrapped at ~78 columns, so a lawful
 * line break separates a binary from its flag routinely, and a line-only reading let §6 item
 * 12's own named harm straight through: "Your build runs `navecss-tokens build`" / "with
 * `--seed #2f6feb` supplied from wherever it keeps the brand colour" is the truncated hex
 * seed, and neither of its two lines is a command. So there are TWO units, each carrying the
 * checks it can carry alone. The COMMAND BLOCK — one fence, or one PARAGRAPH, that names the
 * binary and passes a flag — carries the spelling checks, because a spelling is a whole
 * invocation and a paragraph is where the author's own sentence ends. The CODE SPAN — one
 * fence content line, or one inline backticked run — carries the flag-form check alone,
 * because `--seed #2f6feb` shown as code is the refused spelling even in a paragraph that
 * never names the binary. Prose outside both is read by neither, which is what keeps a loose
 * nested list ("- the seed, via --seed and nothing else") green.
 *
 * WHAT THIS FILE DOES NOT COVER, AND WHAT NOTHING ELSE COVERS EITHER. R34's re-theming notice
 * stands at every rung of this section that performs a re-theming act (all of them except rung
 * 0, which performs none), and NO test reads any of those instances. The count is deliberately
 * not written here as a figure: a rung added later brings its own instance, and a hardcoded
 * number would understate the gap the moment one did. The sibling assertions in
 * `packages/tokens/test/theming/remaining-ac.test.ts` read the EMITTED CSS and the PACKED
 * `packages/tokens/README.md`; neither reads this artifact, so a "README half is covered"
 * reading of that file is true of the packed README and false of this one.
 *
 * RESIDUAL, NAMED RATHER THAN CHASED. A `#`-prefixed line that escapes into the prose stream
 * from a construct this file no longer models (a tilde fence, an HTML block) would be read as
 * a heading and would truncate the section under it. The scan precondition below catches that
 * by asserting THE GUARD'S OWN READ IS INTACT — `## Theming` must end exactly where
 * `## Accessibility` begins — rather than by counting the document's H1s. Any escaped `#` or
 * `##` line between those two headings moves that boundary and reds; one below
 * `## Accessibility` or above the H1 moves no boundary this file reads and is correctly
 * ignored. Counting H1s was wrong on both halves: it reddened an HTML `<pre>` in the licence
 * footer, which truncates nothing the guard reads, and it was blind to the `##` form, which
 * truncates everything under it. The document contains no such construct, and a check on the
 * artifact is allowed to know what the artifact is.
 *
 * Deliberately reads ONLY the rendered markdown text. `AC-token-build-33`'s own second clause
 * forbids importing or referencing `packages/tokens/src/theming/ladder.ts` or any other
 * internal data structure to make this pass (the proxy-assertion class an earlier issue was
 * raised for), and this file does not import anything from `packages/tokens/src` at all.
 *
 * The fence-aware section parsing (`scanFences`/`fences`/`headingLines`/`sectionRange`/
 * `bodyOf`) lives in `readme-sections.mjs` (extracted for reuse): a second and third
 * script needed the identical parsing rather than a second fence parser, so it was extracted
 * there with no behaviour change.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bodyOf,
  fences,
  headingLines,
  readReadme,
  scanFences,
  sectionRange,
} from './readme-sections.mjs'

const README = readReadme()

const BINARY = 'navecss-tokens'

/**
 * IS THIS TEXT A COMMAND: it names the binary AND passes at least one flag. Deliberately
 * indifferent to markdown. A fenced invocation, an inline-backticked one (rung 1b's grey-seed
 * line is one) and a bare prose one are all commands; text that merely names the binary
 * ("Rungs 1b, 3, 4 and 5 run `navecss-tokens`, which lives in ...") passes no flag and is not
 * one, which is the false red that scoping by construct kept producing.
 */
function isCommand(text) {
  return text.includes(BINARY) && /(?:^|[\s"'`([])--[a-z]/.test(text)
}

/**
 * The COMMAND BLOCKS of `body`, with the line range each occupies: every fence content, and
 * every PARAGRAPH (a run of consecutive non-blank lines outside every fence), that is a
 * command.
 *
 * The paragraph rather than the line, because this document is hard-wrapped at ~78 columns
 * and a line is therefore not a container for anything: "Run `npx navecss-tokens build`" and
 * "with `--seed=$BRAND --out=$DIR` from your own task runner." are one invocation shown in
 * one sentence, and a per-line reading sees a name on one line and some flags on another and
 * a command nowhere. A paragraph is where the author's own sentence ends, so it is where a
 * command can be. This also subsumes the backslash continuation the earlier reading joined by
 * hand: continuation lines are adjacent non-blank lines, which is a paragraph already,
 * whether or not it sits inside a fence.
 */
function commandBlocks(body) {
  const { fences: found, fenceLines } = scanFences(body)
  const blocks = found.map((fence) => ({ text: fence.content, from: fence.from, to: fence.to }))
  const lines = body.split('\n')
  let start = -1
  const flush = (end) => {
    if (start >= 0)
      blocks.push({ text: lines.slice(start, end).join('\n'), from: start, to: end - 1 })
    start = -1
  }
  for (const [i, line] of lines.entries()) {
    if (fenceLines.has(i) || line.trim() === '') flush(i)
    else if (start < 0) start = i
  }
  flush(lines.length)
  return blocks.filter((block) => isCommand(block.text))
}

/**
 * The CODE SPANS of `body`, one entry per LINE: every line of every fence's content, plus
 * every inline backticked run on a line belonging to no fence. This is the second unit, and
 * it exists for the one thing a command block cannot reach: `--seed #2f6feb` shown as code in
 * a paragraph that never names the binary at all ("Pass `--seed #2f6feb` from your own build
 * variables."). That is the refused spelling whatever runs it, so the flag-form check reads
 * spans on their own. Kept line-by-line so the flag-form check never matches across a line
 * break, which would read a flag ending one line and a word beginning the next as a
 * space-form pair.
 *
 * Deliberately NOT used for the "which spelling is this" question, only for how a flag is
 * written: a span carries no evidence about what invoked it, and reading one as an invocation
 * makes a URL that merely spells the binary's name ("https://navecss.dev/navecss-tokens...")
 * into a second invocation spelling.
 */
function codeSpanLines(body) {
  const { fences: found, fenceLines } = scanFences(body)
  const spans = found.flatMap((fence) => fence.content.split('\n'))
  const lines = body.split('\n')
  for (const [i, line] of lines.entries()) {
    if (fenceLines.has(i)) continue
    for (const match of line.matchAll(/`([^`\n]+)`/g)) spans.push(match[1])
  }
  return spans
}

/**
 * Every occurrence of the binary in `text`, with what precedes it ON ITS OWN TERMS. The
 * command starts where the command starts, not where the markdown line does: inside an inline
 * span (an odd number of backticks precedes the binary on that line) the start is the span's
 * opening backtick, and otherwise it is the start of the line. A list marker, a block quote
 * marker, a bold lead-in or a table cell therefore sits OUTSIDE the measured prefix, because
 * none of them is part of how the command is spelled.
 */
function binaryPrefixes(text) {
  return text.split('\n').flatMap((line) => {
    const found = []
    let at = line.indexOf(BINARY)
    while (at >= 0) {
      const ticks = (line.slice(0, at).match(/`/g) ?? []).length
      const start = ticks % 2 === 1 ? line.lastIndexOf('`', at) : 0
      found.push({ prefix: line.slice(start, at), line })
      at = line.indexOf(BINARY, at + BINARY.length)
    }
    return found
  })
}

const README_LINES = README.split('\n')
const README_HEADINGS = headingLines(README_LINES)
const THEMING_RANGE = sectionRange(README_LINES, README_HEADINGS, /^## Theming\b/, 2)
const theming = bodyOf(README_LINES, THEMING_RANGE)

const THEMING_LINES = theming.split('\n')
const THEMING_HEADINGS = headingLines(THEMING_LINES)

// The ladder's rungs are DERIVED from the section's own headings, never hardcoded. A hardcoded
// list makes a per-rung check blind to any rung added later and blind to the preamble above the
// first rung, and it cannot tell "the ladder has no rungs" from "the list was right"; the shape
// assertion below is what stops a parse failure yielding a silently empty loop.
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

const rung1b = rungBody('1b')
const rung3 = rungBody('3')
const rung4 = rungBody('4')
const rung5 = rungBody('5')

// The whole ladder MINUS rung 1b's body: the preamble between `## Theming` and the first rung,
// every other rung, and the closing paragraph after the last one. This is the unit R33(e)'s
// "and nowhere else" ranges over (the clause scopes to the LADDER'S RUNGS, which is why
// `## Getting started`, outside this section, lawfully repeats the act).
const rung1bRange = RUNG_RANGES.get('1b')
const ladderOutsideRung1b = [
  ...THEMING_LINES.slice(0, rung1bRange.start),
  ...THEMING_LINES.slice(rung1bRange.end),
].join('\n')

const THEMING_COMMANDS = commandBlocks(theming)
const THEMING_CODE = codeSpanLines(theming)

test('AC-token-build-33: the README carries a "## Theming" section (the artifact R33 names)', () => {
  assert.match(README, /^## Theming\b/m)
})

test("AC-token-build-33: the guard's read of the Theming section is not truncated", () => {
  // A PRECONDITION OF THE SCAN, not a proposition about the copy, and it earns its place the
  // same way the rung enumeration below does. Every rung range in this file is derived from
  // the heading scan, so a line read as a heading where the document has none silently
  // truncates the section and makes every assertion under it pass against a body that no
  // longer contains the thing it checks. The one way that happens now is a `#`-shaped line
  // reaching the prose stream out of a construct this file does not model.
  //
  // THE ASSERTION IS ON THE READ, NOT ON THE CONSTRUCT, which is the correction: counting the
  // document's H1s fires on a `<pre>` anywhere in the file, including below everything this
  // guard reads, where it truncates nothing; and it is blind to the `##` form, which
  // truncates the section just as completely. What matters is only whether the section ENDED
  // WHERE THE DOCUMENT SAYS IT ENDS, and the document says `## Accessibility`.
  const boundary = README_LINES[THEMING_RANGE.end] ?? '<the end of the file>'
  assert.match(
    boundary,
    /^## Accessibility\b/,
    `the "## Theming" section must end where "## Accessibility" begins; it ended at ${JSON.stringify(boundary)} (line ${THEMING_RANGE.end + 1}) instead. Every per-rung assertion below reads a section that stops there, so anything after that point is unchecked. A boundary that is not a real heading is usually a shell comment that has escaped a code construct this file does not parse.`,
  )
})

test("AC-token-build-33: the ladder's rungs are read off the section's own headings", () => {
  // Not a restatement of the hardcoded list this replaces: it is the guard that makes the
  // derivation trustworthy. If the heading scan breaks, every per-rung check below would
  // otherwise loop over nothing and pass; and a rung ADDED to the ladder lands here first,
  // where it is visible, instead of slipping past checks that never knew to look at it.
  assert.ok(RUNG_NAMES.length > 0, 'the heading scan found no rungs at all in the Theming section')
  assert.deepEqual(
    RUNG_NAMES,
    ['0', '1a', '1b', '2', '3', '4', '5'],
    'this list is a SPEC ENUMERATION, not an arbitrary hardcode: G1 R29 fixes the ladder at these seven rows in this order and AC-theming-34 asserts exactly that. A rung lawfully added to the ladder is meant to land here first, where it is visible. If that is what happened, the fix is to add the new rung to this list once the spec carries it (and to check every per-rung assertion below against it), never to loosen the assertion.',
  )
})

// --- (a) one canonical invocation spelling, used identically at every rung that shows one ---

test('AC-token-build-33 (a): every command uses the equals form (--flag=value), never the space form', () => {
  // The space form is refused BY NAME (readme-0.1.0-assembly.md §6 item 12): it silently
  // truncates a hex seed passed through a package.json script, because `#` begins a shell
  // comment when it begins a word.
  //
  // TWO UNITS, because one of them is not enough on a hard-wrapped document (see the file
  // docblock). The COMMAND BLOCK reaches an invocation however it is dressed — fenced,
  // inline-backticked, or bare in prose — and across the wraps inside it. The CODE SPAN
  // reaches the refused spelling where the wrap has left it in a paragraph that never names
  // the binary; a span is code, and the harm §6 item 12 names is done by those two words,
  // not by what shares their paragraph. What neither unit reaches is a flag named in running
  // text that shows no command and is not code: "- the seed, via --seed and nothing else"
  // names no binary, so it is no command block, and carries no backticks, so it is no span.
  assert.ok(THEMING_COMMANDS.length > 0, 'the ladder shows no invocation of the binary at all')
  const valueFlags = ['--seed', '--out', '--overrides', '--source']
  for (const line of [...THEMING_COMMANDS.map((block) => block.text), ...THEMING_CODE]) {
    for (const flag of valueFlags) {
      // `${flag}[ \t][^=]` and not `${flag}(?!=)`: a flag NAMED with nothing after it is a
      // mention and stays green. What is refused is a flag given a value across a space
      // instead of across `=`. Horizontal whitespace only, and not `\s`, because a command
      // block is deliberately multi-line: a newline in one is a wrap, not an argument
      // separator, and `\s` would read a flag ending one line and the first word of the next
      // as a space-form pair.
      assert.doesNotMatch(
        line,
        new RegExp(String.raw`${flag}[ \t][^=]`),
        `expected no space-form "${flag} <value>" in this command: ${line}`,
      )
    }
  }
  // And the equals form is actually used (a doesNotMatch-only test would also pass on an empty
  // ladder with no invocations at all, which is not what R33 wants).
  const shown = THEMING_COMMANDS.map((block) => block.text).join('\n')
  assert.match(shown, /--seed=/)
  assert.match(shown, /--out=/)
  assert.match(shown, /--overrides=/)
  assert.match(shown, /--source=/)
})

test('AC-token-build-33 (a): every command begins at the bare binary name, one spelling', () => {
  // The clause is "one canonical invocation spelling, used identically at every rung that
  // shows one", and the flag spelling is only half of a spelling. A rung rewritten to
  // `npx navecss-tokens build ...` or `./node_modules/.bin/navecss-tokens ...` shows a SECOND
  // spelling of the same act while every flag in it still uses the equals form.
  //
  // THE PREFIX IS MEASURED FROM THE COMMAND'S OWN START, not from the start of the markdown
  // line carrying it (`binaryPrefixes` above), and getting that wrong is what made this
  // assertion red on the ladder's own copy: rung 1b's grey-seed command shown as a list item
  // is byte-identical to what ships, and `- ` before it was being read as part of the
  // invocation. What may legitimately precede the binary, measured that way, is nothing at
  // all, the opening backtick of the span the command is shown in, or the `"name": "` of the
  // package.json script R34 requires. Every markdown container the document uses — a list
  // marker, a block quote, a bold lead-in, a table cell — sits before that start and is not
  // measured, because none of them is part of how the command is spelled.
  //
  // The unit is the COMMAND BLOCK and is not narrowed to fences, which is a deliberate call
  // with a cost stated rather than hidden: rung 1b's grey-seed line is a real invocation shown
  // in an inline span, and a fence-only reading would let a second spelling land there unseen.
  // The price is that a paragraph naming the binary AND passing a flag reads as showing a
  // command, so prose of the form "pass `--seed=x` to `navecss-tokens`" reds. That is the
  // intended reading of such a sentence, not a defect: R33(a) is about every rung that SHOWS
  // an invocation, and text carrying the binary and its flags shows one. The CODE SPAN is
  // deliberately NOT a unit here — see `codeSpanLines` — because a span proves nothing about
  // what ran.
  for (const { prefix, line } of THEMING_COMMANDS.flatMap((block) => binaryPrefixes(block.text))) {
    assert.match(
      prefix,
      /^\s*(?:"[^"]*"\s*:\s*)?["'`]?\s*$/,
      `expected the command to begin at the bare binary name, found "${prefix}" before it (${line})`,
    )
  }
})

// --- (b) how a consumer obtains the entry point, stated exactly ONCE across the whole ladder ---

test('AC-token-build-33 (b): the obtaining instruction is stated exactly once across the ladder', () => {
  // Counted as "any add/install instruction naming @navecss/tokens", not as one literal
  // command string: the clause forbids the INSTRUCTION being stated at four rungs, and a
  // second statement spelled `npm i -D @navecss/tokens` states it just as fully as a second
  // `pnpm add -D @navecss/tokens` would. The three parts must appear on ONE LINE and IN ORDER
  // (manager word, verb, package name), which is what keeps the prose introducing the fence
  // from counting: "which lives in `@navecss/tokens`; add it to your project once" carries the
  // name and a verb with no manager word before them.
  //
  // `i` is matched only where it is a manager's own short form; a bare `\bi\b` also matches the
  // "i" of "i.e." (a `.` is not a word character).
  //
  // Scoped to `## Theming` deliberately: R33(b) is "once across the whole ladder", and
  // `## Getting started`'s own install line sits outside this section by the same scoping
  // reading that lets it repeat act 3.
  const instruction =
    /\b(?:npm|pnpm|yarn|bun)\b[^\n]*?\b(?:add|install|i(?![\w.]))\b[^\n]*?@navecss\/tokens/g
  const occurrences = theming.match(instruction) ?? []
  assert.equal(
    occurrences.length,
    1,
    `the obtaining instruction must appear exactly once across the ladder, not repeated at each rung that runs the generator; found ${occurrences.length}: ${JSON.stringify(occurrences)}`,
  )
})

// --- (c) rung 3's override flag; rung 4 has no config file and is driven by the same flags ---

test('AC-token-build-33 (c): rung 3 names the per-step override flag', () => {
  assert.match(rung3, /--overrides=/)
})

test('AC-token-build-33 (c): rung 4 states there is no config file at 0.1.0, at this rung or any other', () => {
  assert.match(rung4, /no Nave configuration file/i)
})

test("AC-token-build-33 (c): rung 4 is driven from the consumer's own build on the same inputs", () => {
  // The clause has TWO limbs after R33's SECOND PRECISION, and the negative one above is the
  // easy half. This is the other: "the entry point is driven from the consumer's own build
  // using the same four flags rung 3 has". Without it, a rung 4 that correctly denies a config
  // file and then says nothing about what DOES drive the build passes clause (c) while
  // answering none of the question the rung exists to answer.
  //
  // TWO INDEPENDENT PROPOSITIONS, not one windowed order, so each red names its own cause and
  // neither binds a correct rung to one hyphenation or one clause order.
  assert.match(
    rung4,
    /\byour own build\b/i,
    "rung 4 must name the consumer's own build as what drives the entry point",
  )
  assert.match(
    rung4,
    /\brungs above\b/i,
    'rung 4 must refer its inputs back to the rungs above rather than describe an input surface of its own',
  )
  assert.match(
    rung4,
    /\bcommand[-\s]line\b/i,
    'rung 4 must name the command line as the surface those inputs are passed on (either "command line" or "command-line")',
  )
})

test('AC-token-build-33 (c): the ladder reinstates no config flag, no config file and no config snippet', () => {
  // The three shapes readme-0.1.0-assembly.md §6 item 11 refuses BY NAME.

  // (1) No `--config`-shaped flag is SHOWN. The line between showing a flag and naming its
  //     absence is whether it is GIVEN A VALUE, not whether it sits in prose or in code:
  //     "Pass --config=nave.json to point at one" and "Pass `--config nave.json` to point at
  //     one" both instruct, while "There is no `--config` flag to pass" denies, and the
  //     character after the flag is what tells them apart (a value token, versus the backtick
  //     that closes the span around the flag's NAME).
  //
  //     A VALUE IS ANY TOKEN, and the previous spelling of this regex additionally required
  //     it to contain a dot or a slash, which is a claim about filenames that this comment
  //     never made and that `--config settings` and `--config "my settings"` both walk past.
  //     Horizontal whitespace only: a `--config` ending a line is a name, and `\s+` would
  //     reach across the wrap and read the next line's first word as its value.
  assert.doesNotMatch(
    theming,
    /--config(?:=|[ \t]+)[^\s`]/,
    "no --config-shaped flag exists at 0.1.0; writing one with a value shows it rather than denying it, and it is copy that fails on the reader's first run",
  )
  //     A flag inside a FENCE is shown as a command line whatever follows it. An inline
  //     backticked span is deliberately not a fence: that is where the lawful mention lives.
  for (const fence of fences(theming)) {
    assert.doesNotMatch(
      fence.content,
      /--config\b/,
      `no --config-shaped flag exists at 0.1.0; a code block showing one is copy that fails on the reader's first run:\n${fence.content}`,
    )
  }
  //     And in a command block, which reaches an inline span that IS one.
  for (const { text } of THEMING_COMMANDS) {
    assert.doesNotMatch(text, /--config/, `no --config-shaped flag exists at 0.1.0: ${text}`)
  }

  // (2) No Nave-owned config FILE is named, at rung 4 or anywhere ("at this rung or at any
  //     other" is the copy's own scope). Filename-shaped on purpose: `nave.steps.json` is
  //     rung 3's per-step override file and is lawful, and the phrase "Nave configuration
  //     file" in rung 4's own denial is lawful too.
  assert.doesNotMatch(
    theming,
    /\bnave[.-]?config\b|\.?\bnaverc\b/i,
    'no Nave-owned config file exists at 0.1.0; naming one is copy that fails on first run',
  )

  // (3) No config-file SNIPPET at rung 4. The subject of §6 item 11 is a NAVE CONFIG FILE, so
  //     that is what is detected, BY SHAPE: a rung-4 fence that declares two or more settings
  //     as `key: value` / `key = value` pairs and invokes nothing. A config file is a list of
  //     settings; a command is a thing being run; the two do not look alike, and neither one
  //     is identified by the names it happens to use.
  //
  //     WHAT THIS REPLACES, AND THE TWO CLAIMS THE COMMENT HERE MADE THAT WERE NOT TRUE. The
  //     detector was an allow-list of four key names (`seed|out|overrides|source`) applied to
  //     any rung-4 fence not CONTAINING the string `navecss-tokens`, and this comment said
  //     that "costs no reach" and leaves "nothing to keep up to date". Both were false as
  //     written and both were then measured false: the same config file spelled `seedColor` /
  //     `outputDir` declares exactly what §6 item 11 refuses and matched no name on the list,
  //     and a `$schema` URL carrying the word `navecss-tokens` was enough to switch the whole
  //     check off for the fence containing it. A shape has nothing to keep up to date; a
  //     vocabulary always did. The skip is now "this fence invokes the entry point", which is
  //     the property that makes a block a command rather than a config file, and a URL that
  //     merely spells the binary's name invokes nothing.
  //
  //     TWO IS THE THRESHOLD, BECAUSE TWO IS WHERE A CONFIG FILE SEPARATES from the two lawful
  //     blocks rung 4's own R29 subject invites, both of which the earlier
  //     every-fence-must-name-the-binary rule reddened: build wiring whose make target is a
  //     single `tokens:` line, and an output transcript.
  //
  //     A ONE-SETTING SNIPPET (`{ "seed": "x" }`) would sit under that threshold, so a SECOND
  //     path catches it, and the two are a UNION rather than a gate. The shape path above owns
  //     the general case and needs no vocabulary; this one adds Nave's own four input names,
  //     and it is deliberately additive-only. That direction is the whole point: a name missing
  //     from this list can only cause a MISS, never a false red, and the shape path still
  //     catches a config file spelled with names nobody anticipated (`seedColor` / `outputDir`
  //     is two settings and is caught above). A vocabulary used as the sole gate is what went
  //     wrong before; a vocabulary used only to strengthen a shape cannot repeat it.
  //
  //     Vacuous today (rung 4 shows no code block at all): it constrains what may be added,
  //     and claims no coverage of what is there now, which limb (2) above is what asserts.
  const SETTING = /(?:^|[{,\s])"?[$A-Za-z_][\w.$-]*"?\s*[:=]/g
  const NAVE_INPUT_SETTING = /(?:^|[{,\s])"?(?:seed|out|overrides|source)"?\s*[:=]/i
  for (const fence of fences(rung4)) {
    if (isCommand(fence.content)) continue
    const settings = fence.content.match(SETTING) ?? []
    const declaresNaveInput = NAVE_INPUT_SETTING.test(fence.content)
    assert.ok(
      settings.length < 2 && !declaresNaveInput,
      `a rung-4 code block that declares ${settings.length} setting(s) as key/value pairs${declaresNaveInput ? ', one of them a Nave input name,' : ''} and invokes nothing is a Nave config file, and none exists at 0.1.0 (info string ${JSON.stringify(fence.info)}):\n${fence.content}`,
    )
  }
})

// --- (d) the validate invocation at rung 5 ---

test('AC-token-build-33 (d): rung 5 shows the validate invocation with --source=', () => {
  assert.match(rung5, /navecss-tokens validate --source=/)
})

// --- (e) act 3 (the import swap to @navecss/core/no-tokens) at rung 1b, and nowhere else ---

test('AC-token-build-33 (e): act 3 (the @navecss/core/no-tokens import swap) is documented at rung 1b', () => {
  assert.match(rung1b, /@navecss\/core\/no-tokens/)
})

test('AC-token-build-33 (e): act 3 is documented nowhere else in the ladder', () => {
  // Asserted over the ladder MINUS rung 1b rather than over a hardcoded list of the other six
  // rungs. The list version left two holes: the preamble between `## Theming` and `### Rung 0`
  // belongs to no rung and was checked by nothing, and a rung added later would be invisible to
  // it. Subtracting the one lawful home covers both, and covers the closing paragraph too.
  assert.doesNotMatch(
    ladderOutsideRung1b,
    /@navecss\/core\/no-tokens/,
    'R33(e) places act 3 at rung 1b and at no other point in the ladder',
  )
})

// --- AC-token-build-34: rung 1b teaches a package.json script, and teaches it FIRST ---
//
// "Never a bare shell invocation" overstates the assertion below, and overstating it is a
// known-trap shape from the reassuring side: AC-34's own text is ORDERED ("no instruction
// anywhere shows the bare binary run ad hoc BEFORE that script exists"), so a run placed AFTER
// the json fence is green and green is the CORRECT verdict on it. The proposition is about what
// the reader meets first, not about what the rung may go on to show.

test('AC-token-build-34: rung 1b teaches the invocation as a package.json script', () => {
  assert.match(rung1b, /"scripts"\s*:\s*\{/)
  assert.match(rung1b, /"navecss-tokens build --seed=.+--out=.+"/)
})

test('AC-token-build-34: the first mention of the binary at rung 1b is inside the script fence', () => {
  const jsonFence = fences(rung1b).find((fence) => fence.lang === 'json')
  assert.ok(jsonFence, 'rung 1b must teach the invocation in a json (package.json) fence')

  // The first occurrence that is part of a COMMAND, and not the raw first occurrence. AC-34
  // refuses an instruction that shows the bare binary "run ad hoc" before the script exists,
  // and NAMING the binary is not RUNNING it: "The generator is called navecss-tokens and you
  // wire it into your project once:" passes no flag, instructs no run, and reading it as one
  // reds a rung that violates nothing. The raw read was defended on the ground that rung 1b's
  // copy names the binary nowhere before the fence, which is true of today's copy and is a
  // fact about the artifact rather than a property of the check.
  //
  // What the raw read was RIGHT about is kept, and it is what makes this the command test and
  // not a fence test: prose showing the run IS an instruction, so "Run navecss-tokens build
  // --seed=... once to see it, then add the script" still reds. It names the binary and passes
  // a flag, which is the same discriminator the (a) checks above use. A fence's content
  // counts whatever it says, with no flag required, because a fence at this rung ahead of the
  // json one is the ad-hoc run shown as code.
  const shows = new Set()
  for (const fence of fences(rung1b)) {
    for (let i = fence.from; i <= fence.to; i += 1) shows.add(i)
  }
  for (const block of commandBlocks(rung1b)) {
    for (let i = block.from; i <= block.to; i += 1) shows.add(i)
  }
  const rung1bLines = rung1b.split('\n')
  let firstMention = -1
  let cursor = 0
  for (let i = 0; i < rung1bLines.length && firstMention < 0; i += 1) {
    const at = rung1bLines[i].indexOf(BINARY)
    if (at !== -1 && shows.has(i)) firstMention = cursor + at
    cursor += rung1bLines[i].length + 1
  }
  assert.ok(firstMention >= 0, 'rung 1b must show the invocation at least once')
  assert.ok(
    firstMention >= jsonFence.contentStart && firstMention < jsonFence.contentEnd,
    'the first mention of the binary at rung 1b must be inside the package.json script fence; anything earlier is the bare binary run ad hoc before the script exists',
  )
})
