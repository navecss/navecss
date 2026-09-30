/**
 * §4.3.5 "consume a string token".
 */
import { consumeEscapedCodePoint } from './escape.ts'
import { consumeLiteralCodePoint, didConsumeNewline, type Scanner } from './scanner.ts'

interface StringResult {
  readonly value: string
  readonly bad: boolean
}

const NEWLINE_CHARS = new Set(['\n', '\r', '\f'])

/**
 * True and consuming (the backslash plus the newline) iff `\` is
 * immediately followed by a line break.
 */
function didConsumeLineContinuation(s: Scanner): boolean {
  const c = s.peek(1)
  if (c === undefined || !NEWLINE_CHARS.has(c)) return false
  s.advance() // the backslash
  didConsumeNewline(s)
  return true
}

/**
One `\` inside a string: a line continuation, a trailing EOF backslash, or an escaped code point.
 */
function consumeStringBackslash(s: Scanner, value: string): string {
  if (s.eof(1)) {
    s.advance() // trailing backslash at EOF: consumed, contributes nothing
    return value
  }
  if (didConsumeLineContinuation(s)) return value
  s.advance() // the backslash
  return value + consumeEscapedCodePoint(s)
}

/**
 * The scanner must be positioned right after the opening quote;
 * `endingCodePoint` is that quote.
 */
export function consumeStringToken(s: Scanner, endingCodePoint: string): StringResult {
  let value = ''
  for (;;) {
    if (s.eof()) return { value, bad: false } // parse error, still a string-token
    const c = s.peek()
    if (c === endingCodePoint) {
      s.advance()
      return { value, bad: false }
    }
    if (c !== undefined && NEWLINE_CHARS.has(c)) {
      return { value, bad: true } // unescaped newline: reconsumed by the caller
    }
    if (c === '\\') {
      value = consumeStringBackslash(s, value)
      continue
    }
    value += consumeLiteralCodePoint(s)
  }
}
