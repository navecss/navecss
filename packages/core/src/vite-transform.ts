/**
 * One stylesheet through the Vite plugin: expand its directives, report what went wrong, and hand
 * Vite the new text with a source map chained through the one it supplied.
 */
import type { ExtendMap } from './directive/resolve.ts'
import type { SourceMap } from './directive/source-map.ts'
import type { TransformContext, TransformResultLike } from './vite-types.ts'

import { expandText } from './directive/expand-text.ts'
import { decodeIncomingMap } from './directive/source-map.ts'
import { filePathOf } from './vite-css-id.ts'
import { reportOrderWarnings, type WarningMemory } from './vite-order-warnings.ts'
import { reportDiagnostics } from './vite-report.ts'
import { toSourceMap } from './vite-source-map.ts'

export interface TransformInput {
  readonly ctx: TransformContext
  readonly code: string
  readonly id: string
  readonly extend: ExtendMap
  readonly onUnknown: 'warn' | 'error' | 'ignore'
  /**
  Whether the stylesheet source map Vite hands a plugin is worth chaining. In dev it is real only with `css.devSourcemap`; without it, it is an identity map of the processed text, which would pass for the authored file. In a build it is read when `build.sourcemap` is set, but Vite 8.2.1 and 8.3.1 supply an empty one there either way, so a build reports positions as processed; the check stays so that a Vite which does supply one is chained.
   */
  readonly hasStylesheetMaps: boolean
  /**
   * Whether a marker that covers nothing is reported: not under `css.transformer: 'lightningcss'`, where Lightning CSS may have moved a rule's content before this plugin reads it.
   */
  readonly reportStaleMarkers: boolean
  /**
   * What the order warnings already printed in this command, and the command (`build` or `serve`).
   */
  readonly warnings: { readonly command: string; readonly memory: WarningMemory }
}

/**
 * The map Vite supplied for this stylesheet, or `undefined` when it supplied none worth chaining.
 */
function incomingMapOf(input: TransformInput): SourceMap | undefined {
  if (!input.hasStylesheetMaps) return undefined
  const map = input.ctx.getCombinedSourcemap()
  return map.mappings === '' ? undefined : toSourceMap(map)
}

/**
 * Expands `input.code`.
 */
export function transformStylesheet(input: TransformInput): TransformResultLike {
  const file = filePathOf(input.id)
  const inputSourceMap = incomingMapOf(input)
  const result = expandText(input.code, {
    extend: input.extend,
    onUnknown: input.onUnknown,
    from: file,
    inputSourceMap,
    reportStaleMarkers: input.reportStaleMarkers,
  })
  const incoming = inputSourceMap && decodeIncomingMap(inputSourceMap)
  // The order warnings come first: a problem under 'error' ends the stylesheet right after.
  reportOrderWarnings(
    { ctx: input.ctx, id: input.id, file, incoming, warnings: result.warnings },
    input.warnings.memory,
    input.warnings.command,
  )
  reportDiagnostics({
    ctx: input.ctx,
    diagnostics: result.diagnostics,
    extend: input.extend,
    id: input.id,
    file,
    incoming,
    onUnknown: input.onUnknown,
  })
  return { code: result.css, map: result.map }
}
