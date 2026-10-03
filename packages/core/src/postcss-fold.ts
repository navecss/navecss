/**
 * The fold, for the PostCSS adapter: under `'error'`,
 * every diagnostic in one stylesheet becomes one thrown report instead of
 * one throw per directive. Split out of `postcss.ts` to keep that file
 * under the project's file-length lint.
 */
import type { AtRule as PostCSSAtRule } from 'postcss'

import { foldLocated } from './directive/fold.ts'

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
 * The fold's report for `entries` (already in source order): the shared layout, each entry placed
 * at its own PostCSS position.
 */
export function foldMessage(entries: readonly FoldEntry[]): string {
  return foldLocated(
    entries.map((entry, i) => {
      const position = positionOf(entry, i)
      return { text: entry.text, line: position.line, column: position.column }
    }),
  )
}
