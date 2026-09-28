import type { ExtendMap } from './resolve.ts'
import type { SourceMap } from './source-map.ts'

/**
 * `expandText(css, options)` reads a stylesheet as CSS Syntax Level 3
 * tokens and blocks, finds every `@nave` at-rule that is an item of the
 * stylesheet or of a block, answers `plan()`'s three facts itself, and
 * splices. Every byte outside a directive's span and the inserted text is
 * unchanged.
 */
import { type ExpandedDiagnostic, reportDiagnostics } from './expand-text-diagnostics.ts'
import { buildOutput } from './expand-text-output.ts'
import { walkBlock, Walker } from './expand-text-walk.ts'

export interface ExpandTextOptions {
  readonly extend?: ExtendMap | undefined
  readonly onUnknown?: 'warn' | 'error' | 'ignore'
  readonly from?: string | undefined
  readonly inputSourceMap?: SourceMap | undefined
}

export interface ExpandTextResult {
  readonly css: string
  readonly map: string
  readonly diagnostics: readonly ExpandedDiagnostic[]
}

/**
 * `expandText(css, options)`. Reads `css` as CSS Syntax Level 3 tokens and
 * blocks, finds every `@nave` at-rule that is an item of the
 * stylesheet or of a block, answers `plan()`'s three facts itself, and
 * splices. Returns a version-3 source map, chained through an incoming one
 * when `options.inputSourceMap` is given.
 */
export function expandText(css: string, options: ExpandTextOptions = {}): ExpandTextResult {
  const w = new Walker(css, options)
  walkBlock(w, {
    start: 0,
    limit: w.tokens.length,
    context: { isStyleRuleParent: false, isInsideKeyframes: false },
  })
  const { css: outputCss, map } = buildOutput({
    css: w.css,
    tokens: w.tokens,
    edits: w.edits,
    from: options.from,
    inputSourceMap: options.inputSourceMap,
    positionAt: (offset) => w.positionAt(offset),
  })
  return { css: outputCss, map, diagnostics: reportDiagnostics(w.diagnostics, css, options) }
}
