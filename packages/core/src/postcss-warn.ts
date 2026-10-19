/**
 * Where a `'warn'`-mode problem is reported, split out of `postcss-at-rule.ts` to keep that file
 * under the project's file-length lint. PostCSS carries a warning on `result.messages`, and
 * Turbopack, Next.js's default bundler, reads only the assets and dependencies in them, so a
 * warning raised there is never shown. Turbopack sets `TURBOPACK` in the process that runs
 * PostCSS: under it the problem is printed with `console.warn` instead, which reaches the
 * terminal on webpack and Turbopack alike, and is not also raised as a warning. A tool that runs
 * the plugin itself and reports its warnings turns the printing off (`printWarnings: false`).
 */
import type { AtRule, Result } from 'postcss'

/**
 * Where a warning goes: the directive, the run's result, and whether it may be printed.
 */
export interface WarnTarget {
  readonly atRule: AtRule
  readonly result: Result
  readonly printWarnings: boolean
}

/**
 * The problem `text` at `index` within the directive, as one PostCSS warning, or, under Turbopack
 * when printing is on, as one `console.warn` line framed `file:line:column: ` as the Lightning CSS
 * adapter frames its own.
 */
export function warnDirective(target: WarnTarget, text: string, index: number | undefined): void {
  const { atRule, result, printWarnings } = target
  const at = index === undefined ? {} : { index }
  if (!printWarnings || !process.env.TURBOPACK) {
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
