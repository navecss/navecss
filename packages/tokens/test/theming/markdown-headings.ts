/**
 * Fence-aware markdown heading offsets: the ONE copy of this logic in the package.
 *
 * A markdown heading line is byte-identical to a shell/python/yaml comment line, so any search
 * for a heading has to track code-fence state or be fooled by one in BOTH directions: forwards
 * it ends a window early, backwards it moves a window's start past prose that is really inside
 * it. Two test files needed the same answer and grew their own copies, which then diverged:
 * `remaining-ac.test.ts` toggled a boolean on ``` alone, while
 * `no-consumer-contrast-threshold-input.test.ts` tracked the opening marker. This module is the
 * consolidation, taking the stronger tracker as the surviving logic. It is not a test file and
 * registers no tests, the same shape as `cleared-copy.ts` beside it.
 *
 * FENCES ARE TRACKED BY THEIR OPENING MARKER, NEVER BY PARITY, and the reason is written down so
 * the parity form is not reintroduced as a simplification. A single boolean toggled by EITHER
 * marker cannot tell a fence MARKER from fence CONTENT of the other spelling: a `~~~` line inside
 * a backtick fence flips it, the `## ` heading that opens a section is then read as fenced and
 * swallowed, the section start falls back to the heading before it, and prose from the PREVIOUS
 * section is dragged into the window (round 3, a defect that round's fix
 * introduced and its verification read measured). Recording the opening marker and closing only
 * on a same-character run of at least equal length is immune to that by construction, and it also
 * closes the NESTED differing-length case (a four-backtick fence wrapping a three-backtick block)
 * for free, because closing-fence-length matching is exactly the mechanism that case needed.
 *
 * THE LEVEL IS A PARAMETER BECAUSE THE TWO CALL SITES DISAGREE, AND BOTH ARE RIGHT. One asks
 * where a SECTION boundary sits, where a `### ` sub-heading must NOT count; the other asks where
 * the next heading of any level sits, to bound a subsection. Forcing either scope onto the other
 * changes a verdict: narrowing the second WIDENS its window, and widening the first was a
 * measured regression (round 3, row R2). Each caller states its own scope and
 * its own reason at the call site, which is where that reason is legible.
 *
 * INDENTATION UP TO THREE SPACES IS HANDLED, on both patterns, because CommonMark permits it on
 * both: an opening fence and an ATX heading may each be indented up to three spaces and are an
 * indented code block from four. Anchoring at column 0, as this tracker did until
 * an earlier fix round, meant an indented fence opened nothing at all, so a `## ` line
 * inside one was read as a real heading. Its exposure needed the markers indented while the
 * fenced CONTENT sat at column 0, because the heading pattern was anchored too, so a wholly
 * indented block failed both patterns and the caller's check came out right for the wrong reason.
 * Both halves move together here, so both shapes are now read the way markdown reads them.
 *
 * A CLOSING FENCE IS A BARE MARKER RUN, and only the closing side carries that constraint. An
 * opening fence may be followed by an info string (` ```bash `); a closing one may be followed by
 * nothing but whitespace, so a run of the opening character that carries an info string is
 * CONTENT and leaves the block open. Testing only "same character, at least as long" read such a
 * line as a closer, which closed the block early and then reported every `## ` line after it as a
 * real heading: a false GREEN for a caller bounding a window, in the same direction as the
 * indentation defect above and measured the same way. The exposure is narrow
 * because markdown-in-markdown is conventionally written with a longer OUTER fence, which the
 * length rule already handled, and the length rule still applies on top of this one.
 *
 * WHAT IT STILL DOES NOT DO, measured rather than reasoned about (that same fix round),
 * stated so no caller reads a green as wider than it is:
 *
 * - A fence indented FOUR or more spaces still opens nothing. That is markdown's own rule at the
 *   top level (four spaces is an indented code block), but inside a list item a fence may be
 *   indented arbitrarily far by its container, and this tracker has no notion of containers.
 * - Setext headings (an `===` or `---` underline) are not headings to this tracker, and an
 *   unterminated fence swallows the rest of the document. Both move a boundary in the WIDENING
 *   direction, which is a false-red risk for a caller rather than a false green.
 */

/**
 * ATX heading, indented up to three spaces per CommonMark, with its level captured.
 */
const ATX_HEADING = /^ {0,3}(#{1,6})\s/

/**
 * A code fence of either spelling, indented up to three spaces per CommonMark. The capture is
 * the marker run alone, so the indentation never reaches the opener-versus-closer comparison.
 * This is the OPENING form, and it is deliberately unanchored at the end: an opening fence may
 * carry an info string.
 */
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * The CLOSING form, which is the opening form plus a right anchor: a closing fence is a bare
 * marker run, followed only by whitespace, and may never carry an info string. The trailing
 * `\r?` is the line ending and not content, because the caller splits on `\n` alone.
 */
const CLOSING_CODE_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/

/**
 * Whether `line` CLOSES a fence opened by the marker run `openFence`. Both conditions in one
 * predicate rather than inline at the call site, so the loop below keeps one decision per branch:
 * the run must be the same character and at least as long, AND the line must be a bare run.
 */
function isClosingFence(line: string, openFence: string): boolean {
  return CLOSING_CODE_FENCE.exec(line)?.[1]?.startsWith(openFence) ?? false
}

/**
 * The offsets of every heading of level `maxLevel` or shallower that sits outside a fenced code
 * block, in document order. Offsets are into `markdown` and point at the start of the heading's
 * own line, including any indentation.
 */
export function headingOffsetsOutsideFences(markdown: string, maxLevel: number): number[] {
  const offsets: number[] = []
  let openFence: string | undefined
  let offset = 0
  for (const line of markdown.split('\n')) {
    const fence = CODE_FENCE.exec(line)?.[1]
    if (fence === undefined) {
      const hashes = ATX_HEADING.exec(line)?.[1]
      if (openFence === undefined && hashes !== undefined && hashes.length <= maxLevel) {
        offsets.push(offset)
      }
    } else if (openFence === undefined) {
      openFence = fence
    } else if (isClosingFence(line, openFence)) {
      openFence = undefined
    }
    offset += line.length + 1
  }
  return offsets
}
