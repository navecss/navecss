/**
 * R7: builds `expandText()`'s final CSS and its source map together, from
 * the edit list its block walk produced. Split out of `expand-text.ts` to
 * keep that file under the project's file-length lint.
 */
import { decodeIncomingMap, type IncomingMap, MappingsBuilder, type Position, type SourceMap } from './source-map.ts'
import { type Token, tokenize } from './tokenizer.ts'

/**
One inserted run of text, and the single input position every token inside it maps to (R7).
 */
export interface AppendPart {
  readonly text: string
  readonly source: Position
}

export interface Edit {
  readonly start: number
  readonly end: number
  readonly parts: readonly AppendPart[]
}

/**
Chains `position` through the incoming map, if one was given; otherwise `position` is already in terms of the one source `expandText()` reports.
 */
function toOriginal(position: Position, incoming: IncomingMap | undefined): Position {
  if (!incoming) return position
  const original = incoming.originalPositionFor(position)
  return original ? { line: original.line, column: original.column } : position
}

interface MappedRange {
  readonly text: string
  readonly rangeStart: number
  readonly rangeEnd: number
  readonly tokensInRange: readonly Token[]
}

interface MappedRangeContext {
  readonly builder: MappingsBuilder
  readonly output: string[]
  readonly incoming: IncomingMap | undefined
}

/**
Appends one range to `ctx.output`/`ctx.builder`, marking one segment per token start, each token's own position (via `sourceForToken`) chained through the incoming map.
 */
function appendMappedRange(ctx: MappedRangeContext, range: MappedRange, sourceForToken: (token: Token) => Position): void {
  const { builder, output, incoming } = ctx
  const { text, rangeStart, rangeEnd, tokensInRange } = range
  let cursor = rangeStart
  for (const token of tokensInRange) {
    const before = text.slice(cursor, token.startIndex)
    output.push(before)
    builder.advance(before)
    builder.mark(toOriginal(sourceForToken(token), incoming))
    const body = text.slice(token.startIndex, token.endIndex)
    output.push(body)
    builder.advance(body)
    cursor = token.endIndex
  }
  const rest = text.slice(cursor, rangeEnd)
  output.push(rest)
  builder.advance(rest)
}

/**
Every token whose start falls inside `[start, end)`.
 */
function tokensBetween(tokens: readonly Token[], start: number, end: number): Token[] {
  return tokens.filter((t) => t.startIndex >= start && t.startIndex < end)
}

interface GapInput {
  readonly css: string
  readonly tokens: readonly Token[]
  readonly start: number
  readonly end: number
  readonly positionAt: (offset: number) => Position
}

/**
An untouched slice of the original css: every token in it maps to its own input position.
 */
function appendGap(ctx: MappedRangeContext, gap: GapInput): void {
  appendMappedRange(
    ctx,
    { text: gap.css, rangeStart: gap.start, rangeEnd: gap.end, tokensInRange: tokensBetween(gap.tokens, gap.start, gap.end) },
    (t) => gap.positionAt(t.startIndex),
  )
}

/**
One edit's inserted parts: every token in a part maps to that part's own recorded source position.
 */
function appendEditParts(ctx: MappedRangeContext, edit: Edit): void {
  for (const part of edit.parts) {
    const partTokens = tokenize(part.text)
    appendMappedRange(
      ctx,
      { text: part.text, rangeStart: 0, rangeEnd: part.text.length, tokensInRange: partTokens },
      () => part.source,
    )
  }
}

export interface BuildOutputInput {
  readonly css: string
  readonly tokens: readonly Token[]
  readonly edits: readonly Edit[]
  readonly from: string | undefined
  readonly inputSourceMap: SourceMap | undefined
  readonly positionAt: (offset: number) => Position
}

/**
Builds the final CSS and its source map together: gaps map each of their own tokens to themselves, and each edit's parts map to their own recorded source position.
 */
export function buildOutput(input: BuildOutputInput): { css: string; map: string } {
  const incoming = input.inputSourceMap ? decodeIncomingMap(input.inputSourceMap) : undefined
  const sorted = [...input.edits].toSorted((a, b) => a.start - b.start || a.end - b.end)
  const ctx: MappedRangeContext = { builder: new MappingsBuilder(), output: [], incoming }
  let cursor = 0

  for (const edit of sorted) {
    appendGap(ctx, { css: input.css, tokens: input.tokens, start: cursor, end: edit.start, positionAt: input.positionAt })
    appendEditParts(ctx, edit)
    cursor = Math.max(cursor, edit.end)
  }
  appendGap(ctx, { css: input.css, tokens: input.tokens, start: cursor, end: input.css.length, positionAt: input.positionAt })

  const sources = incoming ? [...incoming.sources] : [input.from ?? '<input>']
  const map: SourceMap = { version: 3, sources, names: [], mappings: ctx.builder.toMappings() }
  return { css: ctx.output.join(''), map: JSON.stringify(map) }
}
