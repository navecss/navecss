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
 * properly. Never a comment: a comment at the end of the frame is
 * stepped over (below) instead, so what it follows is closed before it or
 * after it, whichever keeps it a comment.
 */
function lexicalEofCloser(token: Token): string | undefined {
  if (token.type === 'string-token') {
    const quote = token.raw[0]
    if (quote === undefined || hasUnescapedTrailingChar(token.raw, quote)) return undefined
    return quote
  }
  if (token.type === 'url-token' || token.type === 'bad-url-token') {
    if (token.raw.endsWith(')')) return undefined
    // An unpaired trailing backslash would otherwise escape the `)` meant to close the url,
    // rather than end it, so it is paired first.
    return trailingBackslashCount(token.raw) % 2 === 1 ? String.raw`\)` : ')'
  }
  return undefined
}

/**
 * Whether `token` is a string left open by a lone backslash at the very end of input. CSS Syntax 3
 * reads that backslash as "consumed, contributes nothing", so the string's value ends before it;
 * a closing quote written after it would be escaped by it. The closers go before the backslash
 * instead, and the backslash stays the last byte of the output.
 */
function isStringEndingInLoneBackslash(token: Token): boolean {
  return (
    token.type === 'string-token' &&
    !hasUnescapedTrailingChar(token.raw, token.raw[0] ?? '') &&
    trailingBackslashCount(token.raw) % 2 === 1
  )
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
  readonly hasOpenColon: boolean
}

/**
 * `[start, limit)` in one pass: every opener still unmatched at `limit`, and whether
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
  let hasOpenColon = false
  let i = start
  while (i < limit) {
    const token = w.tokens[i]!
    const type = token.type
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
  return { unmatchedOpeners: unmatchedOpeners.toReversed(), hasOpenColon }
}

export interface EofClose {
  readonly position: number
  readonly prefix: string
}

/**
 * Every closer `[start, limit)` needs, in writing order: whatever `last`
 * (the token right before `limit`) needed lexically, then one per still
 * unmatched bracket, then `;` for a declaration still open at this level.
 * What follows (the `}` closing a wrapper the expansion opened) then reads as
 * its own token, never as more of the construct the input left open.
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

  if (scan.hasOpenColon) closers.push(';')
  return closers.join('')
}

/**
 * The index of the first token of the run of whitespace and comments that ends `[start, limit)`:
 * `limit` itself when the frame does not end in one.
 */
function trailingInertStart(w: Walker, start: number, limit: number): number {
  let first = limit
  while (first > start) {
    const type = w.tokens[first - 1]!.type
    if (type !== 'whitespace-token' && type !== 'comment') break
    first--
  }
  return first
}

/**
 * Where a block's own close sits, and what (if anything) EOF closed for it
 * implicitly: the `}` token's start with no prefix, the normal case; or,
 * when it never closes, the end of input, with whatever the input left open written first
 * (`eofClosers`) so the appended block that follows tokenizes as a sibling rather than more of
 * that construct's own content.
 *
 * Comments at the end are not part of what is open. What is open is closed as if they were not
 * there, and they keep their place as comments: a closed comment stays before the closers (which
 * are written after it, at the end of input), and an unclosed comment, which consumes every byte
 * to the end, stays last, the closers written at its own start. A string ending in a lone
 * backslash has its closers written before that backslash (`isStringEndingInLoneBackslash`).
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

  const lastIndex = scanLimit > frameStart ? scanLimit - 1 : -1
  const lastToken = w.tokens[lastIndex]
  const open = trailingInertStart(w, frameStart, scanLimit)
  const prefix = eofClosers(w, frameStart, open, open > frameStart ? w.tokens[open - 1] : undefined)
  if (lastToken?.type === 'comment') {
    const isClosed = lastToken.raw.length >= 4 && lastToken.raw.endsWith('*/')
    return { position: isClosed ? w.css.length : lastToken.startIndex, prefix }
  }
  if (lastToken !== undefined && isStringEndingInLoneBackslash(lastToken)) {
    return { position: lastToken.endIndex - 1, prefix }
  }
  return { position: w.css.length, prefix }
}
