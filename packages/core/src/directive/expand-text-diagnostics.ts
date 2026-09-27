/**
 * The line/column mapping and the `onUnknown`-routed enrichment
 * `expandText()` applies to `plan()`'s own diagnostics before returning
 * them — split out of `expand-text.ts` to keep that file under the
 * project's file-length lint.
 */
import type { Diagnostic } from './diagnostics-types.ts'
import type { Position } from './source-map.ts'

/**
 * The two `ExpandTextOptions` fields this module reads — named separately,
 * rather than imported from `expand-text.ts`, so this file and that one
 * never import each other.
 */
export interface DiagnosticReportOptions {
  readonly onUnknown?: 'warn' | 'error' | 'ignore' | undefined
  readonly from?: string | undefined
}

/**
 * One of `expandText()`'s returned diagnostics, positioned in the
 * authored file's own line/column space rather than only the plain
 * `offset`/`endOffset` `plan()` itself deals in.
 */
export interface ExpandedDiagnostic extends Diagnostic {
  readonly severity: 'error' | 'warning'
  readonly file?: string
  readonly line: number
  readonly column: number
}

/**
 * The character offset each line starts at (index 0 is line 1): a line
 * break is LF, CR, FF or a CRLF pair — CSS Syntax Level 3's own set (§4.2
 * "newline"), not only LF. This tokenizer never rewrites line endings up
 * front (§4.3's preprocessing step, skipped so every position stays a
 * plain index into the caller's own bytes), so every line-break form the
 * spec recognises has to be counted here by hand, a CRLF pair as one.
 */
function lineStartOffsets(text: string): number[] {
  const starts = [0]
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '\r') {
      i++
      if (text[i] === '\n') i++
      starts.push(i)
      continue
    }
    if (c === '\n' || c === '\f') {
      i++
      starts.push(i)
      continue
    }
    i++
  }
  return starts
}

/**
The last index in sorted, ascending `starts` whose value is `<= offset`.
 */
function lastAtOrBefore(starts: readonly number[], offset: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid]! <= offset) low = mid
    else high = mid - 1
  }
  return low
}

/**
 * A reusable `offset -> Position` lookup over one fixed `text`: the
 * line-start table is built once, and every query after that is a binary
 * search over it (`O(log lines)`) rather than a fresh linear scan from the
 * start of the string. Built for `expandText()`'s own hot path — one
 * query per output token — where a linear-scan-per-query, correct on its
 * own, made the whole pass quadratic in the stylesheet's size (AC-25).
 * `offset` is a plain string index throughout, so it is already in UTF-16
 * code units — no separate handling for a surrogate pair.
 */
export function createPositionFinder(text: string): (offset: number) => Position {
  const starts = lineStartOffsets(text)
  return (offset) => {
    const line = lastAtOrBefore(starts, offset)
    return { line: line + 1, column: offset - starts[line]! }
  }
}

/**
 * Every diagnostic code is routed through `onUnknown`: under
 * `'ignore'` none is returned at all; otherwise each gets the mode's own
 * severity and, mapped through `css`'s own line/column space, a 1-based
 * `line` and `column` beside the `offset`/`endOffset` `plan()` already gave
 * it. `file` is `options.from`, when the host gave one — omitted, not
 * `undefined`, when it did not.
 */
export function reportDiagnostics(
  diagnostics: readonly Diagnostic[],
  css: string,
  options: DiagnosticReportOptions,
): ExpandedDiagnostic[] {
  const onUnknown = options.onUnknown ?? 'error'
  if (onUnknown === 'ignore') return []
  const severity = onUnknown === 'warn' ? 'warning' : 'error'
  const positionAt = createPositionFinder(css)
  return diagnostics.map((diagnostic) => {
    const position = positionAt(diagnostic.offset)
    return {
      ...diagnostic,
      severity,
      ...(options.from !== undefined && { file: options.from }),
      line: position.line,
      column: position.column + 1,
    }
  })
}
