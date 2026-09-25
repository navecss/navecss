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
 * Two further, wholly separate readings, added to the union the module docblock describes
 * rather than folded into the three above: each is its own independent pass over `lines`, and
 * its output is only ever ADDED to `beginningsInsideAnUnclosedComment` (never replaces or
 * narrows it), so the result stays a superset of the three readings' own by construction, the
 * same way adding a fourth or fifth voter to a fixed union can only grow what it reports.
 *
 * Neither of the three readings above models an unquoted CSS `url(...)` token or a string
 * continued across a line break by a trailing backslash, because neither is the kind of
 * genuine reader ambiguity the three exist to cover — a real CSS tokenizer has exactly one
 * reading of both, and it is not "unterminated". Treating either as an ordinary unclosed quote
 * (the three readings' shared fallback) can misplace where a comment opens or stays open by a
 * full line, in the specific shape where a scanner's own over-approximated comment state on one
 * line closes on a delimiter that a correct reading instead uses to open a DIFFERENT, still-open
 * comment one line down. Both new readings are independent from the three above and from one
 * another, and from the shared `isLineStillInsideAnOpenComment`/`indexAfterAStringLiteral` pair,
 * on purpose: the union is a set union of independently-scanned lines, not a shared state
 * machine with extra branches, which is what keeps "can only add a refusal" true without a
 * sweep standing in for the proof.
 */
interface UrlOpaqueScanState {
  readonly isInsideAnOpenComment: boolean
  readonly isInsideAnOpenUrl: boolean
}

/**
 * The url-opaque reading now also carries an unquoted `url(...)` token that does not close on
 * the line it starts on across the line boundary (see `scanLineForOpaqueUrlContentAndComments`),
 * so its per-line state is no longer a single open/closed comment boolean.
 */
function markLinesFlaggedByTheUrlOpaqueReading(lines: readonly string[], into: Set<number>): void {
  let state: UrlOpaqueScanState = { isInsideAnOpenComment: false, isInsideAnOpenUrl: false }

  for (const [index, line] of lines.entries()) {
    if (state.isInsideAnOpenComment) into.add(index)
    state = scanLineWithOpaqueUrlContent(line, state)
  }
}

/**
 * One line of the url-opaque reading. When `state.isInsideAnOpenUrl` carries in from the
 * previous line, the line starts already inside that url token's content, so this resumes the
 * search for its closing, unescaped `)` from index 0 before ordinary scanning continues; otherwise
 * `scanLineForOpaqueUrlContentAndComments` runs the ordinary scan from index 0.
 */
function scanLineWithOpaqueUrlContent(line: string, state: UrlOpaqueScanState): UrlOpaqueScanState {
  if (!state.isInsideAnOpenUrl) {
    return scanLineForOpaqueUrlContentAndComments(line, state.isInsideAnOpenComment, 0)
  }
  const afterUrlContent = indexAfterUnquotedUrlContent(line, 0)
  if (afterUrlContent === -1) return { isInsideAnOpenComment: false, isInsideAnOpenUrl: true }
  return scanLineForOpaqueUrlContentAndComments(line, state.isInsideAnOpenComment, afterUrlContent)
}

/**
 * Same left-to-right, outside/inside-a-comment scan as `isLineStillInsideAnOpenComment`, with one
 * difference: before treating a `/*` or a quote as meaningful, it first checks whether an
 * unquoted CSS `url(...)` token starts here, and if so skips straight past its content. A CSS
 * tokenizer does not look for a comment delimiter, or a string, inside an unquoted url token's
 * body — the two are lexically incompatible, since a real `/* / *\/`  inside `url(...)` is just
 * bytes of the URL, never a comment. Reading it as a comment opener is what lets a later, real
 * closing delimiter get consumed as though it closed THIS phantom comment, leaving the tracker
 * blind to the genuine comment that opens on the character right after. When that url token's
 * content does not close on this line, CSS does not end it at the line break either — an
 * unterminated url token's remnants are consumed up to wherever its `)` actually falls, including
 * on a later line — so this reports `isInsideAnOpenUrl: true` rather than treating the
 * token as closed at the line's end.
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
      if (closerIndex === -1) return { isInsideAnOpenComment: true, isInsideAnOpenUrl: false }
      isInsideAnOpenComment = false
      index = closerIndex + 2
      continue
    }

    const afterUrlToken = tryToSkipAnUnquotedUrlToken(line, index)
    if (afterUrlToken !== undefined) {
      if (afterUrlToken === -1) return { isInsideAnOpenComment: false, isInsideAnOpenUrl: true }
      index = afterUrlToken
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

  return { isInsideAnOpenComment, isInsideAnOpenUrl: false }
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
 * character, whose first non-whitespace character is not a quote — starts at `cursor`, returns
 * the index just past its closing, unescaped `)`, or `-1` if it does not close on this line (the
 * caller then carries that across the line boundary; see `indexAfterUnquotedUrlContent`, below).
 * Returns `undefined` when no such token starts here at all, including a `url(` immediately
 * followed by a quote, which is an ordinary quoted argument left to the caller's own string
 * scanning. Shared by the url-opaque reading and the escaped-line-break reading.
 */
function tryToSkipAnUnquotedUrlToken(line: string, cursor: number): number | undefined {
  if (isAnIdentifierCharacter(line[cursor - 1])) return undefined
  if (!/^url\(/i.test(line.slice(cursor, cursor + 4))) return undefined

  let contentStart = cursor + 4
  while (contentStart < line.length && /\s/.test(line[contentStart]!)) contentStart += 1
  if (isAQuoteCharacter(line[contentStart])) return undefined

  return indexAfterUnquotedUrlContent(line, contentStart)
}

/**
 * Shared by `tryToSkipAnUnquotedUrlToken` (above) and by both readings directly, to resume a url
 * token already known to be open coming into a line: scans its content, starting at
 * `contentStart`, for its closing, unescaped `)`. A backslash escapes the following character, so
 * an escaped `)` does not close it. Returns the index just past that `)`, or `-1` if none is found
 * on this line. `-1` is not "the token ends at the line's end": CSS consumes an unterminated url
 * token's remnants up to the next unescaped `)` wherever it falls, including on a later line, so
 * every caller carries `-1` across the line boundary rather than stopping here.
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
 * The second new reading (see the docblock above `markLinesFlaggedByTheUrlOpaqueReading`): the
 * faithful tokenizer model. It carries a quoted string across a line boundary when the one
 * reason it did not close on its opening line is a backslash escaping the line break itself —
 * CSS's own escape rule for a string, which continues the string onto the next line rather than
 * ending it, unlike every other way a string can fail to close on its line (an ambiguity the
 * three readings above already cover). Because `copy-lint.ts` splits emitted CSS on `\n` only, a
 * line ending in `\r\n` in the original source arrives here as a "line" ending in `\r`; this
 * reading treats a backslash immediately before that trailing `\r` the same as a backslash at the
 * true end of the line, since CSS normalizes CRLF to one line break before tokenizing (see
 * `isAnEscapedLineBreakAtEndOfLine`). It also treats an unquoted `url(...)` token's content as
 * opaque, the same way `markLinesFlaggedByTheUrlOpaqueReading` does, carrying an unclosed one
 * across the line boundary too (see `indexAfterUnquotedUrlContent`, shared by both readings).
 * Three carried states are mutually exclusive at any line boundary — inside a comment, inside an
 * open string (remembering which quote character), or inside an unclosed url token's content —
 * so it carries a small state object across lines instead of reusing
 * `isLineStillInsideAnOpenComment`.
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
  readonly isInsideAnOpenUrl: boolean
  readonly openStringQuote: string | undefined
}

// Three fixed shapes `EscapedLineBreakScanState` returns to over and over, named once so that a
// return site spreads or references one instead of re-listing all three fields (which routinely
// pushed a single return past this file's line-length limit and onto four lines instead of one).
const NOTHING_IS_OPEN: EscapedLineBreakScanState = {
  isInsideAnOpenComment: false,
  isInsideAnOpenUrl: false,
  openStringQuote: undefined,
}
const STILL_INSIDE_AN_OPEN_COMMENT: EscapedLineBreakScanState = {
  ...NOTHING_IS_OPEN,
  isInsideAnOpenComment: true,
}
const CARRYING_AN_UNCLOSED_URL_TOKEN: EscapedLineBreakScanState = {
  ...NOTHING_IS_OPEN,
  isInsideAnOpenUrl: true,
}

/**
 * One line of the escaped-line-break reading (see `markLinesFlaggedByTheEscapedLineBreakReading`
 * above). Whichever of the two carried states is active coming in resumes first: an unclosed url
 * token's content resumes inline (its own search for `)` is one call, so a separate step would
 * only add one), while an open string resumes in its own step
 * (`resumeAnOpenStringCarriedIntoThisLine`) purely to keep this function's branching low. With
 * neither carried in, the ordinary left-to-right scan (`scanFromStartOfLine`) runs from index 0.
 */
function scanLineAcrossEscapedLineBreaksAndUrls(
  line: string,
  state: EscapedLineBreakScanState,
): EscapedLineBreakScanState {
  if (state.isInsideAnOpenUrl) {
    const afterUrlContent = indexAfterUnquotedUrlContent(line, 0)
    if (afterUrlContent === -1) return CARRYING_AN_UNCLOSED_URL_TOKEN
    return scanFromStartOfLine(line, state.isInsideAnOpenComment, afterUrlContent)
  }
  if (state.openStringQuote !== undefined) {
    return resumeAnOpenStringCarriedIntoThisLine(
      line,
      state.isInsideAnOpenComment,
      state.openStringQuote,
    )
  }
  return scanFromStartOfLine(line, state.isInsideAnOpenComment, 0)
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
 * The ordinary left-to-right scan, from `cursor`, with no string or url token already open coming
 * in: outside a comment, an unquoted url token's content is skipped opaquely first (carried
 * across the line boundary if it does not close here); failing that, the next opening delimiter
 * opens a comment, unless a quote opens a string first (skipped to its close, or, if it is
 * escape-continued past this line, reported as still open); inside a comment, the next closing
 * delimiter closes it.
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

    const afterUrlToken = tryToSkipAnUnquotedUrlToken(line, index)
    if (afterUrlToken !== undefined) {
      if (afterUrlToken === -1) return CARRYING_AN_UNCLOSED_URL_TOKEN
      index = afterUrlToken
      continue
    }

    const character = line[index]
    if (isAQuoteCharacter(character)) {
      const outcome = scanAPossiblyContinuedStringLiteral(line, index, character!)
      if (outcome.kind === 'closes') {
        index = outcome.indexAfter
        continue
      }
      if (outcome.kind === 'continuesAcrossAnEscapedLineBreak') {
        return { ...NOTHING_IS_OPEN, openStringQuote: character }
      }
      index = line.length
      continue
    }

    if (line.startsWith('/*', index)) {
      isInsideAnOpenComment = true
      index += 2
      continue
    }

    index += 1
  }

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
