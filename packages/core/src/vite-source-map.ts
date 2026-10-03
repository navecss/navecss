/**
 * Vite's combined source map for the module being transformed, in the core's own shape, and the
 * position it maps a place in the transformed text back to.
 */
import type { IncomingMap, SourceMap } from './directive/source-map.ts'
import type { IncomingSourceMap, TransformContext } from './vite-types.ts'

import { decodeIncomingMap } from './directive/source-map.ts'

/**
 * Vite's source map in the core's own shape.
 */
export function toSourceMap(map: IncomingSourceMap): SourceMap {
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
 * The decoded combined map of the module `ctx` is transforming, or `undefined` when there is none
 * worth reading.
 */
export function combinedMapOf(ctx: TransformContext): IncomingMap | undefined {
  const map = ctx.getCombinedSourcemap()
  return map.mappings === '' ? undefined : decodeIncomingMap(toSourceMap(map))
}

export interface Place {
  readonly line: number
  readonly column: number
}

/**
 * The 1-based line and column of `offset` in `code`.
 */
function placeIn(code: string, offset: number): Place {
  let line = 1
  let lineStart = 0
  for (
    let index = code.indexOf('\n');
    index !== -1 && index < offset;
    index = code.indexOf('\n', index + 1)
  ) {
    line += 1
    lineStart = index + 1
  }
  return { line, column: offset - lineStart + 1 }
}

/**
 * Where `offset` in `code` sits in the authored file: mapped through `map` when it reaches that
 * place, and otherwise as the transformed text has it.
 */
export function authoredPlace(code: string, offset: number, map: IncomingMap | undefined): Place {
  const generated = placeIn(code, offset)
  const origin = map?.originalPositionFor({ line: generated.line, column: generated.column - 1 })
  return origin ? { line: origin.line, column: origin.column + 1 } : generated
}
