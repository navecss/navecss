/**
 * `expandText()`'s own block walk and `Walker` state, split out of
 * `expand-text.ts` to keep that file under the project's file-length lint.
 */
import type { Diagnostic } from './diagnostics-types.ts'
import type { AppendPart, Edit } from './expand-text-output.ts'
import type { ExpandTextOptions } from './expand-text.ts'
import type { Position } from './source-map.ts'

import { isNaveAtKeyword, type Item, matchBrackets } from './block-reader.ts'
import { applyRuleFrame, repositionDiagnostics } from './expand-text-apply.ts'
import { childContext, type WalkContext } from './expand-text-context.ts'
import { createPositionFinder } from './expand-text-diagnostics.ts'
import { closeInfoFor } from './expand-text-eof-close.ts'
import { readBlockItems, readBlockModel } from './expand-text-model.ts'
import { plan } from './plan.ts'
import { type Token, tokenize } from './tokenizer.ts'

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
  // pass quadratic in the stylesheet's size. Not private: this
  // project's class-member-order and class-sort lint rules disagree with
  // each other on where a private field goes relative to the surrounding
  // public ones, which a field with no access modifier sidesteps.
  // How far back an EOF-closing frame may look for its own unmatched
  // brackets/declaration: shrinks to a frame's own start every time that
  // frame writes its own EOF closers, so an ancestor frame further out
  // never rediscovers — and re-closes — the same inner construct. Starts
  // at `tokens.length`, unbounded, since nothing has closed anything yet.
  eofScanLimit: number
  readonly findPosition: (offset: number) => Position
  readonly options: ExpandTextOptions
  readonly tokens: readonly Token[]

  constructor(css: string, options: ExpandTextOptions) {
    this.css = css
    this.tokens = tokenize(css)
    this.closerFor = matchBrackets(this.tokens)
    this.options = options
    this.findPosition = createPositionFinder(css)
    this.eofScanLimit = this.tokens.length
  }

  positionAt(offset: number): Position {
    return this.findPosition(offset)
  }
}

/**
 * Marks a refused-parent diagnostic as sitting in a group rule nested in a style rule, which is
 * what makes its text name the `& { @nave ...; }` workaround.
 */
function markNestedGroup(diagnostics: Diagnostic[]): void {
  for (const [i, d] of diagnostics.entries()) {
    if (d.code === 'bad-parent') diagnostics[i] = { ...d, detail: 'nested-group' }
  }
}

interface Frame {
  parts: AppendPart[]
}

/**
The `@nave` item's own edit and diagnostics where it sits outside a style rule: the problems `plan()` reports for it, and `has-block` when it carries one. A directive in a style rule is expanded with its rule (`applyRuleFrame`).
 */
function processRefusedDirective(w: Walker, item: Item, context: WalkContext): void {
  const directiveStart = w.tokens[item.start]!.startIndex
  const directiveEnd = w.tokens[item.end - 1]!.endIndex
  const prelude = w.css.slice(item.preludeOffset ?? 0, item.preludeEndOffset ?? 0)

  const result = plan(
    prelude,
    { isStyleRuleParent: false, isInsideKeyframes: context.isInsideKeyframes },
    { extend: w.options.extend },
  )

  const positioned = repositionDiagnostics(result.diagnostics, item, {
    start: directiveStart,
    end: directiveEnd,
  })
  if (context.isWorkaroundGroup) markNestedGroup(positioned)
  if (item.blockStart !== undefined)
    positioned.push({ code: 'has-block', offset: directiveStart, endOffset: directiveEnd })
  w.diagnostics.push(...positioned)
  w.edits.push({ start: directiveStart, end: directiveEnd, parts: [] })
}

/**
 * Computed here, at pop time, rather than when the frame was opened: only
 * a frame with something to append needs its own EOF closers at all, and
 * only at this point does `w.eofScanLimit` reflect what every frame nested
 * inside this one already closed for itself.
 */
function flushFrame(w: Walker, frameStart: number, blockEndIndex: number, frame: Frame): void {
  if (frame.parts.length === 0) return
  const close = closeInfoFor(w, frameStart, blockEndIndex, w.eofScanLimit)
  // A real closer (not the EOF fallback) needs no bound update: this frame
  // closed cleanly, so it never entered the still-open chain at all.
  if (w.tokens[blockEndIndex] === undefined) w.eofScanLimit = frameStart
  const parts =
    close.prefix === ''
      ? frame.parts
      : [{ text: close.prefix, source: w.positionAt(close.position) }, ...frame.parts]
  w.edits.push({ start: close.position, end: close.position, parts })
}

export interface BlockBounds {
  readonly start: number
  readonly limit: number
  readonly context: WalkContext
}

/**
One block's own walk, resumable: `next` is advanced as items are consumed, so a child block can be walked to completion and this one picked back up right where it left off.
 */
interface WalkFrame {
  next: number
  readonly items: readonly Item[]
  readonly limit: number
  readonly start: number
  readonly context: WalkContext
  readonly frame: Frame
}

/**
Whether `item` is a `@nave` directive.
 */
function isDirective(w: Walker, item: Item): boolean {
  return item.kind === 'at-rule' && isNaveAtKeyword(w.tokens[item.start]!)
}

/**
 * A block's frame. A style rule holding a directive is expanded here, once, before its children
 * are walked: the plan needs the rule's whole content, not one item at a time.
 */
function toWalkFrame(w: Walker, bounds: BlockBounds): WalkFrame {
  const items = readBlockItems(w, bounds.start, bounds.limit)
  const frame: Frame = { parts: [] }
  if (bounds.context.isStyleRuleParent && items.some((item) => isDirective(w, item))) {
    applyRuleFrame(w, {
      items,
      model: readBlockModel(w, items),
      selector: bounds.context.selector,
      isInsideKeyframes: bounds.context.isInsideKeyframes,
      isClosed: w.tokens[bounds.limit] !== undefined,
      endParts: frame.parts,
    })
  }
  return {
    next: 0,
    items,
    limit: bounds.limit,
    start: bounds.start,
    context: bounds.context,
    frame,
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
    const item = top.items[top.next]
    if (item === undefined) {
      flushFrame(w, top.start, top.limit, top.frame)
      stack.pop()
      continue
    }
    top.next++

    if (isDirective(w, item)) {
      if (!top.context.isStyleRuleParent) processRefusedDirective(w, item, top.context)
    } else if (item.kind === 'rule' || item.kind === 'at-rule') {
      const child = childFrameFor(w, item, top.context)
      if (child) stack.push(child)
    }
  }
}
