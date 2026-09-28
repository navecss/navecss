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
    if (token.raw.endsWith(')')) return undefined
    // The same reasoning as a string's dangling escape above: an unpaired
    // trailing backslash would otherwise escape the `)` meant to close the
    // url, rather than end it, so it is paired first.
    return trailingBackslashCount(token.raw) % 2 === 1 ? String.raw`\)` : ')'
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

interface FrameTailScan {
  // Innermost first: a matcher never leaves an unmatched opener nested
  // inside a matched one (the outer one could not have closed otherwise),
  // so the highest token index found is always the most recently opened,
  // and the one to close first.
  readonly unmatchedOpeners: readonly number[]
  readonly hasDanglingText: boolean
  readonly hasOpenColon: boolean
}

/**
 * `[start, limit)` in one pass: every opener still unmatched at `limit`;
 * whether it holds any token besides whitespace or a comment; and whether
 * it holds a property name's `:` with nothing terminating it yet, read at
 * its own top level — a matched bracket's own content is skipped whole
 * (jumped to its closer), since nothing inside it, however it punctuates
 * its own value, changes whether THIS level is mid-declaration, and a
 * matcher never leaves an unmatched opener nested inside a matched one.
 * One pass over what would otherwise be three, since this runs once per
 * still-open frame at EOF and a stylesheet can nest arbitrarily many.
 */
function scanFrameTail(w: Walker, start: number, limit: number): FrameTailScan {
  const unmatchedOpeners: number[] = []
  let hasDanglingText = false
  let hasOpenColon = false
  let i = start
  while (i < limit) {
    const token = w.tokens[i]!
    const type = token.type
    if (type !== 'whitespace-token' && type !== 'comment') hasDanglingText = true
    if (type === 'semicolon-token') {
      hasOpenColon = false
    } else if (type === 'colon-token') {
      hasOpenColon = true
    } else if (OPENERS.has(type)) {
      const closeIndex = w.closerFor[i]!
      if (closeIndex === -1 || closeIndex >= limit) {
        unmatchedOpeners.push(i)
      } else {
        i = closeIndex
      }
    }
    i++
  }
  return { unmatchedOpeners: unmatchedOpeners.toReversed(), hasDanglingText, hasOpenColon }
}

export interface EofClose {
  readonly position: number
  readonly prefix: string
}

/**
 * Every closer `[start, limit)` needs, in writing order: whatever `last`
 * (the token right before `limit`) needed lexically, then one per still
 * unmatched bracket, then `;` for a declaration still open at this level —
 * or, when none of those apply yet real tokens remain, one `{}` for a bare
 * selector/at-rule prelude that never reached its own `{`. Per CSS Syntax 3
 * that prelude is only dropped because nothing follows it: appending the
 * block right after it un-drops it, and lets the block's own tokens read as
 * more of the same prelude instead of its own sibling, unless given its own
 * (empty, harmless) block first.
 */
function eofClosers(w: Walker, start: number, limit: number, last: Token | undefined): string {
  const closers: string[] = []
  if (last) {
    const lexical = lexicalEofCloser(last)
    if (lexical) closers.push(lexical)
  }
  const scan = scanFrameTail(w, start, limit)
  for (const openIndex of scan.unmatchedOpeners) {
    closers.push(bracketEofCloser(w.tokens[openIndex]!.type))
  }

  if (scan.hasOpenColon) {
    closers.push(';')
  } else if (closers.length === 0 && scan.hasDanglingText) {
    closers.push('{}')
  }
  return closers.join('')
}

/**
 * Where a block's own close sits, and what (if anything) EOF closed for it
 * implicitly: the `}` token's start with no prefix, the normal case; or,
 * when it never closes, the end of input — except when the very
 * last token in `[frameStart, scanLimit)` is an unclosed comment, which
 * (having nowhere to end) consumes every byte to that limit: placed at the
 * comment's own start instead, so the appended block lands before it, as
 * real syntax, with no prefix needed. Any OTHER unterminated construct
 * reaching that limit (a string, a url, an unclosed bracket, a bare
 * declaration, or a bare selector/at-rule prelude with no block of its
 * own) still ends exactly at EOF, but whatever it needed to read as valid
 * syntax is written first (`eofClosers`), so the appended block that
 * follows tokenizes as a sibling rather than more of that construct's own
 * content.
 *
 * `scanLimit` is `blockEndIndex` bounded to `w.eofScanLimit`: the frame
 * this call is for writes only the closers between its own opener and
 * whichever inner frame most recently wrote its own (an inner frame with
 * nothing to append never updates this bound, so a still-further-out
 * frame closes everything down to it in one go, exactly as before) —
 * otherwise two open, appending frames one inside the other would each
 * independently rediscover the SAME unmatched inner bracket and both
 * close it, doubling it in the output.
 */
export function closeInfoFor(
  w: Walker,
  frameStart: number,
  blockEndIndex: number,
  scanLimit: number,
): EofClose {
  const closer = w.tokens[blockEndIndex]
  if (closer) return { position: closer.startIndex, prefix: '' }

  const last = scanLimit > frameStart ? w.tokens[scanLimit - 1] : undefined
  if (last?.type === 'comment') {
    const isClosed = last.raw.length >= 4 && last.raw.endsWith('*/')
    return { position: isClosed ? w.css.length : last.startIndex, prefix: '' }
  }

  return { position: w.css.length, prefix: eofClosers(w, frameStart, scanLimit, last) }
}
