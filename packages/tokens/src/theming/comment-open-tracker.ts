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
 * one piece of real CSS tokenization this module needs: a closed string is consumed as a
 * single token before the tokenizer ever looks for a comment start again, so an opening or
 * closing comment delimiter inside one is ordinary string content, never a delimiter (the
 * project's accessibility and licensing reviewer's S12, applied path — closes the false alarm
 * S12 recorded for exactly that closed-string shape). A string that does NOT close on its line
 * is deliberately not skipped, and that is this module's one intentional departure from the
 * tokenizer: CSS consumes an unterminated string as a bad-string token running to the end of
 * the line, so a comment opener inside it is string content to a parser while a reader sees a
 * comment opening, and the requirement this module serves is stated over what a reader sees.
 * The departure can only ADD a refusal: resuming the scan just past the opening quote can open
 * a comment the tokenizer would not, and can never close one the tokenizer would leave open.
 * A quote seen WHILE inside a comment
 * is not given the same treatment: a real CSS comment closes at the first literal closing
 * delimiter, quoted or not, so tracking quotes there would let a string-shaped comment body
 * suppress a real close and turn an over-refusal into the silent pass this module exists to
 * prevent.
 */
export function linesThatBeginInsideAnUnclosedComment(
  lines: readonly string[],
): ReadonlySet<number> {
  const beginningsInsideAnUnclosedComment = new Set<number>()
  let isInsideAnOpenComment = false

  for (const [index, line] of lines.entries()) {
    if (isInsideAnOpenComment) beginningsInsideAnUnclosedComment.add(index)
    isInsideAnOpenComment = isLineStillInsideAnOpenCommentAfterScanning(line, isInsideAnOpenComment)
  }

  return beginningsInsideAnUnclosedComment
}

/**
 * Scans one line left to right from `wasInsideAnOpenComment`'s state, per the module docblock's
 * rule (outside a comment, a quoted string is skipped whole and the next opener opens one;
 * inside, the next closer closes it regardless of quotes; an opener seen while inside is
 * ordinary text). Returns whether the line ends still inside an open comment. Its own function,
 * rather than a `while` nested in the `for` loop above, only to keep this file's per-line scan
 * at one level of nesting.
 */
function isLineStillInsideAnOpenCommentAfterScanning(
  line: string,
  wasInsideAnOpenComment: boolean,
): boolean {
  let isInsideAnOpenComment = wasInsideAnOpenComment
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
    if (character === '"' || character === "'") {
      const afterTheString = indexAfterAStringLiteral(line, cursor, character)
      cursor = afterTheString === -1 ? cursor + 1 : afterTheString
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
 * Returns the index just past the closing quote matching the one at `quoteIndex`, or `-1` if the
 * string never closes on this line. A backslash escapes the following character (CSS's own
 * escape rule), so an escaped quote never ends the string early.
 *
 * `-1`, never `line.length`: an unterminated string is a genuine CSS bad-string token, correctly
 * consumed to the end of the line by a real tokenizer, but this module's own bound is stated in
 * terms of what a READER sees, and a reader does not stop reading at an unclosed quote — the
 * caller resumes scanning one character past the opening quote instead, so a real comment
 * opener sitting on the same line after it is still seen. Monotone by construction (swept
 * against generated line-sets covering every CSS-shaped combination of quotes, comment
 * delimiters and backslashes): this can only ever flag a line the old rule missed, never one it
 * caught, because the only case that changes is one where the tokenizer and the reader disagree.
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
