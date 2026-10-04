/**
 * The text a host prints for the diagnostics of one stylesheet whose positions are already its
 * own file's: each problem's core text behind a `file:line:column: ` frame, and under `'error'`
 * the whole stylesheet folded into one report positioned at its first problem. Shared by the hosts
 * that read the stylesheet as the author wrote it (the Lightning CSS adapter, `navecss-core
 * expand`); a host that maps positions through a source map (Vite) frames its own.
 */
import type { ExpandedDiagnostic } from './expand-text-diagnostics.ts'
import type { ExtendMap } from './resolve.ts'

import { formatDiagnostic } from './diagnostics-format.ts'
import { foldLocated } from './fold.ts'

/**
 * `diagnostics` in source order.
 */
function inSourceOrder(diagnostics: readonly ExpandedDiagnostic[]): ExpandedDiagnostic[] {
  return diagnostics.toSorted((a, b) => a.offset - b.offset)
}

/**
 * One line of text per problem, each `file:line:column: <the core's text>`, for a host that warns
 * per diagnostic.
 */
export function warningTexts(
  diagnostics: readonly ExpandedDiagnostic[],
  file: string,
  extend: ExtendMap,
): string[] {
  return inSourceOrder(diagnostics).map(
    (diagnostic) =>
      `${file}:${diagnostic.line}:${diagnostic.column}: ${formatDiagnostic(diagnostic, { extend })}`,
  )
}

/**
 * Every problem in one stylesheet as one report: the first problem's own text behind its
 * `file:line:column: ` frame, then `N more in this stylesheet:` and one line for each other.
 * `undefined` when there is no problem.
 */
export function foldedText(
  diagnostics: readonly ExpandedDiagnostic[],
  file: string,
  extend: ExtendMap,
): string | undefined {
  const ordered = inSourceOrder(diagnostics)
  const first = ordered[0]
  if (first === undefined) return undefined
  const located = ordered.map((diagnostic) => ({
    text: formatDiagnostic(diagnostic, { extend }),
    line: diagnostic.line,
    column: diagnostic.column,
  }))
  return `${file}:${first.line}:${first.column}: ${foldLocated(located)}`
}
