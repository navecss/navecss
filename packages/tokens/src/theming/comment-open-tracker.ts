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
 * string that CLOSES on its own line is skipped whole before that scan resumes, matching
 * one piece of real CSS tokenization this module models: a closed string is consumed as a
 * single token before the tokenizer ever looks for a comment start again, so an opening or
 * closing comment delimiter inside one is ordinary string content, never a delimiter (the
 * project's accessibility and licensing reviewer's S12, applied path — closes the false alarm
 * S12 recorded for exactly that closed-string shape). A string that does NOT close on its line
 * has no single reading, so this module does not pick one. Where an unescaped line break cuts
 * it off, CSS consumes it as a bad-string token running to the end of the line, which makes a
 * comment opener after the quote string content to a parser, while a reader can take the quote
 * as a stray character and see that opener open a comment. The module therefore reads every
 * line three ways that differ only on such a string: as the tokenizer does; resuming just past a
 * quote that does not close, with later strings on that line still recognised; and resuming just
 * past it with no new string started on the rest of that line, because once one quote is stray,
 * how the later ones pair is a guess. It also reads every line two further ways, set out further
 * down this file, that treat an unquoted `url()` token's content as opaque up to its closing
 * parenthesis, even on a later line, one of them also carrying a string continued by an escaped
 * line break onto the next line. Each reading carries its own comment state from line to line,
 * and a line counts as beginning inside an unclosed comment if ANY of the five says so. That
 * makes this a pure
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

  markLinesFlaggedByTheUrlOpaqueReading(lines, beginningsInsideAnUnclosedComment)
  markLinesFlaggedByTheEscapedLineBreakReading(lines, beginningsInsideAnUnclosedComment)

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
  aLaterQuoteCanStillOpenAString: false,
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

/**
 * Two further, separate readings, added to the union the module docblock describes
 * rather than folded into the three above: each is its own independent pass over `lines`, and
 * its output is only ever ADDED to `beginningsInsideAnUnclosedComment` (never replaces or
 * narrows it), so the result stays a superset of the three readings' own by construction, the
 * same way adding a fourth or fifth voter to a fixed union can only grow what it reports.
 *
 * Neither of the three readings above models an unquoted CSS `url(...)` token or a string
 * continued across a line break by a trailing backslash, because neither is the kind of
 * genuine reader ambiguity the three exist to cover — a real CSS tokenizer has exactly one
 * reading of both, and it is not "unterminated". Reading url content as ordinary text, or an
 * escape-continued string as an ordinary unclosed quote, as the three readings do, can misplace
 * where a comment opens or stays open by a full line, in the specific shape where a scanner's
 * own over-approximated comment state on one line closes on a delimiter that a correct reading
 * instead uses to open a DIFFERENT, still-open comment one line down. Each new reading carries
 * its own state from line to line in its own pass, apart from the three above and from the other
 * new one. They do share per-line helpers: the url-token helpers below serve both, and the
 * url-opaque reading calls `indexAfterAStringLiteral`, as the three do. No helper in this file
 * keeps any state between calls, so sharing one lets no reading's state reach another's: the
 * union is a set union of separately carried readings, not a shared state machine with extra
 * branches, which is what keeps "can only add a refusal" true without a sweep standing in for
 * the proof.
 */
interface UrlOpaqueScanState {
  readonly isInsideAnOpenComment: boolean
  // 0 when nothing url-related is carried into the next line; `-1` when an unquoted url token's
  // content is open and does not close on this line (`indexAfterUnquotedUrlContent`'s own
  // sentinel); `-2` when even that content has not started yet, only whitespace having followed
  // `url(` so far (`urlContentSentinel`'s own sentinel). One field instead of two booleans
  // because the two carried states are mutually exclusive by construction (a line reports at
  // most one of them), and because both sentinels already exist for a real reason elsewhere
  // (below), so storing them verbatim needs no third vocabulary just for this state's own sake.
  readonly urlCarry: number
}

/**
 * The url-opaque reading now also carries an unquoted `url(...)` token that does not close on the
 * line it starts on across the line boundary, or, when even that token's content has not started
 * yet because only whitespace followed `url(` up to the line's end, carries that undecided state
 * instead (see `UrlOpaqueScanState.urlCarry`), so its per-line state is no longer a single
 * open/closed comment boolean.
 */
function markLinesFlaggedByTheUrlOpaqueReading(lines: readonly string[], into: Set<number>): void {
  let state: UrlOpaqueScanState = { isInsideAnOpenComment: false, urlCarry: 0 }

  for (const [index, line] of lines.entries()) {
    if (state.isInsideAnOpenComment) into.add(index)
    state = scanLineWithOpaqueUrlContent(line, state)
  }
}

/**
 * Resolves what `urlCarry` (`UrlOpaqueScanState`'s field of the same name) means for THIS line
 * into an index to resume ordinary scanning at, or a negative sentinel the caller carries on to
 * the next line. With nothing carried (`0`) scanning resumes at index 0, as on a fresh line. A
 * carried url token can also resolve to index 0, when the line opens with the quote that makes an
 * undecided `url(` a function token, and that is correct: ordinary scanning then reads the quote.
 * Shared by both readings, since both carry the same convention.
 */
function resumeUrlCarry(line: string, urlCarry: number): number {
  if (urlCarry === 0) return 0
  return urlCarry === -2 ? urlContentSentinel(line, 0) : indexAfterUnquotedUrlContent(line, 0)
}

/**
 * One line of the url-opaque reading. A url token whose content was still undecided, or one
 * already known to be open (`state.urlCarry`, either sentinel), resumes that same decision
 * against this line's own leading characters (`resumeUrlCarry`, shared with the
 * escaped-line-break reading below). With neither carried in,
 * `scanLineForOpaqueUrlContentAndComments` runs the ordinary scan from index 0.
 */
function scanLineWithOpaqueUrlContent(line: string, state: UrlOpaqueScanState): UrlOpaqueScanState {
  const cursor = resumeUrlCarry(line, state.urlCarry)
  if (cursor < 0) return { isInsideAnOpenComment: false, urlCarry: cursor }
  return scanLineForOpaqueUrlContentAndComments(line, state.isInsideAnOpenComment, cursor)
}

/**
 * Same left-to-right, outside/inside-a-comment scan as `isLineStillInsideAnOpenComment`, with one
 * difference: before treating a `/*` or a quote as meaningful, it first checks whether an
 * unquoted CSS `url(...)` token starts here, and if so skips straight past its content. A CSS
 * tokenizer does not look for a comment delimiter, or a string, inside an unquoted url token's
 * body, so a comment opener or closer inside `url(...)` is just bytes of the URL, never a
 * comment. Reading it as a comment opener is what lets a later, real
 * closing delimiter get consumed as though it closed THIS phantom comment, leaving the tracker
 * blind to the genuine comment that opens on the character right after. When that url token's
 * content does not close on this line, CSS does not end it at the line break either — an
 * unterminated url token's remnants are consumed up to wherever its `)` actually falls, including
 * on a later line — so this carries `-1` forward (`urlCarry`) rather than treating the token as
 * closed at the line's end. When even the url token's content has not started yet because only
 * whitespace followed `url(` up to this line's end, this carries `-2` forward instead, since CSS
 * has not yet decided whether the token is an opaque url token or a function token taking a
 * quoted argument (see `urlContentSentinel`).
 */
function scanLineForOpaqueUrlContentAndComments(
  line: string,
  wasInsideAnOpenComment: boolean,
  cursor: number,
): UrlOpaqueScanState {
  let isInsideAnOpenComment = wasInsideAnOpenComment
  let index = cursor

  while (index < line.length) {
    if (isInsideAnOpenComment) {
      const closerIndex = line.indexOf('*/', index)
      if (closerIndex === -1) return { isInsideAnOpenComment: true, urlCarry: 0 }
      isInsideAnOpenComment = false
      index = closerIndex + 2
      continue
    }

    const urlLookup = tryToSkipAnUnquotedUrlToken(line, index)
    if (urlLookup !== undefined) {
      if (urlLookup < 0) return { isInsideAnOpenComment: false, urlCarry: urlLookup }
      index = urlLookup
      continue
    }

    const character = line[index]
    if (isAQuoteCharacter(character)) {
      const afterTheString = indexAfterAStringLiteral(line, index, character!)
      index = afterTheString === -1 ? line.length : afterTheString
      continue
    }

    if (line.startsWith('/*', index)) {
      isInsideAnOpenComment = true
      index += 2
      continue
    }

    index += 1
  }

  if (isInsideAnOpenComment) return { isInsideAnOpenComment: true, urlCarry: 0 }
  return { isInsideAnOpenComment: false, urlCarry: 0 }
}

/**
 * True for a character CSS treats as continuing an identifier, used to keep an unquoted `url(`
 * token from matching inside a longer identifier such as a custom function named `my-url(` or
 * `éurl(`. CSS ident code points are any ASCII letter, digit, `-`, `_`, or any non-ASCII code
 * point, so this also accepts any character outside the ASCII range.
 */
function isAnIdentifierCharacter(character: string | undefined): boolean {
  return (
    character !== undefined && (/[A-Za-z0-9_-]/.test(character) || character.codePointAt(0)! > 0x7f)
  )
}

/**
 * If an unquoted CSS url token — `url(` (case-insensitive), not preceded by an identifier
 * character, a `#` (which would make it a hash token followed by a separate `(`), or an `@`
 * (which would make it an at-keyword followed by a separate `(`) — starts at `cursor`, returns
 * where its content is (`urlContentSentinel`, called right after the `url(`). Returns `undefined`
 * when no such token starts here at all: `cursor` is not immediately after one of those three
 * characters, and does not spell `url(`. Shared by the url-opaque reading and the
 * escaped-line-break reading.
 */
function tryToSkipAnUnquotedUrlToken(line: string, cursor: number): number | undefined {
  if (isAnIdentifierCharacter(line[cursor - 1]) || /[#@]/.test(line[cursor - 1]!)) return undefined
  if (!/^url\(/i.test(line.slice(cursor, cursor + 4))) return undefined

  return urlContentSentinel(line, cursor + 4)
}

/**
 * Decides what an unquoted url token's content is once its `url(` (or a carried-over "awaiting
 * content" state from an earlier line) is behind `cursor`: CSS consumes any whitespace there,
 * including across a line break, before either the content itself or a quote. Returns `-2` when
 * this line runs out before a non-whitespace code point is seen (the same decision resumes on the
 * next line, from its own index 0). Returns the index of that code point itself when it is a
 * quote, since this is then not an opaque url token at all but a FUNCTION token taking a quoted
 * argument (per CSS Syntax), so ordinary scanning resumes right there. Otherwise the url content
 * has started, and `indexAfterUnquotedUrlContent` (below) reports where it ends, `-1` included.
 */
function urlContentSentinel(line: string, cursor: number): number {
  let index = cursor
  while (index < line.length && /\s/.test(line[index]!)) index += 1
  if (index === line.length) return -2
  if (isAQuoteCharacter(line[index])) return index
  return indexAfterUnquotedUrlContent(line, index)
}

/**
 * Shared by `urlContentSentinel` (above, deciding a url token's content — fresh via
 * `tryToSkipAnUnquotedUrlToken`, or resumed once its whitespace-only prefix has already been
 * skipped) and by both readings directly, to resume a url token already known to be open coming
 * into a line: scans its content, starting at `contentStart`, for its closing, unescaped `)`. A
 * backslash escapes the following character, so an escaped `)` does not close it. Returns the
 * index just past that `)`, or `-1` if none is found on this line. `-1` is not "the token ends at
 * the line's end": CSS consumes an unterminated url token's remnants up to the next unescaped `)`
 * wherever it falls, including on a later line, so every caller carries `-1` across the line
 * boundary rather than stopping here.
 */
function indexAfterUnquotedUrlContent(line: string, contentStart: number): number {
  let index = contentStart

  while (index < line.length) {
    if (line[index] === '\\' && index + 1 < line.length) {
      index += 2
      continue
    }
    if (line[index] === ')') return index + 1
    index += 1
  }

  return -1
}

/**
 * The second new reading (see the docblock above `markLinesFlaggedByTheUrlOpaqueReading`). It
 * carries a quoted string across a line boundary when the one
 * reason it did not close on its opening line is a backslash escaping the line break itself —
 * CSS's own escape rule for a string, which continues the string onto the next line rather than
 * ending it, unlike every other way a string can fail to close on its line (an ambiguity the
 * three readings above already cover). Because `copy-lint.ts` splits emitted CSS on `\n` only, a
 * line ending in `\r\n` in the original source arrives here as a "line" ending in `\r`; this
 * reading treats a backslash immediately before that trailing `\r` the same as a backslash at the
 * true end of the line, since CSS normalizes CRLF to one line break before tokenizing (see
 * `isAnEscapedLineBreakAtEndOfLine`). It also treats an unquoted `url(...)` token's content as
 * opaque, the same way `markLinesFlaggedByTheUrlOpaqueReading` does, carrying an unclosed one, or
 * an undecided one, across the line boundary too (`EscapedLineBreakScanState.urlCarry`, the same
 * two sentinels as `UrlOpaqueScanState.urlCarry` above). The three carried states are mutually
 * exclusive at any line boundary — inside a comment, inside or awaiting an unclosed url token's
 * content (`urlCarry`), or inside an open string (remembering which quote character) — so it
 * carries a small state object across lines instead of reusing `isLineStillInsideAnOpenComment`.
 */
function markLinesFlaggedByTheEscapedLineBreakReading(
  lines: readonly string[],
  into: Set<number>,
): void {
  let state: EscapedLineBreakScanState = NOTHING_IS_OPEN

  for (const [index, line] of lines.entries()) {
    if (state.isInsideAnOpenComment) into.add(index)
    state = scanLineAcrossEscapedLineBreaksAndUrls(line, state)
  }
}

interface EscapedLineBreakScanState {
  readonly isInsideAnOpenComment: boolean
  readonly urlCarry: number // same convention as `UrlOpaqueScanState.urlCarry` above
  readonly openStringQuote: string | undefined
}

// Two fixed shapes `EscapedLineBreakScanState` returns to over and over, named once so that a
// return site spreads or references one instead of re-listing all three fields (which routinely
// pushed a single return past this file's line-length limit and onto four lines instead of one).
const NOTHING_IS_OPEN: EscapedLineBreakScanState = {
  isInsideAnOpenComment: false,
  urlCarry: 0,
  openStringQuote: undefined,
}
const STILL_INSIDE_AN_OPEN_COMMENT: EscapedLineBreakScanState = {
  ...NOTHING_IS_OPEN,
  isInsideAnOpenComment: true,
}

/**
 * One line of the escaped-line-break reading (see `markLinesFlaggedByTheEscapedLineBreakReading`
 * above). An open string resumes first, in its own step
 * (`resumeAnOpenStringCarriedIntoThisLine`), purely to keep this function's branching low.
 * Otherwise, whatever `state.urlCarry` means for this line (nothing carried, a url token whose
 * content was still undecided, or one already known to be open — mutually exclusive with an open
 * string by construction) resolves to where to resume ordinary scanning (`resumeUrlCarry`, shared
 * with the url-opaque reading above), which is index 0 when nothing was carried, same as the
 * ordinary left-to-right scan (`scanFromStartOfLine`) running fresh.
 */
function scanLineAcrossEscapedLineBreaksAndUrls(
  line: string,
  state: EscapedLineBreakScanState,
): EscapedLineBreakScanState {
  if (state.openStringQuote !== undefined) {
    return resumeAnOpenStringCarriedIntoThisLine(
      line,
      state.isInsideAnOpenComment,
      state.openStringQuote,
    )
  }
  const cursor = resumeUrlCarry(line, state.urlCarry)
  if (cursor < 0) return { ...NOTHING_IS_OPEN, urlCarry: cursor }
  return scanFromStartOfLine(line, state.isInsideAnOpenComment, cursor)
}

/**
 * Resumes a string that was already open coming into `line` (scanning for its close starts at
 * index 0, per `scanAPossiblyContinuedStringLiteral`'s `quoteIndex: -1` convention). A further
 * escaped line break keeps it open into the NEXT line too; otherwise, closed or not, ordinary
 * scanning for a comment resumes right after it (or, if it never closes here, this reading's one
 * unambiguous case has run out — what follows is the ordinary ambiguity the three readings above
 * already cover, so this reading stops tracking the string rather than guessing at it too).
 */
function resumeAnOpenStringCarriedIntoThisLine(
  line: string,
  isInsideAnOpenComment: boolean,
  openStringQuote: string,
): EscapedLineBreakScanState {
  const outcome = scanAPossiblyContinuedStringLiteral(line, -1, openStringQuote)
  if (outcome.kind === 'continuesAcrossAnEscapedLineBreak') {
    return { ...NOTHING_IS_OPEN, isInsideAnOpenComment, openStringQuote }
  }
  if (outcome.kind === 'doesNotClose') {
    return { ...NOTHING_IS_OPEN, isInsideAnOpenComment }
  }
  return scanFromStartOfLine(line, isInsideAnOpenComment, outcome.indexAfter)
}

/**
 * Where to resume after a `StringLiteralScanOutcome` (below), or `undefined` for the one outcome
 * that is not an index at all — escape-continued past this line, which the caller reports as its
 * own carried state instead (remembering the quote character, which this does not need to). One
 * that closes resumes right after it; one that neither closes nor continues (the ordinary
 * ambiguity this reading does not resolve) resumes at the line's end, same as
 * `AS_THE_TOKENIZER_READS_IT`. Split out only to keep `scanFromStartOfLine`'s own cyclomatic
 * complexity inside this file's limit.
 */
function stringStep(outcome: StringLiteralScanOutcome, endOfLine: number): number | undefined {
  if (outcome.kind === 'closes') return outcome.indexAfter
  if (outcome.kind === 'continuesAcrossAnEscapedLineBreak') return undefined
  return endOfLine
}

/**
 * The ordinary left-to-right scan, from `cursor`, with no string or url token already open (or
 * awaiting its content) coming in: outside a comment, an unquoted url token's content is skipped
 * opaquely first (carried across the line boundary if it does not close here, or, if only
 * whitespace followed `url(` up to this line's end, carried as awaiting content instead — see
 * `urlContentSentinel`); failing that, the next opening delimiter opens a comment, unless a quote
 * opens a string first (skipped to its close, or, if it is escape-continued past this line,
 * reported as still open); inside a comment, the next closing delimiter closes it.
 *
 * Every return out of the loop must carry the true, current value of `isInsideAnOpenComment` (the
 * local variable below, not a fixed constant): running out of line while a `/*` opened a comment
 * on this line's own last two characters, or while already inside a comment on an EMPTY line
 * (nothing to scan, so the loop body never runs at all), both leave the loop with
 * `isInsideAnOpenComment` true but never hit one of the explicit early returns above, so only the
 * fallthrough return at the bottom sees them — which is why that one reads the local variable
 * instead of hardcoding `NOTHING_IS_OPEN`.
 */
function scanFromStartOfLine(
  line: string,
  wasInsideAnOpenComment: boolean,
  cursor: number,
): EscapedLineBreakScanState {
  let isInsideAnOpenComment = wasInsideAnOpenComment
  let index = cursor

  while (index < line.length) {
    if (isInsideAnOpenComment) {
      const closerIndex = line.indexOf('*/', index)
      if (closerIndex === -1) return STILL_INSIDE_AN_OPEN_COMMENT
      isInsideAnOpenComment = false
      index = closerIndex + 2
      continue
    }

    const urlLookup = tryToSkipAnUnquotedUrlToken(line, index)
    if (urlLookup !== undefined) {
      if (urlLookup < 0) return { ...NOTHING_IS_OPEN, urlCarry: urlLookup }
      index = urlLookup
      continue
    }

    const character = line[index]
    if (isAQuoteCharacter(character)) {
      const outcome = scanAPossiblyContinuedStringLiteral(line, index, character!)
      const target = stringStep(outcome, line.length)
      if (target === undefined) return { ...NOTHING_IS_OPEN, openStringQuote: character }
      index = target
      continue
    }

    if (line.startsWith('/*', index)) {
      isInsideAnOpenComment = true
      index += 2
      continue
    }

    index += 1
  }

  if (isInsideAnOpenComment) return STILL_INSIDE_AN_OPEN_COMMENT
  return NOTHING_IS_OPEN
}

type StringLiteralScanOutcome =
  | { readonly indexAfter: number; readonly kind: 'closes' }
  | { readonly kind: 'continuesAcrossAnEscapedLineBreak' }
  | { readonly kind: 'doesNotClose' }

/**
 * Like `indexAfterAStringLiteral`, but distinguishes the one case with a single, unambiguous CSS
 * reading from every other way a string can fail to close on its line: the string's last
 * character being a backslash that escapes the line break itself (see
 * `isAnEscapedLineBreakAtEndOfLine` for the CRLF-aware check of what counts as "last"), which is
 * valid CSS and carries the string onto the next line rather than ending it. `quoteIndex` is `-1`
 * when the string is already open coming into this line, so scanning starts at index 0.
 */
function scanAPossiblyContinuedStringLiteral(
  line: string,
  quoteIndex: number,
  quote: string,
): StringLiteralScanOutcome {
  let cursor = quoteIndex + 1

  while (cursor < line.length) {
    if (line[cursor] === '\\') {
      if (isAnEscapedLineBreakAtEndOfLine(line, cursor)) {
        return { kind: 'continuesAcrossAnEscapedLineBreak' }
      }
      cursor += 2
      continue
    }
    if (line[cursor] === quote) return { kind: 'closes', indexAfter: cursor + 1 }
    cursor += 1
  }

  return { kind: 'doesNotClose' }
}

/**
 * Whether the backslash at `cursor` escapes the line break itself rather than an ordinary
 * character on this line: either it is the very last character of `line`, or `line` ends with
 * that backslash immediately followed by a single trailing `\r`. The second case is what a line
 * that ended `\r\n` in the original CSS looks like here, because `copy-lint.ts` splits the
 * emitted CSS on `\n` only and leaves the `\r` attached to the line it preceded; CSS itself
 * normalizes a CRLF pair to one line break during input preprocessing, so a real tokenizer treats
 * both the same way.
 */
function isAnEscapedLineBreakAtEndOfLine(line: string, cursor: number): boolean {
  if (cursor === line.length - 1) return true
  return cursor === line.length - 2 && line[cursor + 1] === '\r'
}
