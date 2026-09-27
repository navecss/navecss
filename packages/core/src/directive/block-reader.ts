/**
 * "The block reader" — the structural scanner `expandText()` is built on.
 * It walks a stylesheet's token stream one item at a time and
 * tells the caller what each item IS (a declaration, a qualified rule, an
 * at-rule with or without a block, or an invalid item), without knowing
 * anything about `@nave` itself.
 *
 * Disambiguation follows CSS's own "does this item end in a trailing `{}`
 * block" rule, the one that makes `a:hover { color: red }` a rule rather
 * than a declaration whose value starts with `hover`: every item is first
 * scanned to its natural end (a top-level `;`, a top-level `{}` block that
 * closes back to depth 0, or EOF/the enclosing block's own `}`), balancing
 * `()`, `[]` and `{}` throughout. A custom property (a name starting `--`)
 * is the one exception CSS itself carves out: its value may contain an
 * arbitrary `{}` with no reparse, because custom-property values are
 * defined to accept any token soup.
 */
import type { Token } from './tokenizer.ts'

/**
 * Part of `Item.kind`'s vocabulary; kept exported for a consumer narrowing
 * on it directly, not yet named by any in-tree caller.
 * @public
 */
export type ItemKind = 'declaration' | 'rule' | 'at-rule' | 'invalid'

export interface Item {
  readonly kind: ItemKind
  /**
  Token index range of the whole item, end exclusive.
   */
  readonly start: number
  readonly end: number
  /**
  For `rule`/`at-rule`: the token index range of the block's inner content (between `{` and `}`), if it has one.
   */
  readonly blockStart?: number
  readonly blockEnd?: number
  /**
  For `at-rule`: its decoded, unescaped name.
   */
  readonly atKeyword?: string
  /**
  For `at-rule`: the prelude's character span (start of the first token after the at-keyword, end before `{`/`;`/EOF).
   */
  readonly preludeOffset?: number
  readonly preludeEndOffset?: number
}

const OPENERS = new Set(['(-token', '[-token', 'function-token', '{-token'])
const CLOSERS = new Set([')-token', ']-token', '}-token'])

interface TrailingBlock {
  readonly openIndex: number
  /**
  `undefined` when the block never closes: an unclosed rule at end of input.
   */
  readonly closeIndex: number | undefined
}

interface ScanResult {
  readonly end: number
  readonly consumedSemicolon: boolean
  readonly trailingBlock?: TrailingBlock
}

/**
Whether `closerType` is the mirror of `openerType` — the only pairing CSS Syntax 3 lets close a simple block: `)` for `(` or a function's own `(`, `]` for `[`, `}` for `{`.
 */
function isMirrorCloser(openerType: string, closerType: string): boolean {
  if (closerType === ')-token') return openerType === '(-token' || openerType === 'function-token'
  if (closerType === ']-token') return openerType === '[-token'
  return openerType === '{-token' // closerType === '}-token'
}

/**
Mutable state one `scanItem()` call threads through every closer it sees: the open-bracket stack and the current depth.
 */
interface ScanState {
  opens: number[]
  depth: number
  readonly start: number
}

/**
One step of `scanItem()`'s loop over a closer token: the index to resume scanning from, and a `result` when the item ends right here.
 */
interface CloserStep {
  readonly nextIndex: number
  readonly result?: ScanResult
}

/**
 * Steps `state` over the closer token at `i`. A closer with nothing open at
 * all (depth 0) belongs to the enclosing block UNLESS this is the item's own
 * first token, in which case it is a stray closer with no opener anywhere in
 * `[start, limit)` — consumed as its own one-token invalid item so the walk
 * advances (ceding an EMPTY span back to a caller that re-reads the same
 * token is what used to loop forever). A closer that does not mirror the
 * innermost open bracket closes nothing — CSS Syntax 3's "consume a
 * component value" returns such a token as itself, not a terminator — so
 * it passes through at the same depth, still seeking its own mirror.
 */
function stepOverCloser(
  tokens: readonly Token[],
  state: ScanState,
  i: number,
  type: string,
): CloserStep {
  if (state.depth === 0) {
    if (i === state.start) {
      return { nextIndex: i + 1, result: { end: i + 1, consumedSemicolon: false } }
    }
    return { nextIndex: i, result: { end: i, consumedSemicolon: false } }
  }
  const openIndex = state.opens.at(-1)!
  if (!isMirrorCloser(tokens[openIndex]!.type, type)) return { nextIndex: i + 1 }
  state.opens.pop()
  state.depth--
  if (type === '}-token' && state.depth === 0) {
    return {
      nextIndex: i + 1,
      result: {
        end: i + 1,
        consumedSemicolon: false,
        trailingBlock: { openIndex, closeIndex: i },
      },
    }
  }
  return { nextIndex: i + 1 }
}

/**
 * Scans one item to its natural end: a top-level `;` (consumed), a
 * top-level `{}` block that closes back to depth 0 (the item ends right
 * there), EOF while still inside a top-level `{}` (the block is unclosed,
 * the item still ends there), or EOF/the enclosing block's own
 * `}` with no block ever opened (neither consumed).
 */
function scanItem(tokens: readonly Token[], start: number, limit: number): ScanResult {
  const state: ScanState = { opens: [], depth: 0, start }
  let i = start
  while (i < limit) {
    const type = tokens[i]!.type
    if (OPENERS.has(type)) {
      state.opens.push(i)
      state.depth++
      i++
      continue
    }
    if (CLOSERS.has(type)) {
      const step = stepOverCloser(tokens, state, i, type)
      if (step.result) return step.result
      i = step.nextIndex
      continue
    }
    if (type === 'semicolon-token' && state.depth === 0) {
      return { end: i + 1, consumedSemicolon: true }
    }
    i++
  }
  if (state.opens.length > 0 && tokens[state.opens[0]!]!.type === '{-token') {
    return {
      end: i,
      consumedSemicolon: false,
      trailingBlock: { openIndex: state.opens[0]!, closeIndex: undefined },
    }
  }
  return { end: i, consumedSemicolon: false }
}

/**
Like `scanItem`, but never treats a `{}` as a trailing block: a custom property's value is opaque token soup.
 */
function scanCustomPropertyValue(tokens: readonly Token[], start: number, limit: number): number {
  let depth = 0
  let i = start
  while (i < limit) {
    const type = tokens[i]!.type
    if (OPENERS.has(type)) {
      depth++
    } else if (CLOSERS.has(type)) {
      if (depth === 0) return i
      depth--
    } else if (depth === 0 && type === 'semicolon-token') {
      return i + 1
    }
    i++
  }
  return i
}

/**
 *
 */
function isColonSoonAfter(tokens: readonly Token[], i: number, limit: number): boolean {
  let j = i
  while (j < limit && (tokens[j]!.type === 'whitespace-token' || tokens[j]!.type === 'comment')) j++
  return tokens[j]?.type === 'colon-token'
}

/**
 *
 */
function isCustomPropertyName(token: Token): boolean {
  return token.type === 'ident-token' && (token.structured?.value as string).startsWith('--')
}

/**
The at-keyword's decoded name, ASCII-lowercased, so `@NAVE` and an escaped spelling like `@n\61ve` compare equal to `@nave`.
 */
export function atKeywordName(token: Token): string {
  return (token.structured?.value as string).toLowerCase()
}

/**
 *
 */
function toDeclarationItem(start: number, end: number): Item {
  return { kind: 'declaration', start, end }
}

/**
The character offset just past the last token the item's PRELUDE (not its block) actually contains.
 */
function preludeEndOffset(
  tokens: readonly Token[],
  start: number,
  scan: ScanResult,
  preludeStart: number,
): number {
  if (scan.trailingBlock) return tokens[scan.trailingBlock.openIndex]!.startIndex
  // The token just before the `;` when one was consumed, else the last content token before EOF/the enclosing `}`.
  const lastContentIndex = scan.consumedSemicolon ? scan.end - 2 : scan.end - 1
  return lastContentIndex >= start ? tokens[lastContentIndex]!.endIndex : preludeStart
}

/**
 *
 */
function toAtRuleItem(tokens: readonly Token[], start: number, scan: ScanResult): Item {
  const nameToken = tokens[start]!
  const preludeStart = tokens[start + 1]?.startIndex ?? nameToken.endIndex
  return {
    kind: 'at-rule',
    start,
    end: scan.end,
    atKeyword: atKeywordName(nameToken),
    preludeOffset: preludeStart,
    preludeEndOffset: preludeEndOffset(tokens, start + 1, scan, preludeStart),
    ...(scan.trailingBlock && {
      blockStart: scan.trailingBlock.openIndex + 1,
      blockEnd: scan.trailingBlock.closeIndex ?? scan.end,
    }),
  }
}

/**
 *
 */
function toRuleOrInvalidItem(start: number, scan: ScanResult): Item {
  if (!scan.trailingBlock) return { kind: 'invalid', start, end: scan.end }
  return {
    kind: 'rule',
    start,
    end: scan.end,
    blockStart: scan.trailingBlock.openIndex + 1,
    blockEnd: scan.trailingBlock.closeIndex ?? scan.end,
  }
}

/**
 * The next item starting at `start` (skip whitespace/comments before
 * calling), within `[start, limit)`.
 */
export function readItem(tokens: readonly Token[], start: number, limit: number): Item {
  const first = tokens[start]!

  if (first.type === 'at-keyword-token') {
    return toAtRuleItem(tokens, start, scanItem(tokens, start + 1, limit))
  }

  if (first.type === 'ident-token' && isColonSoonAfter(tokens, start + 1, limit)) {
    if (isCustomPropertyName(first)) {
      return toDeclarationItem(start, scanCustomPropertyValue(tokens, start + 1, limit))
    }
    const scan = scanItem(tokens, start + 1, limit)
    if (!scan.trailingBlock) return toDeclarationItem(start, scan.end)
    return toRuleOrInvalidItem(start, scan)
  }

  return toRuleOrInvalidItem(start, scanItem(tokens, start, limit))
}

/**
True for a `@nave` at-keyword: ASCII case-insensitive on its unescaped value (R5a).
 */
export function isNaveAtKeyword(token: Token): boolean {
  return token.type === 'at-keyword-token' && atKeywordName(token) === 'nave'
}
