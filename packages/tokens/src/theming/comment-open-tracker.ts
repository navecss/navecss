/**
 * A single-purpose leaf: given the lines of some emitted CSS, which of them BEGIN while a CSS
 * comment opened on an earlier line is still open. Split out of `copy-lint.ts` rather than
 * added inline there, on the project's principal engineer's ruling in round 3 of its review,
 * for three grounds recorded here rather than left to the commit message alone:
 *
 * 1. This PR's own recorded design for a file that grows is to give the growing half its own
 *    file rather than raise `copy-lint.ts`'s `max-lines` override a third time —
 *    `guard-message-probes.ts` is the precedent, this is the same move applied to the one
 *    addition that would otherwise force a fourth raise.
 * 2. `copy-lint.ts` at 297 of the default 300 is a promise that is true and hollow: the next
 *    sentence anyone adds to that file reopens the override question its own headline claims
 *    to have closed. Moving this helper out buys real headroom, not an arithmetic footnote.
 * 3. A module with no imports from the theming graph is a LEAF, and that is not incidental:
 *    That same review also records that this repository's `import-x/no-cycle` lint is
 *    currently NOT firing on a real 3-node cycle in this same directory
 *    (`copy-lint.ts` -> `guard-message-probes.ts` -> `emit.ts` -> `copy-lint.ts`, benign
 *    out-of-process but unchecked by the configured guard). Adding a new edge into that graph
 *    would go unchecked by the same silently-non-functioning lint; keeping this helper a leaf
 *    means it adds none.
 *
 * The project's accessibility and licensing reviewer's bound (applied path):
 * whatever tracks comment state may only ever ADD a refusal, never change WHICH text a caller
 * lints. This module only ANSWERS "does line N begin inside an unclosed comment?" — it does
 * not decide what happens next, so it cannot by itself narrow or widen what its caller reads.
 *
 * Deliberately not a CSS parser: reading a line left to right, while outside a comment the
 * next opening delimiter opens one; while inside, the next closing delimiter closes it, and an
 * opening delimiter seen between them is ordinary text. While outside a comment, a quoted
 * string that CLOSES on its own line is skipped whole before that scan resumes, matching the
 * one piece of real CSS tokenization this module models: a closed string is consumed as a
 * single token before the tokenizer ever looks for a comment start again, so an opening or
 * closing comment delimiter inside one is ordinary string content, never a delimiter (the
 * project's accessibility and licensing reviewer's S12, applied path — closes the false alarm
 * S12 recorded for exactly that closed-string shape). A string that does NOT close on its line
 * has no single reading, so this module does not pick one. Where an unescaped line break cuts
 * it off, CSS consumes it as a bad-string token running to the end of the line, which makes a
 * comment opener after the quote string content to a parser, while a reader can take the quote
 * as a stray character and see that opener open a comment. The module therefore reads every
 * line three ways: as the tokenizer does; resuming just past a quote that does not close, with
 * later strings on that line still recognised; and resuming just past it with no new string
 * started on the rest of that line, because once one quote is stray, how the later ones pair is
 * a guess. Each reading carries its own comment state from line to line, and a line counts as
 * beginning inside an unclosed comment if ANY of the three says so. That makes this a pure
 * addition by construction, not by sampling: the lines reported always include every line any
 * single reading reports (the tokenizer's reading among them, which was this module's earlier
 * rule), so a reading can add a refusal but can never remove one another reading gives. The
 * readings are followed separately, never collapsed into one answer per line, because they can
 * disagree about which delimiter a shared asterisk belongs to: given a slash, an asterisk and a
 * slash in a row, a reading already inside a comment closes it on the last two characters,
 * while a reading outside opens a comment on the first two and is still inside it after the
 * third, so following only one reading can drop a refusal another gives. A quote seen WHILE
 * inside a comment is not given the same treatment: a real CSS comment closes at the first
 * literal closing delimiter, quoted or not, so tracking quotes there would let a string-shaped
 * comment body suppress a real close and turn an over-refusal into the silent pass this module
 * exists to prevent.
 */
export function linesThatBeginInsideAnUnclosedComment(
  lines: readonly string[],
): ReadonlySet<number> {
  const beginningsInsideAnUnclosedComment = new Set<number>()
  const readings = [
    AS_THE_TOKENIZER_READS_IT,
    RESUMING_PAST_AN_UNCLOSED_QUOTE,
    RESUMING_WITH_NO_FURTHER_STRINGS,
  ]

  for (const reading of readings) {
    let isInsideAnOpenComment = false

    for (const [index, line] of lines.entries()) {
      if (isInsideAnOpenComment) beginningsInsideAnUnclosedComment.add(index)
      isInsideAnOpenComment = isLineStillInsideAnOpenComment(line, isInsideAnOpenComment, reading)
    }
  }

  return beginningsInsideAnUnclosedComment
}

/**
 * What one reading (module docblock: the three named below) says about a quoted string that
 * does NOT close on the line it opens on: where the scan resumes, and whether a later quote on
 * the same line can still open a string of its own. Nothing about a reading is a caller-supplied
 * flag; each of the three below is its own named, fixed constant.
 */
interface UnclosedQuoteReading {
  readonly resumesAtEndOfLineAfterAnUnclosedQuote: boolean
  readonly aLaterQuoteCanStillOpenAString: boolean
}

/**
 * Reading one of three (module docblock): as the tokenizer does. An unclosed string runs to the
 * end of the line, so nothing after it on this line is looked at.
 */
const AS_THE_TOKENIZER_READS_IT: UnclosedQuoteReading = {
  resumesAtEndOfLineAfterAnUnclosedQuote: true,
  aLaterQuoteCanStillOpenAString: true,
}

/**
 * Reading two of three (module docblock): resuming just past a quote that does not close, with
 * later strings on that line still recognised. The scan resumes one character past the opening
 * quote, so a real comment delimiter after it is still seen, and a later quote on the same line
 * can still open a string of its own.
 */
const RESUMING_PAST_AN_UNCLOSED_QUOTE: UnclosedQuoteReading = {
  resumesAtEndOfLineAfterAnUnclosedQuote: false,
  aLaterQuoteCanStillOpenAString: true,
}

/**
 * Reading three of three (module docblock): resuming just past a quote that does not close,
 * with no new string started for the rest of that line. Same as the previous reading up to the
 * first quote that does not close on this line; from there, because how any later quote on this
 * line would pair is a guess, this reading stops treating quote characters as string openers
 * for the remainder of the line and reads them, like everything else outside a comment, as
 * ordinary text.
 */
const RESUMING_WITH_NO_FURTHER_STRINGS: UnclosedQuoteReading = {
  resumesAtEndOfLineAfterAnUnclosedQuote: false,
  aLaterQuoteCanStillOpenAString: false,
}

/**
 * Scans one line left to right from `wasInsideAnOpenComment`'s state, following `reading`'s
 * policy (above) for a quoted string that does not close on this line. Outside a comment, a
 * quoted string that closes on its own line is skipped whole and the next opening delimiter
 * opens one. Inside a comment, the next closing delimiter closes it regardless of quoting, and
 * an opening delimiter seen while inside is ordinary text. Returns whether the line ends still
 * inside an open comment.
 */
function isLineStillInsideAnOpenComment(
  line: string,
  wasInsideAnOpenComment: boolean,
  reading: UnclosedQuoteReading,
): boolean {
  let isInsideAnOpenComment = wasInsideAnOpenComment
  let hasPassedAnUnclosedQuoteOnThisLine = false
  let cursor = 0

  while (cursor < line.length) {
    if (isInsideAnOpenComment) {
      const closerIndex = line.indexOf('*/', cursor)
      if (closerIndex === -1) return true
      isInsideAnOpenComment = false
      cursor = closerIndex + 2
      continue
    }

    const character = line[cursor]
    const canThisQuoteOpenAString =
      isAQuoteCharacter(character) &&
      (reading.aLaterQuoteCanStillOpenAString || !hasPassedAnUnclosedQuoteOnThisLine)

    if (canThisQuoteOpenAString) {
      // Reaches here only once isAQuoteCharacter(character) has already held above.
      const afterTheString = indexAfterAStringLiteral(line, cursor, character!)
      if (afterTheString === -1) {
        hasPassedAnUnclosedQuoteOnThisLine = true
        cursor = reading.resumesAtEndOfLineAfterAnUnclosedQuote ? line.length : cursor + 1
      } else {
        cursor = afterTheString
      }
      continue
    }

    if (line.startsWith('/*', cursor)) {
      isInsideAnOpenComment = true
      cursor += 2
      continue
    }

    cursor += 1
  }

  return isInsideAnOpenComment
}

/**
 * Whether `character` opens a CSS string literal (a single or double quote).
 */
function isAQuoteCharacter(character: string | undefined): boolean {
  return character === '"' || character === "'"
}

/**
 * Returns the index just past the closing quote matching the one at `quoteIndex`, or `-1` if the
 * string never closes on this line. A backslash escapes the following character (CSS's own
 * escape rule), so an escaped quote never ends the string early.
 */
function indexAfterAStringLiteral(line: string, quoteIndex: number, quote: string): number {
  let cursor = quoteIndex + 1

  while (cursor < line.length) {
    if (line[cursor] === '\\') {
      cursor += 2
      continue
    }
    if (line[cursor] === quote) return cursor + 1
    cursor += 1
  }

  return -1
}
