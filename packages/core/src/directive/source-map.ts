/**
 * A first-party version-3 source map encoder (VLQ base64) and the
 * minimal decoder `expandText()` needs to chain through an incoming map.
 * No `@jridgewell/*`, `magic-string` or `source-map*` package is imported
 * anywhere in the core's import graph (AC-directive-core-02, AC-08).
 */

const BASE64_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const NEWLINE_CHARS = new Set(['\n', '\r', '\f'])

/**
One field's VLQ base64 encoding: zigzag-signed, 5 bits per digit, a continuation bit on all but the last.
 */
function encodeVLQ(n: number): string {
  let value = n < 0 ? (-n << 1) + 1 : n << 1
  let result = ''
  do {
    let digit = value & 0b1_1111
    value >>>= 5
    if (value > 0) digit |= 0b10_0000
    result += BASE64_DIGITS[digit]
  } while (value > 0)
  return result
}

const BASE64_VALUE = new Map([...BASE64_DIGITS].map((c, i) => [c, i]))

/**
One field's VLQ base64 decoding, starting at `start`; `next` is the index just past it.
 */
function decodeVLQSegment(mappings: string, start: number): { next: number; value: number } {
  let value = 0
  let shift = 0
  let i = start
  for (;;) {
    const digit = BASE64_VALUE.get(mappings[i]!)!
    i++
    value += (digit & 0b1_1111) << shift
    if ((digit & 0b10_0000) === 0) break
    shift += 5
  }
  const isNegative = (value & 1) === 1
  const magnitude = value >>> 1
  return { value: isNegative ? -magnitude : magnitude, next: i }
}

export interface Position {
  readonly line: number // 1-based
  readonly column: number // 0-based
  /**
  Index into the map's own `sources` array; `0` (the caller's one source) when omitted, so a construction site with no incoming map to chain through never has to say so.
   */
  readonly sourceIndex?: number
}

export interface SourceMap {
  readonly version: 3
  readonly sources: readonly string[]
  readonly sourceRoot?: string
  readonly sourcesContent?: readonly (string | null)[]
  readonly names: readonly string[]
  readonly mappings: string
}

/**
 * Builds a v3 `mappings` string as output text is appended: `advance(text)`
 * moves the output cursor through literal text (tracking line/column);
 * `mark(position)` records one segment at the cursor's CURRENT position,
 * mapping it to `position`, in `position.sourceIndex` when it names one
 * (source index 0 otherwise — the caller's own one source).
 */
export class MappingsBuilder {
  private hasSegmentOnLine = false
  private readonly lines: string[][] = [[]]
  private outputColumn = 0
  private outputLine = 0
  // A lone trailing `\r`, possibly half of a CRLF pair split across two
  // `advance()` calls by a removed directive: consumed by the next call's
  // leading `\n`, if any, instead of double-counted.
  private pendingCR = false
  private prevGeneratedColumn = 0
  private prevSourceColumn = 0
  private prevSourceIndex = 0
  private prevSourceLine = 0

  /**
   * A plain indexed loop, not `for...of` (which iterates by code point, so
   * a surrogate pair would advance the column by one instead of two — every
   * position here is in UTF-16 code units). A line break is CR, FF, LF or a
   * CRLF pair, CSS Syntax 3's own "newline" (§4.2).
   */
  advance(text: string): void {
    let i = this.consumePendingCR(text)
    while (i < text.length) {
      const c = text[i]
      if (c !== undefined && NEWLINE_CHARS.has(c)) {
        i = this.advancePastNewline(text, i, c)
        continue
      }
      this.outputColumn++
      i++
    }
  }

  /**
   * `i` past the line break `c` (at `i`): past the whole pair for a `\r`
   * immediately followed by `\n`, and `pendingCR` set instead when `\r` is
   * the last character `text` has to offer.
   */
  advancePastNewline(text: string, i: number, c: string): number {
    let next = i + 1
    if (c === '\r' && text[next] === '\n') {
      next++
    } else if (c === '\r' && next === text.length) {
      this.pendingCR = true
    }
    this.outputLine++
    this.outputColumn = 0
    this.lines.push([])
    this.prevGeneratedColumn = 0
    this.hasSegmentOnLine = false
    return next
  }

  /**
   * How far into `text` `advance` should start: `1` for a lone `\n` that is
   * really the other half of a CRLF pair split across two calls; `0`
   * otherwise.
   */
  consumePendingCR(text: string): number {
    if (text.length === 0) return 0
    const skip = this.pendingCR && text.startsWith('\n') ? 1 : 0
    this.pendingCR = false
    return skip
  }

  mark(position: Position): void {
    const sourceIndex = position.sourceIndex ?? 0
    const sourceLine = position.line - 1 // mappings are 0-based
    const generatedColumnDelta = this.hasSegmentOnLine
      ? this.outputColumn - this.prevGeneratedColumn
      : this.outputColumn
    const sourceIndexDelta = sourceIndex - this.prevSourceIndex
    const sourceLineDelta = sourceLine - this.prevSourceLine
    const sourceColumnDelta = position.column - this.prevSourceColumn
    this.lines[this.outputLine]!.push(
      encodeVLQ(generatedColumnDelta) +
        encodeVLQ(sourceIndexDelta) +
        encodeVLQ(sourceLineDelta) +
        encodeVLQ(sourceColumnDelta),
    )
    this.prevGeneratedColumn = this.outputColumn
    this.prevSourceIndex = sourceIndex
    this.prevSourceLine = sourceLine
    this.prevSourceColumn = position.column
    this.hasSegmentOnLine = true
  }

  toMappings(): string {
    return this.lines.map((segments) => segments.join(',')).join(';')
  }
}

interface DecodedSegment {
  readonly generatedLine: number
  readonly generatedColumn: number
  readonly sourceIndex: number
  readonly sourceLine: number
  readonly sourceColumn: number
}

export interface IncomingMap {
  readonly sources: readonly string[]
  readonly sourceRoot: string | undefined
  readonly sourcesContent: readonly (string | null)[] | undefined
  originalPositionFor(
    position: Position,
  ): { column: number; line: number; source: string; sourceIndex: number } | undefined
}

/**
 * The last decoded segment whose generated position is at or before
 * `position`, found by binary search rather than a linear scan from the
 * start: `segments` is already in ascending generated-position order (built
 * that way, one output token at a time), and a linear scan per query made
 * chaining through an incoming map quadratic in the number of directives.
 * Never a segment from an EARLIER generated line than the query's own: a
 * generated line whose own first segment starts past the queried column
 * (nothing on it maps that far left) has no mapping for this position at
 * all, the same way any other reader of this map would read it — not the
 * previous line's own last segment, however close its generated position
 * sorts.
 */
function findCandidate(
  segments: readonly DecodedSegment[],
  position: Position,
): DecodedSegment | undefined {
  const generatedLine = position.line - 1
  let low = 0
  let high = segments.length - 1
  let candidate: DecodedSegment | undefined
  while (low <= high) {
    const mid = (low + high) >> 1
    const segment = segments[mid]!
    const isAtOrBefore =
      segment.generatedLine < generatedLine ||
      (segment.generatedLine === generatedLine && segment.generatedColumn <= position.column)
    if (isAtOrBefore) {
      candidate = segment
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return candidate?.generatedLine === generatedLine ? candidate : undefined
}

/**
 * A decoded incoming map, ready for `originalPositionFor`: a plain object
 * closing over its decoded state, not a class — this project's class
 * member-ordering rules disagree with each other for a class this shape
 * (a getter alongside private fields), which a plain object sidesteps.
 */
export function decodeIncomingMap(map: SourceMap): IncomingMap {
  const sources = map.sources
  const segments = decodeSegments(map.mappings)

  return {
    sources,
    sourceRoot: map.sourceRoot,
    sourcesContent: map.sourcesContent,
    originalPositionFor(position) {
      const candidate = findCandidate(segments, position)
      if (!candidate) return
      return {
        source: sources[candidate.sourceIndex]!,
        sourceIndex: candidate.sourceIndex,
        line: candidate.sourceLine + 1,
        column: candidate.sourceColumn,
      }
    },
  }
}

/**
Running totals a `mappings` string's deltas accumulate against, across the whole map.
 */
interface DecoderState {
  generatedColumn: number
  sourceIndex: number
  sourceLine: number
  sourceColumn: number
}

/**
One comma-separated segment, decoded and folded into `state`; `undefined` for a generated-only segment (no source mapping).
 */
function decodeOneSegment(
  state: DecoderState,
  raw: string,
  generatedLine: number,
): DecodedSegment | undefined {
  const col = decodeVLQSegment(raw, 0)
  state.generatedColumn += col.value
  if (col.next >= raw.length) return undefined

  const srcIdx = decodeVLQSegment(raw, col.next)
  state.sourceIndex += srcIdx.value
  const srcLine = decodeVLQSegment(raw, srcIdx.next)
  state.sourceLine += srcLine.value
  const srcCol = decodeVLQSegment(raw, srcLine.next)
  state.sourceColumn += srcCol.value

  return {
    generatedLine,
    generatedColumn: state.generatedColumn,
    sourceIndex: state.sourceIndex,
    sourceLine: state.sourceLine,
    sourceColumn: state.sourceColumn,
  }
}

/**
Every decoded segment across the whole `mappings` string, in generated-position order.
 */
function decodeSegments(mappings: string): DecodedSegment[] {
  const segments: DecodedSegment[] = []
  const state: DecoderState = { generatedColumn: 0, sourceIndex: 0, sourceLine: 0, sourceColumn: 0 }

  const lines = mappings.split(';')
  for (const [generatedLine, line] of lines.entries()) {
    state.generatedColumn = 0
    if (line === '') continue
    for (const raw of line.split(',')) {
      const segment = decodeOneSegment(state, raw, generatedLine)
      if (segment) segments.push(segment)
    }
  }
  return segments
}
