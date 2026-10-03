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
 * `text` split into its body (every line before a closing `Available: ...` line) and that line, when
 * it ends with one. A text's own lines past the first (a multi-line token it quotes) stay in the body.
 */
function splitAvailable(text: string): { available: string | undefined; body: string } {
  const lines = text.split('\n')
  const last = lines.at(-1)
  if (lines.length > 1 && last?.startsWith('Available: ')) {
    return { body: lines.slice(0, -1).join('\n'), available: last }
  }
  return { body: text, available: undefined }
}

/**
`text` without its leading `@nave: `, which only the first line of a report carries.
 */
function withoutNavePrefix(text: string): string {
  return text.startsWith('@nave: ') ? text.slice(7) : text
}

/**
 * The first problem's own text, then (when there is more than one problem) `N more in this
 * stylesheet:` and one `L:C: <text>` entry per further problem (its own text, `@nave: ` dropped),
 * then `Available:` once, last, if any folded problem lacked a hint. `entries` must already be in
 * source order and hold at least one problem.
 */
export function foldLocated(entries: readonly LocatedText[]): string {
  const parts = entries.map((entry) => ({ ...splitAvailable(entry.text), entry }))
  const [first, ...rest] = parts as [(typeof parts)[number], ...typeof parts]
  const lines = [first.body]
  if (rest.length > 0) {
    lines.push(`${rest.length} more in this stylesheet:`)
    for (const { body, entry } of rest) {
      lines.push(`${entry.line}:${entry.column}: ${withoutNavePrefix(body)}`)
    }
  }
  const available = parts.find((part) => part.available !== undefined)?.available
  if (available) lines.push(available)
  return lines.join('\n')
}
