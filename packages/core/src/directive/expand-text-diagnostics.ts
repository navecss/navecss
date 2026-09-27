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
 * R6: one of `expandText()`'s returned diagnostics, positioned in the
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
 * 1-based line, 0-based column (source-map convention) for `offset` in
 * `text`. A line break is LF, CR, FF or a CRLF pair — CSS Syntax Level 3's
 * own set (§4.2 "newline"), not only LF: this tokenizer never rewrites line
 * endings up front (§4.3's preprocessing step, skipped so every position
 * stays a plain index into the caller's own bytes), so every line-break form
 * the spec recognises has to be counted here by hand, a CRLF pair as one.
 * `offset` is a plain string index throughout, so it is already in UTF-16
 * code units — no separate handling for a surrogate pair.
 */
export function inputPositionAt(text: string, offset: number): Position {
  let line = 1
  let lineStart = 0
  let i = 0
  while (i < offset) {
    const c = text[i]
    if (c === '\r') {
      i++
      if (text[i] === '\n') i++
      line++
      lineStart = i
      continue
    }
    if (c === '\n' || c === '\f') {
      i++
      line++
      lineStart = i
      continue
    }
    i++
  }
  return { line, column: offset - lineStart }
}

/**
 * Every code in R6's closed set is routed through `onUnknown`: under
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
  return diagnostics.map((diagnostic) => {
    const position = inputPositionAt(css, diagnostic.offset)
    return {
      ...diagnostic,
      severity,
      ...(options.from !== undefined && { file: options.from }),
      line: position.line,
      column: position.column + 1,
    }
  })
}
