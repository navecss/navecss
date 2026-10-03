/**
 * One stylesheet through the Vite plugin: expand its directives, report what went wrong, and hand
 * Vite the new text with a source map chained through the one it supplied.
 */
import type { ExtendMap } from './directive/resolve.ts'
import type { SourceMap } from './directive/source-map.ts'
import type { IncomingSourceMap, TransformContext, TransformResultLike } from './vite-types.ts'

import { expandText } from './directive/expand-text.ts'
import { decodeIncomingMap } from './directive/source-map.ts'
import { filePathOf } from './vite-css-id.ts'
import { reportDiagnostics } from './vite-report.ts'

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
}

/**
 * Vite's source map in the core's own shape.
 */
function toSourceMap(map: IncomingSourceMap): SourceMap {
  return {
    version: 3,
    sources: map.sources,
    names: map.names ?? [],
    mappings: map.mappings,
    ...(map.sourceRoot !== undefined && { sourceRoot: map.sourceRoot }),
    ...(map.sourcesContent !== undefined && { sourcesContent: map.sourcesContent }),
  }
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
  })
  reportDiagnostics({
    ctx: input.ctx,
    diagnostics: result.diagnostics,
    extend: input.extend,
    id: input.id,
    file,
    incoming: inputSourceMap && decodeIncomingMap(inputSourceMap),
    onUnknown: input.onUnknown,
  })
  return { code: result.css, map: result.map }
}
