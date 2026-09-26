/**
 * R6's fold (round-3 decision 2), for the PostCSS adapter: under `'error'`,
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
    for (const entry of rest) {
      const position = entry.atRule.positionBy(
        entry.index === undefined ? {} : { index: entry.index },
      )
      lines.push(`${position.line}:${position.column}: ${withoutNavePrefix(firstLine(entry.text))}`)
    }
  }
  const available = sharedAvailableLine(entries)
  if (available) lines.push(available)
  return lines.join('\n')
}
