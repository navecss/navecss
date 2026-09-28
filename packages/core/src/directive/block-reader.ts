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

import { CLOSERS, matchedCloseWithin, OPENERS } from './bracket-match.ts'

export { matchBrackets } from './bracket-match.ts'

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
 * Scans one item to its natural end: a top-level `;` (consumed), a
 * top-level `{}` block that closes back to depth 0 (the item ends right
 * there), EOF while still inside a top-level `{}` (the block is unclosed,
 * the item still ends there), or EOF/the enclosing block's own `}` with no
 * block ever opened (neither consumed). Every bracket opened along the way
 * — however deeply anything nests inside it — is skipped in one jump to
 * its own precomputed match (`matchBrackets`), rather than stepped through
 * token by token: what closes it was already found, once, for the whole
 * document. A closer reached with nothing open — CSS Syntax 3's "consume a
 * component value" returns such a token as itself, not a terminator — is
 * preserved as an ordinary item token and scanning continues, UNLESS it is
 * this scan's own first token, in which case it is consumed as its own
 * one-token invalid item so the walk always advances (ceding an EMPTY span
 * back to a caller that re-reads the same token is what used to loop
 * forever).
 */
function scanItem(
  tokens: readonly Token[],
  start: number,
  limit: number,
  closerFor: Int32Array,
): ScanResult {
  let i = start
  while (i < limit) {
    const type = tokens[i]!.type
    if (OPENERS.has(type)) {
      const closeIndex = matchedCloseWithin(closerFor, i, limit)
      if (type === '{-token') {
        return {
          end: closeIndex === undefined ? limit : closeIndex + 1,
          consumedSemicolon: false,
          trailingBlock: { openIndex: i, closeIndex },
        }
      }
      i = closeIndex === undefined ? limit : closeIndex + 1
      continue
    }
    if (CLOSERS.has(type)) {
      if (i === start) return { end: i + 1, consumedSemicolon: false }
      i++
      continue
    }
    if (type === 'semicolon-token') return { end: i + 1, consumedSemicolon: true }
    i++
  }
  return { end: i, consumedSemicolon: false }
}

/**
 * Like `scanItem`, but never treats a `{}` as a trailing block (a custom
 * property's value is opaque token soup) and never treats a stray closer
 * as anything but preserved content: the only way out is a top-level `;`
 * or `limit` itself.
 */
function scanCustomPropertyValue(
  tokens: readonly Token[],
  start: number,
  limit: number,
  closerFor: Int32Array,
): number {
  let i = start
  while (i < limit) {
    const type = tokens[i]!.type
    if (OPENERS.has(type)) {
      const closeIndex = matchedCloseWithin(closerFor, i, limit)
      i = closeIndex === undefined ? limit : closeIndex + 1
      continue
    }
    if (type === 'semicolon-token') return i + 1
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
 * calling), within `[start, limit)`. `closerFor` is `matchBrackets(tokens)`
 * — computed once for the whole token stream by the caller, not once per
 * item, so a deeply nested document does not have each item re-discover
 * where the brackets it opens close.
 */
export function readItem(
  tokens: readonly Token[],
  start: number,
  limit: number,
  closerFor: Int32Array,
): Item {
  const first = tokens[start]!

  if (first.type === 'at-keyword-token') {
    return toAtRuleItem(tokens, start, scanItem(tokens, start + 1, limit, closerFor))
  }

  if (first.type === 'ident-token' && isColonSoonAfter(tokens, start + 1, limit)) {
    if (isCustomPropertyName(first)) {
      return toDeclarationItem(start, scanCustomPropertyValue(tokens, start + 1, limit, closerFor))
    }
    const scan = scanItem(tokens, start + 1, limit, closerFor)
    if (!scan.trailingBlock) return toDeclarationItem(start, scan.end)
    return toRuleOrInvalidItem(start, scan)
  }

  return toRuleOrInvalidItem(start, scanItem(tokens, start, limit, closerFor))
}

/**
True for a `@nave` at-keyword: ASCII case-insensitive on its unescaped value (R5a).
 */
export function isNaveAtKeyword(token: Token): boolean {
  return token.type === 'at-keyword-token' && atKeywordName(token) === 'nave'
}
