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
 * A line terminator as ECMAScript and source maps count one: `\r\n` is a single break.
 */
const LINE_TERMINATOR = /\r\n|[\n\r\u{2028}\u{2029}]/gu

/**
 * The offset each line of `code` starts at.
 */
function lineStartsOf(code: string): number[] {
  const starts = [0]
  for (const match of code.matchAll(LINE_TERMINATOR)) starts.push(match.index + match[0].length)
  return starts
}

/**
 * The index of the last entry of `starts` that is at or before `offset`.
 */
function lineIndexOf(starts: readonly number[], offset: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (starts[middle]! <= offset) low = middle
    else high = middle - 1
  }
  return low
}

/**
 * Where an offset in `code` sits in the authored file: mapped through `map` when it reaches that
 * place, and otherwise as the transformed text has it. The line table is built once, when the
 * first offset is asked for, so placing every problem of a module costs one pass over its text.
 */
export function placerFor(code: string, map: IncomingMap | undefined): (offset: number) => Place {
  let starts: number[] | undefined
  return (offset) => {
    starts ??= lineStartsOf(code)
    const index = lineIndexOf(starts, offset)
    const generated = { line: index + 1, column: offset - starts[index]! + 1 }
    const origin = map?.originalPositionFor({ line: generated.line, column: generated.column - 1 })
    return origin ? { line: origin.line, column: origin.column + 1 } : generated
  }
}
