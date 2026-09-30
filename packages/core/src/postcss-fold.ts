/**
 * The fold, for the PostCSS adapter: under `'error'`,
 * every diagnostic in one stylesheet becomes one thrown report instead of
 * one throw per directive. Split out of `postcss.ts` to keep that file
 * under the project's file-length lint.
 */
import type { AtRule as PostCSSAtRule } from 'postcss'

export interface FoldEntry {
  readonly atRule: PostCSSAtRule
  readonly text: string
  readonly index: number | undefined
}

/**
 * `entry`'s own position, the same way `OnceExit` positions the throw
 * itself — except when `entry.atRule` has no `source` at all (an at-rule
 * an earlier plugin appended programmatically, never parsed), where
 * `positionBy` itself throws (it reads `this.source.input`). There is no
 * real position to report then, so `fallbackLine` — the entry's own index,
 * passed in by the caller — stands in: enough to sort without crashing,
 * and to keep a sourceless entry's relative order stable against the rest.
 */
function positionOf(entry: FoldEntry, fallbackLine: number): { column: number; line: number } {
  if (!entry.atRule.source) return { column: 0, line: fallbackLine }
  return entry.atRule.positionBy(entry.index === undefined ? {} : { index: entry.index })
}

/**
 * `entries`, in source order (line, then column): `fold.push()` happens in
 * whatever order the diagnostics were produced in, which is not always
 * source order — a directive with more than one problem in its own prelude
 * can otherwise report a LATER one as "the first problem" (AC-16 says the
 * fold covers every directive, not that it covers them in the order they
 * happened to be visited).
 */
export function sortFoldBySourceOrder(entries: readonly FoldEntry[]): FoldEntry[] {
  return entries
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .toSorted((a, b) => {
      const pa = positionOf(a.entry, a.originalIndex)
      const pb = positionOf(b.entry, b.originalIndex)
      return pa.line - pb.line || pa.column - pb.column
    })
    .map(({ entry }) => entry)
}

/**
The first line of `text`.
 */
function firstLine(text: string): string {
  return text.split('\n', 1)[0]!
}

/**
 *
 */
function withoutNavePrefix(text: string): string {
  return text.startsWith('@nave: ') ? text.slice(7) : text
}

/**
The "Available: ..." line from whichever entry's text carries one — every entry that has one carries the identical vocabulary.
 */
function sharedAvailableLine(entries: readonly FoldEntry[]): string | undefined {
  for (const entry of entries) {
    const lines = entry.text.split('\n')
    if (lines.length > 1) return lines[1]
  }
  return undefined
}

/**
 * The first problem's own single line, then (when there is more than one
 * problem) `N more in this stylesheet:` and one `L:C: <text>` line per
 * further problem (its own text, `@nave: ` dropped), then `Available:`
 * once, last, if any folded problem lacked a hint.
 */
export function foldMessage(entries: readonly FoldEntry[]): string {
  const [first, ...rest] = entries as [FoldEntry, ...FoldEntry[]]
  const lines = [firstLine(first.text)]
  if (rest.length > 0) {
    lines.push(`${rest.length} more in this stylesheet:`)
    for (const [i, entry] of rest.entries()) {
      const position = positionOf(entry, i + 1)
      lines.push(`${position.line}:${position.column}: ${withoutNavePrefix(firstLine(entry.text))}`)
    }
  }
  const available = sharedAvailableLine(entries)
  if (available) lines.push(available)
  return lines.join('\n')
}
