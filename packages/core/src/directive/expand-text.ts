import type { Diagnostic } from './diagnostics-types.ts'
import type { ExtendMap } from './resolve.ts'
import type { Position, SourceMap } from './source-map.ts'

/**
 * `expandText(css, options)` reads a stylesheet as CSS Syntax Level 3
 * tokens and blocks, finds every `@nave` at-rule that is an item of the
 * stylesheet or of a block, answers `plan()`'s three facts itself, and
 * splices. Every byte outside a directive's span and the inserted text is
 * unchanged.
 */
import { atKeywordName, isNaveAtKeyword, type Item, readItem } from './block-reader.ts'
import {
  createPositionFinder,
  type ExpandedDiagnostic,
  reportDiagnostics,
} from './expand-text-diagnostics.ts'
import { type AppendPart, buildOutput, type Edit } from './expand-text-output.ts'
import { renderBlock, renderInline } from './expand-text-render.ts'
import { plan } from './plan.ts'
import { type Token, tokenize } from './tokenizer.ts'

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

interface WalkContext {
  readonly isStyleRuleParent: boolean
  readonly isInsideKeyframes: boolean
}

/**
The shared, mutable state one `expandText()` call threads through every recursive block walk.
 */
class Walker {
  readonly css: string
  readonly diagnostics: Diagnostic[] = []
  readonly edits: Edit[] = []
  // Built once per call, not once per query: `positionAt` runs once per
  // output token, and a fresh linear scan on every call made the whole
  // pass quadratic in the stylesheet's size (AC-25). Not private: this
  // project's class-member-order and class-sort lint rules disagree with
  // each other on where a private field goes relative to the surrounding
  // public ones, which a field with no access modifier sidesteps.
  readonly findPosition: (offset: number) => Position
  readonly options: ExpandTextOptions
  readonly tokens: readonly Token[]

  constructor(css: string, options: ExpandTextOptions) {
    this.css = css
    this.tokens = tokenize(css)
    this.options = options
    this.findPosition = createPositionFinder(css)
  }

  positionAt(offset: number): Position {
    return this.findPosition(offset)
  }
}

/**
Not whitespace, not a comment: a candidate item-start token, or the end of a block/input.
 */
function isStructural(token: Token): boolean {
  return token.type !== 'whitespace-token' && token.type !== 'comment'
}

/**
 *
 */
function skipInert(tokens: readonly Token[], i: number, limit: number): number {
  let j = i
  while (j < limit && !isStructural(tokens[j]!)) j++
  return j
}

/**
 *
 */
function repositionDiagnostics(
  diagnostics: readonly Diagnostic[],
  item: Item,
  directiveStart: number,
  directiveEnd: number,
): Diagnostic[] {
  const preludeOffset = item.preludeOffset ?? 0
  return diagnostics.map((d) => {
    if (d.code === 'unknown-atom' || d.code === 'bad-token') {
      return { ...d, offset: preludeOffset + d.offset, endOffset: preludeOffset + d.endOffset }
    }
    return { ...d, offset: directiveStart, endOffset: directiveEnd }
  })
}

interface Frame {
  parts: AppendPart[]
}

interface DirectiveSite {
  readonly item: Item
  readonly context: WalkContext
  readonly hasNestedNode: boolean
  readonly frame: Frame
}

/**
The `@nave` item's own edit and diagnostics: `has-block` when it carries one, plus whatever `plan()` reports.
 */
function processDirective(w: Walker, site: DirectiveSite): void {
  const { item, context, hasNestedNode, frame } = site
  const directiveStart = w.tokens[item.start]!.startIndex
  const directiveEnd = w.tokens[item.end - 1]!.endIndex
  const source = w.positionAt(directiveStart)
  const prelude = w.css.slice(item.preludeOffset ?? 0, item.preludeEndOffset ?? 0)

  const result = plan(
    prelude,
    {
      isStyleRuleParent: context.isStyleRuleParent,
      isInsideKeyframes: context.isInsideKeyframes,
      isFollowingNestedNode: hasNestedNode,
    },
    { extend: w.options.extend },
  )

  const positioned = repositionDiagnostics(result.diagnostics, item, directiveStart, directiveEnd)
  if (item.blockStart !== undefined)
    positioned.push({ code: 'has-block', offset: directiveStart, endOffset: directiveEnd })
  w.diagnostics.push(...positioned)

  const inline = renderInline(result.declarations, result.wrapInAmpersand)
  w.edits.push({
    start: directiveStart,
    end: directiveEnd,
    parts: inline === '' ? [] : [{ text: inline, source }],
  })
  for (const block of result.blocks) frame.parts.push({ text: ` ${renderBlock(block)}`, source })
}

/**
True for a `rule` or `at-rule` item other than `@nave` itself — a nested node, one of the facts `plan()` needs to decide the `& { … }` wrap.
 */
function isNestedNode(tokens: readonly Token[], item: Item): boolean {
  if (item.kind === 'rule') return true
  if (item.kind !== 'at-rule') return false
  return !isNaveAtKeyword(tokens[item.start]!)
}

/**
 *
 */
function isKeyframesName(name: string): boolean {
  return /keyframes$/i.test(name)
}

/**
 * The character position a block's own close sits at: the `}` token's
 * start, or the end of input when it never closes (R5d) — except when the
 * very last token is an unclosed comment, which (having nowhere to end)
 * consumes every byte to EOF: appending there would insert real CSS text
 * INSIDE that comment, where a re-tokenization of the output could never
 * see it as anything but more comment bytes. Placed at the comment's own
 * start instead, so the appended block lands before it, as real syntax.
 */
function closePositionOf(w: Walker, blockEndIndex: number): number {
  const closer = w.tokens[blockEndIndex]
  if (closer) return closer.startIndex
  const last = w.tokens.at(-1)
  if (last?.type === 'comment' && !last.raw.endsWith('*/')) return last.startIndex
  return w.css.length
}

/**
 *
 */
function flushFrame(w: Walker, closeAt: number, frame: Frame): void {
  if (frame.parts.length === 0) return
  w.edits.push({ start: closeAt, end: closeAt, parts: frame.parts })
}

/**
The child context a `rule`/`at-rule` item's own block is walked under.
 */
function childContext(w: Walker, item: Item, context: WalkContext): WalkContext {
  const { isInsideKeyframes } = context
  if (item.kind === 'rule') return { isStyleRuleParent: true, isInsideKeyframes }
  const name = atKeywordName(w.tokens[item.start]!)
  return { isStyleRuleParent: false, isInsideKeyframes: isInsideKeyframes || isKeyframesName(name) }
}

/**
 *
 */
function walkChildBlock(w: Walker, item: Item, context: WalkContext): void {
  if (item.blockStart === undefined || item.blockEnd === undefined) return
  walkBlock(w, {
    start: skipInert(w.tokens, item.blockStart, item.blockEnd),
    limit: item.blockEnd,
    closeAt: closePositionOf(w, item.blockEnd),
    context: childContext(w, item, context),
  })
}

interface BlockBounds {
  readonly start: number
  readonly limit: number
  readonly closeAt: number
  readonly context: WalkContext
}

/**
 * Walks one block's items, in `[bounds.start, bounds.limit)`. `limit` is the
 * index of the enclosing `}` (or `tokens.length` at EOF); `closeAt` is the
 * character offset appended blocks are inserted at (the same `}`'s start,
 * or the end of input).
 */
function walkBlock(w: Walker, bounds: BlockBounds): void {
  const { limit, closeAt, context } = bounds
  const frame: Frame = { parts: [] }
  let hasNestedNode = false
  let i = skipInert(w.tokens, bounds.start, limit)

  while (i < limit) {
    const item = readItem(w.tokens, i, limit)

    if (item.kind === 'at-rule' && isNaveAtKeyword(w.tokens[item.start]!)) {
      processDirective(w, { item, context, hasNestedNode, frame })
    } else if (item.kind === 'rule' || item.kind === 'at-rule') {
      walkChildBlock(w, item, context)
    }

    if (isNestedNode(w.tokens, item)) hasNestedNode = true
    i = skipInert(w.tokens, item.end, limit)
  }

  flushFrame(w, closeAt, frame)
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
    closeAt: css.length,
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
