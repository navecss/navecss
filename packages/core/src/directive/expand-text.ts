import type { Diagnostic } from './diagnostics-types.ts'
import type { ExtendMap } from './resolve.ts'
import type { Position, SourceMap } from './source-map.ts'

/**
 * R3: `expandText(css, options)` reads a stylesheet as CSS Syntax Level 3
 * tokens and blocks, finds every `@nave` at-rule that is an item of the
 * stylesheet or of a block, answers `plan()`'s three facts itself (R2), and
 * splices. Every byte outside a directive's span and the inserted text is
 * unchanged.
 */
import { atKeywordName, isNaveAtKeyword, type Item, readItem } from './block-reader.ts'
import { type AppendPart, buildOutput, type Edit } from './expand-text-output.ts'
import { type AnchoredBlock, type Declaration, plan } from './plan.ts'
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
  readonly diagnostics: readonly Diagnostic[]
}

interface WalkContext {
  readonly isStyleRuleParent: boolean
  readonly isInsideKeyframes: boolean
}

/**
1-based line, 0-based column (source-map convention) for `offset` in `text`.
 */
function inputPositionAt(text: string, offset: number): Position {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < offset; i++) {
    if (text[i] !== '\n') {
    	continue;
    }

    line++
    lineStart = i + 1
  }
  return { line, column: offset - lineStart }
}

/**
The shared, mutable state one `expandText()` call threads through every recursive block walk.
 */
class Walker {
  readonly css: string
  readonly diagnostics: Diagnostic[] = []
  readonly edits: Edit[] = []
  readonly options: ExpandTextOptions
  readonly tokens: readonly Token[]

  constructor(css: string, options: ExpandTextOptions) {
    this.css = css
    this.tokens = tokenize(css)
    this.options = options
  }

  positionAt(offset: number): Position {
    return inputPositionAt(this.css, offset)
  }
}

/**
 *
 */
function renderDeclarations(decls: readonly Declaration[]): string {
  return decls.map((d) => `${d.prop}: ${d.value}`).join('; ')
}

/**
 *
 */
function renderRule(selector: string, decls: readonly Declaration[]): string {
  return `${selector} { ${renderDeclarations(decls)} }`
}

/**
 *
 */
function renderBlock(block: AnchoredBlock): string {
  if (block.kind === 'pseudo') return renderRule(block.selector, block.declarations)
  const inner: string[] = []
  if (block.declarations.length > 0) inner.push(renderRule('&', block.declarations))
  for (const pseudo of block.pseudos) inner.push(renderRule(pseudo.selector, pseudo.declarations))
  return `@${block.kind} ${block.condition} { ${inner.join(' ')} }`
}

/**
 *
 */
function renderInline(declarations: readonly Declaration[], isWrapped: boolean): string {
  if (declarations.length === 0) return ''
  if (isWrapped) return renderRule('&', declarations)
  return `${renderDeclarations(declarations)};`
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
    { isStyleRuleParent: context.isStyleRuleParent, isInsideKeyframes: context.isInsideKeyframes, isFollowingNestedNode: hasNestedNode },
    { extend: w.options.extend },
  )

  const positioned = repositionDiagnostics(result.diagnostics, item, directiveStart, directiveEnd)
  if (item.blockStart !== undefined) positioned.push({ code: 'has-block', offset: directiveStart, endOffset: directiveEnd })
  w.diagnostics.push(...positioned)

  const inline = renderInline(result.declarations, result.wrapInAmpersand)
  w.edits.push({ start: directiveStart, end: directiveEnd, parts: inline === '' ? [] : [{ text: inline, source }] })
  for (const block of result.blocks) frame.parts.push({ text: ` ${renderBlock(block)}`, source })
}

/**
True for a `rule` or `at-rule` item other than `@nave` itself — a nested node (R2's context bullet).
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
The character position a block's own close sits at: the `}` token's start, or the end of input when it never closes (R5d).
 */
function closePositionOf(w: Walker, blockEndIndex: number): number {
  return w.tokens[blockEndIndex]?.startIndex ?? w.css.length
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
  if (item.kind === 'rule') return { isStyleRuleParent: true, isInsideKeyframes: context.isInsideKeyframes }
  const name = atKeywordName(w.tokens[item.start]!)
  return { isStyleRuleParent: false, isInsideKeyframes: context.isInsideKeyframes || isKeyframesName(name) }
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
 * blocks (R3, R4), finds every `@nave` at-rule that is an item of the
 * stylesheet or of a block, answers `plan()`'s three facts itself, and
 * splices. Returns a version-3 source map, chained through an incoming one
 * when `options.inputSourceMap` is given (R7).
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
  return { css: outputCss, map, diagnostics: w.diagnostics }
}
