/**
 * Where a block's own close sits when EOF is reached before a real one,
 * and what (if anything) EOF closed implicitly along the way — split out
 * of `expand-text-walk.ts` to keep that file under the project's
 * file-length lint.
 */
import type { Walker } from './expand-text-walk.ts'
import type { Token } from './tokenizer.ts'

import { OPENERS } from './bracket-match.ts'
import { endOfToken } from './expand-text-terminator.ts'

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
 * What follows a lone trailing backslash. At the end of input a backslash
 * is a valid escape that decodes to U+FFFD, so `fffd` after it spells that
 * same escape out (`\fffd`, which decodes to that same code point) and frees
 * the `;`, `)` or `}` written next from being swallowed as the escaped
 * character.
 */
const ESCAPE_CLOSER = 'fffd'

/**
 * The one piece of text EOF closed early on `token`, had the input kept
 * going: a string's own opening quote, a url's closing paren, or the
 * `fffd` that completes a trailing backslash. `undefined` when `token` is
 * none of these, or already closed properly. Never a comment: that case is
 * handled by placing the appended block BEFORE it instead (below), since a
 * comment's own two closing bytes can span as few as two bytes past its own
 * opener and that overlap can misread as already present when checked as a
 * bare substring rather than by the scanner that actually walked it.
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
  return trailingBackslashCount(token.raw) % 2 === 1 ? ESCAPE_CLOSER : undefined
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
  // Where `prefix` goes: `position` itself, except ahead of a trailing comment.
  readonly prefixPosition: number
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
  const lexical = last ? lexicalEofCloser(last) : undefined
  if (lexical) closers.push(lexical)
  const scan = scanFrameTail(w, start, limit)
  for (const openIndex of scan.unmatchedOpeners) {
    closers.push(bracketEofCloser(w.tokens[openIndex]!.type))
  }

  if (scan.hasOpenColon) {
    closers.push(';')
  } else if (closers.length === (lexical === ESCAPE_CLOSER ? 1 : 0) && scan.hasDanglingText) {
    // Spelling out a trailing escape ends an identifier, not the prelude it is part of.
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
 * real syntax; an outer frame, whose own scan stops short of that comment, writes at the same
 * place. What the input left open ahead of that comment (a nested
 * rule, a function, the last declaration) is still closed, by closers
 * written right after the last real token, ahead of the comment too. Any
 * OTHER unterminated construct reaching that limit (a string, a url, an
 * unclosed bracket, a bare declaration, or a bare selector/at-rule prelude
 * with no block of its own) still ends exactly at EOF, but whatever it needed to read as valid
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
  if (closer) return { position: closer.startIndex, prefix: '', prefixPosition: closer.startIndex }

  const last = scanLimit > frameStart ? w.tokens[scanLimit - 1] : undefined
  const trailing = unclosedTrailingComment(w)
  if (trailing !== undefined && last !== trailing) {
    // An outer frame whose scan stops short of the comment still writes ahead of it.
    const prefix = eofClosers(w, frameStart, scanLimit, last)
    return { position: trailing.startIndex, prefix, prefixPosition: trailing.startIndex }
  }
  if (last?.type === 'comment') {
    const position = isClosedComment(last) ? w.css.length : last.startIndex
    return { position, ...closersBeforeComment(w, frameStart, scanLimit, position) }
  }

  const prefix = eofClosers(w, frameStart, scanLimit, last)
  return { position: w.css.length, prefix, prefixPosition: w.css.length }
}

/**
 * Whether the comment `token` is closed. It takes at least four bytes to end in a closer of its
 * own: the closing bytes of a bare opener-and-slash comment overlap the opener.
 */
function isClosedComment(token: Token): boolean {
  return token.raw.length >= 4 && token.raw.endsWith('*/')
}

/**
 * The input's very last token when it is a comment that never closes: it runs to the end of the
 * input, so anything written after it would be inside it.
 */
function unclosedTrailingComment(w: Walker): Token | undefined {
  const token = w.tokens.at(-1)
  return token?.type === 'comment' && !isClosedComment(token) ? token : undefined
}

/**
 * Whitespace or a comment: neither can end a declaration, or hold one open.
 */
function isInert(token: Token): boolean {
  return token.type === 'whitespace-token' || token.type === 'comment'
}

/**
 * The closers a frame that ends in a comment needs, and where they go: right
 * after the last token that is neither whitespace nor a comment, so they land
 * ahead of the comment and not after it. After a lone backslash they go after the line break
 * that follows it, since written right after the backslash they would be read as the escaped
 * character. No lexical closer is needed, since a trailing comment token proves no string or
 * url is still open. Nothing is written when no such token exists or the frame needs no closers.
 */
function closersBeforeComment(
  w: Walker,
  frameStart: number,
  scanLimit: number,
  fallback: number,
): { prefix: string; prefixPosition: number } {
  let i = scanLimit - 1
  while (i >= frameStart && isInert(w.tokens[i]!)) i--
  if (i < frameStart) return { prefix: '', prefixPosition: fallback }
  return {
    prefix: eofClosers(w, frameStart, scanLimit, undefined),
    prefixPosition: endOfToken(w.tokens, i, scanLimit),
  }
}
