/**
 * Where a `'warn'`-mode problem is reported, split out of `postcss-at-rule.ts` to keep that file
 * under the project's file-length lint. PostCSS carries a warning on `result.messages`, and
 * Turbopack, Next.js's default bundler, reads only the assets and dependencies in them, so a
 * warning raised there is never shown. Turbopack sets `TURBOPACK` in the process that runs
 * PostCSS: under it the problem is printed with `console.warn` instead, which reaches the
 * terminal on webpack and Turbopack alike, and is not also raised as a warning.
 */
import type { AtRule, Result } from 'postcss'

/**
 * The problem `text` at `index` within `atRule`, as one PostCSS warning, or, under Turbopack, as
 * one `console.warn` line framed `file:line:column: ` as the Lightning CSS adapter frames its own.
 */
export function warnDirective(
  atRule: AtRule,
  result: Result,
  text: string,
  index: number | undefined,
): void {
  const at = index === undefined ? {} : { index }
  if (!process.env.TURBOPACK) {
    atRule.warn(result, text, at)
    return
  }
  if (!atRule.source) {
    console.warn(text)
    return
  }
  const { column, line } = atRule.positionBy(at)
  console.warn(`${atRule.source.input.from}:${line}:${column}: ${text}`)
}
