/**
 * Where a block's own close sits when EOF is reached before a real one,
 * and what (if anything) EOF closed implicitly along the way — split out
 * of `expand-text-walk.ts` to keep that file under the project's
 * file-length lint.
 */
import type { Walker } from './expand-text-walk.ts'
import type { Token } from './tokenizer.ts'

import { OPENERS } from './bracket-match.ts'

/**
 * Whether `raw`'s own last character is `char`, genuinely — not an escaped
 * literal `char` inside the value (an even number of backslashes directly
 * before it means it isn't escaped; CSS Syntax 3's own escape rule).
 */
function hasUnescapedTrailingChar(raw: string, char: string): boolean {
  if (raw.length < 2 || raw.at(-1) !== char) return false
  let backslashes = 0
  for (let i = raw.length - 2; i >= 0 && raw[i] === '\\'; i--) backslashes++
  return backslashes % 2 === 0
}

/**
Every backslash `raw` ends in, run together.
 */
function trailingBackslashCount(raw: string): number {
  let count = 0
  for (let i = raw.length - 1; i >= 0 && raw[i] === '\\'; i--) count++
  return count
}

/**
 * The one character EOF closed early on `token`, had the input kept
 * going: a string's own opening quote, or a url's closing paren.
 * `undefined` when `token` is not one of these, or already closed
 * properly. Never a comment: that case is handled by placing the
 * appended block BEFORE it instead (below), since a comment's own two
 * closing bytes can span as few as two bytes past its own opener and
 * that overlap can misread as already present when checked as a bare
 * substring rather than by the scanner that actually walked it.
 */
function lexicalEofCloser(token: Token): string | undefined {
  if (token.type === 'string-token') {
    const quote = token.raw[0]
    if (quote === undefined || hasUnescapedTrailingChar(token.raw, quote)) return undefined
    // A dangling, unpaired trailing backslash (itself "consumed, contributes
    // nothing" at EOF per the tokenizer) would otherwise escape the very
    // quote meant to close the string: one more backslash first pairs it
    // into a literal backslash, so the quote after it closes for real.
    const hasDanglingEscape = trailingBackslashCount(token.raw) % 2 === 1
    return hasDanglingEscape ? `\\${quote}` : quote
  }
  if (token.type === 'url-token' || token.type === 'bad-url-token') {
    return token.raw.endsWith(')') ? undefined : ')'
  }
  return undefined
}

/**
The one character that closes an opener of `type`.
 */
function bracketEofCloser(type: string): string {
  if (type === '{-token') return '}'
  if (type === '[-token') return ']'
  return ')' // '(-token' or 'function-token'
}

/**
 * Every opener in `[start, limit)` still unmatched at `limit` (its own
 * `matchBrackets` closer is missing, or falls beyond `limit`), innermost
 * first: unmatched openers are never interleaved with matched ones in a
 * way that breaks their own nesting order, so the highest token index is
 * always the most recently opened, and the one to close first.
 */
function unmatchedOpenersDescending(w: Walker, start: number, limit: number): number[] {
  const result: number[] = []
  for (let i = start; i < limit; i++) {
    if (!OPENERS.has(w.tokens[i]!.type)) continue
    const closeIndex = w.closerFor[i]!
    if (closeIndex === -1 || closeIndex >= limit) result.push(i)
  }
  return result.toReversed()
}

export interface EofClose {
  readonly position: number
  readonly prefix: string
}

/**
 * Where a block's own close sits, and what (if anything) EOF closed for it
 * implicitly: the `}` token's start with no prefix, the normal case; or,
 * when it never closes (R5d), the end of input — except when the very
 * last token is an unclosed comment, which (having nowhere to end)
 * consumes every byte to EOF: placed at the comment's own start instead,
 * so the appended block lands before it, as real syntax, with no prefix
 * needed. Any OTHER unterminated construct reaching EOF (a string, a url,
 * or an unclosed bracket) still ends exactly at EOF, but the missing
 * closer(s) it needed are written first, innermost to outermost, so the
 * appended block that follows tokenizes as real syntax rather than more
 * of that construct's own content.
 */
export function closeInfoFor(w: Walker, frameStart: number, blockEndIndex: number): EofClose {
  const closer = w.tokens[blockEndIndex]
  if (closer) return { position: closer.startIndex, prefix: '' }

  const last = w.tokens.at(-1)
  if (last?.type === 'comment') {
    const isClosed = last.raw.length >= 4 && last.raw.endsWith('*/')
    return { position: isClosed ? w.css.length : last.startIndex, prefix: '' }
  }

  const closers: string[] = []
  if (last) {
    const lexical = lexicalEofCloser(last)
    if (lexical) closers.push(lexical)
  }
  for (const openIndex of unmatchedOpenersDescending(w, frameStart, blockEndIndex)) {
    closers.push(bracketEofCloser(w.tokens[openIndex]!.type))
  }
  return { position: w.css.length, prefix: closers.join('') }
}
