/**
 * R4/R7: a first-party version-3 source map encoder (VLQ base64) and the
 * minimal decoder `expandText()` needs to chain through an incoming map.
 * No `@jridgewell/*`, `magic-string` or `source-map*` package is imported
 * anywhere in the core's import graph (AC-directive-core-02, AC-08).
 */

const BASE64_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

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
function decodeVLQSegment(mappings: string, start: number): { next: number; value: number; } {
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
}

export interface SourceMap {
  readonly version: 3
  readonly sources: readonly string[]
  readonly names: readonly string[]
  readonly mappings: string
}

/**
 * Builds a v3 `mappings` string as output text is appended: `advance(text)`
 * moves the output cursor through literal text (tracking line/column);
 * `mark(position)` records one segment at the cursor's CURRENT position,
 * mapping it to `position` in source index 0.
 */
export class MappingsBuilder {
  private hasSegmentOnLine = false
  private readonly lines: string[][] = [[]]
  private outputColumn = 0
  private outputLine = 0
  private prevGeneratedColumn = 0
  private prevSourceColumn = 0
  private prevSourceLine = 0

  advance(text: string): void {
    for (const char of text) {
      if (char === '\n') {
        this.outputLine++
        this.outputColumn = 0
        this.lines.push([])
        this.prevGeneratedColumn = 0
        this.hasSegmentOnLine = false
        continue
      }
      this.outputColumn++
    }
  }

  mark(position: Position): void {
    const sourceLine = position.line - 1 // mappings are 0-based
    const generatedColumnDelta = this.hasSegmentOnLine ? this.outputColumn - this.prevGeneratedColumn : this.outputColumn
    const sourceLineDelta = sourceLine - this.prevSourceLine
    const sourceColumnDelta = position.column - this.prevSourceColumn
    this.lines[this.outputLine]!.push(
      encodeVLQ(generatedColumnDelta) + encodeVLQ(0) + encodeVLQ(sourceLineDelta) + encodeVLQ(sourceColumnDelta),
    )
    this.prevGeneratedColumn = this.outputColumn
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
  originalPositionFor(position: Position): { column: number; line: number; source: string; } | undefined
}

/**
The last decoded segment whose generated position is at or before `position`.
 */
function findCandidate(segments: readonly DecodedSegment[], position: Position): DecodedSegment | undefined {
  const generatedLine = position.line - 1
  let candidate: DecodedSegment | undefined
  for (const segment of segments) {
    if (segment.generatedLine > generatedLine) break
    if (segment.generatedLine === generatedLine && segment.generatedColumn > position.column) break
    candidate = segment
  }
  return candidate
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
    originalPositionFor(position) {
      const candidate = findCandidate(segments, position)
      if (!candidate) return
      return { source: sources[candidate.sourceIndex]!, line: candidate.sourceLine + 1, column: candidate.sourceColumn }
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
function decodeOneSegment(state: DecoderState, raw: string, generatedLine: number): DecodedSegment | undefined {
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
