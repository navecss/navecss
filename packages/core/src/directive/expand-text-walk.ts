/**
 * `expandText()`'s own block walk and `Walker` state, split out of
 * `expand-text.ts` to keep that file under the project's file-length lint.
 */
import type { Diagnostic } from './diagnostics-types.ts'
import type { AppendPart, Edit } from './expand-text-output.ts'
import type { ExpandTextOptions } from './expand-text.ts'
import type { Position } from './source-map.ts'

import {
  atKeywordName,
  isNaveAtKeyword,
  type Item,
  matchBrackets,
  readItem,
} from './block-reader.ts'
import { createPositionFinder } from './expand-text-diagnostics.ts'
import { closeInfoFor, type EofClose } from './expand-text-eof-close.ts'
import { renderBlock, renderInline } from './expand-text-render.ts'
import { plan } from './plan.ts'
import { type Token, tokenize } from './tokenizer.ts'

export interface WalkContext {
  readonly isStyleRuleParent: boolean
  readonly isInsideKeyframes: boolean
}

/**
The shared, mutable state one `expandText()` call threads through every block frame its walk visits.
 */
export class Walker {
  readonly closerFor: Int32Array
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
    this.closerFor = matchBrackets(this.tokens)
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
 *
 */
function flushFrame(w: Walker, close: EofClose, frame: Frame): void {
  if (frame.parts.length === 0) return
  const parts =
    close.prefix === ''
      ? frame.parts
      : [{ text: close.prefix, source: w.positionAt(close.position) }, ...frame.parts]
  w.edits.push({ start: close.position, end: close.position, parts })
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

export interface BlockBounds {
  readonly start: number
  readonly limit: number
  readonly context: WalkContext
}

/**
One block's own walk, resumable: `i` and `hasNestedNode` are mutated as items are consumed, so a child block can be walked to completion and this one picked back up right where it left off.
 */
interface WalkFrame {
  i: number
  hasNestedNode: boolean
  readonly limit: number
  readonly close: EofClose
  readonly context: WalkContext
  readonly frame: Frame
}

/**
 *
 */
function toWalkFrame(w: Walker, bounds: BlockBounds): WalkFrame {
  return {
    i: skipInert(w.tokens, bounds.start, bounds.limit),
    hasNestedNode: false,
    limit: bounds.limit,
    close: closeInfoFor(w, bounds.start, bounds.limit),
    context: bounds.context,
    frame: { parts: [] },
  }
}

/**
`item`'s own `{}` content as a new frame to walk, if it has one — pushed onto the work stack rather than recursed into, so nesting depth never grows the JS call stack (deeply nested CSS is otherwise a stack overflow, not a parse error).
 */
function childFrameFor(w: Walker, item: Item, context: WalkContext): WalkFrame | undefined {
  if (item.blockStart === undefined || item.blockEnd === undefined) return undefined
  return toWalkFrame(w, {
    start: item.blockStart,
    limit: item.blockEnd,
    context: childContext(w, item, context),
  })
}

/**
 * Walks one block's items, in `[bounds.start, bounds.limit)`, with an
 * explicit stack standing in for the call stack a recursive walk would
 * otherwise use one frame of per level of nesting: a frame's child is
 * pushed and, being now the top of the stack, is walked to completion
 * before this frame's own next item is reached, exactly as a recursive
 * call would order it — but the stack lives on the heap, not the VM's own
 * call stack, so nesting depth never risks overflowing it. `limit` is the
 * index of the enclosing `}` (or `tokens.length` at EOF).
 */
export function walkBlock(w: Walker, bounds: BlockBounds): void {
  const stack: WalkFrame[] = [toWalkFrame(w, bounds)]

  while (stack.length > 0) {
    const top = stack.at(-1)!
    if (top.i >= top.limit) {
      flushFrame(w, top.close, top.frame)
      stack.pop()
      continue
    }

    const item = readItem(w.tokens, top.i, top.limit, w.closerFor)
    top.i = skipInert(w.tokens, item.end, top.limit)

    if (item.kind === 'at-rule' && isNaveAtKeyword(w.tokens[item.start]!)) {
      processDirective(w, {
        item,
        context: top.context,
        hasNestedNode: top.hasNestedNode,
        frame: top.frame,
      })
    } else if (item.kind === 'rule' || item.kind === 'at-rule') {
      const child = childFrameFor(w, item, top.context)
      if (child) stack.push(child)
    }

    if (isNestedNode(w.tokens, item)) top.hasNestedNode = true
  }
}
