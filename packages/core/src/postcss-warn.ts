/**
 * The one place the PostCSS host reports a warning: `node.warn()`, except under Next.js's
 * Turbopack, which drops every PostCSS warning. There (detected by `process.env.TURBOPACK` being
 * set) the text is printed with `console.warn` behind the same `file:line:column: ` frame the
 * Lightning CSS adapter prints, and `node.warn()` is not called as well. A tool that runs the
 * plugin itself and reports its warnings turns the printing off (`printWarnings: false`): every
 * warning is then raised, whatever `TURBOPACK` says.
 */
import type { Node, Result } from 'postcss'

import { framedText } from './directive/report-text.ts'

/**
 * Whether the host is Next.js's Turbopack.
 */
function isTurbopack(): boolean {
  return (process.env.TURBOPACK ?? '') !== ''
}

/**
 * `text` behind the file, line and column `node` (or the character `index` of it) is authored at.
 * The place is the one the input's source map names when there is one, else `result.opts.from`
 * and the node's own position.
 */
function framedAtNode(node: Node, result: Result, text: string, index: number | undefined): string {
  const input = node.source?.input
  if (input === undefined) return text
  const { line, column } = node.rangeBy(index === undefined ? {} : { index }).start
  const origin = input.origin(line, column)
  if (origin !== false)
    return framedText(origin.file ?? origin.url, origin.line, origin.column, text)
  return framedText(result.opts.from ?? input.file ?? input.id ?? '', line, column, text)
}

/**
 * Where a warning is reported: the character of the node it sits at, when it sits at one, and
 * whether it may be printed.
 */
export interface WarnPlace {
  readonly index?: number | undefined
  readonly printWarnings?: boolean | undefined
}

/**
 * Reports `text` on `node`, at the character `index` of it when given.
 */
export function reportWarning(
  node: Node,
  result: Result,
  text: string,
  place: WarnPlace = {},
): void {
  const { index } = place
  if (place.printWarnings !== false && isTurbopack()) {
    console.warn(framedAtNode(node, result, text, index))
    return
  }
  node.warn(result, text, index === undefined ? {} : { index })
}
