/**
 * The fold: under `'error'`, every diagnostic in one stylesheet becomes one report instead of one
 * throw per directive. Shared by every host (PostCSS, Vite) so the layout is the core's own: the
 * host supplies each problem's text and its position in the file it reports against, and prints
 * the result inside its own frame.
 */

export interface LocatedText {
  /**
  One problem's own text: its first line, then (for an unhinted unknown atom) the `Available:` line.
   */
  readonly text: string
  readonly line: number
  readonly column: number
}

/**
The first line of `text`.
 */
function firstLine(text: string): string {
  return text.split('\n', 1)[0]!
}

/**
`text` without its leading `@nave: `, which only the first line of a report carries.
 */
function withoutNavePrefix(text: string): string {
  return text.startsWith('@nave: ') ? text.slice(7) : text
}

/**
The "Available: ..." line from whichever entry's text carries one — every entry that has one carries the identical vocabulary.
 */
function sharedAvailableLine(entries: readonly LocatedText[]): string | undefined {
  for (const entry of entries) {
    const lines = entry.text.split('\n')
    if (lines.length > 1) return lines[1]
  }
  return undefined
}

/**
 * The first problem's own single line, then (when there is more than one problem) `N more in
 * this stylesheet:` and one `L:C: <text>` line per further problem (its own text, `@nave: `
 * dropped), then `Available:` once, last, if any folded problem lacked a hint. `entries` must
 * already be in source order and hold at least one problem.
 */
export function foldLocated(entries: readonly LocatedText[]): string {
  const [first, ...rest] = entries as [LocatedText, ...LocatedText[]]
  const lines = [firstLine(first.text)]
  if (rest.length > 0) {
    lines.push(`${rest.length} more in this stylesheet:`)
    for (const entry of rest) {
      lines.push(`${entry.line}:${entry.column}: ${withoutNavePrefix(firstLine(entry.text))}`)
    }
  }
  const available = sharedAvailableLine(entries)
  if (available) lines.push(available)
  return lines.join('\n')
}
