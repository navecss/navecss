/**
 * §4.3.7 "consume an escaped code point" and §4.3.12 "consume a name" (the
 * ident-sequence consumer, shared by hash values, idents, at-keywords and
 * dimension units).
 */
import {
  consumeLiteralCodePoint,
  didConsumeNewline,
  isHexDigit,
  isIdentCodePoint,
  isValidEscapeAt,
  type Scanner,
} from './scanner.ts'

/**
 *
 */
function consumeEscapeHexDigits(s: Scanner): string {
  let hex = s.peek() ?? ''
  s.advance()
  for (let i = 0; i < 5 && isHexDigit(s.peek()); i++) {
    hex += s.peek()
    s.advance()
  }
  return hex
}

/**
 *
 */
function isMaxAllowedCodePoint(value: number): boolean {
  return value !== 0 && !(value >= 0xd8_00 && value <= 0xdf_ff) && value <= 0x10_ff_ff
}

/**
 * §4.3.7 "consume an escaped code point". Called with the scanner positioned
 * right after the `\` has already been consumed.
 */
export function consumeEscapedCodePoint(s: Scanner): string {
  if (s.eof()) return '�' // parse error: EOF right after the backslash
  if (!isHexDigit(s.peek())) return consumeLiteralCodePoint(s)

  const hex = consumeEscapeHexDigits(s)
  didConsumeNewline(s) // trailing whitespace after the hex digits, CRLF as one unit
  if (s.peek() === ' ' || s.peek() === '\t') s.advance()

  const value = Number.parseInt(hex, 16)
  return isMaxAllowedCodePoint(value) ? String.fromCodePoint(value) : '�'
}

/**
 * §4.3.12 "consume a name" (called "consume an ident sequence" in later
 * drafts). Greedily consumes name code points and valid escapes.
 */
export function consumeName(s: Scanner): string {
  let result = ''
  for (;;) {
    if (isIdentCodePoint(s.peek())) {
      result += consumeLiteralCodePoint(s)
      continue
    }
    if (!isValidEscapeAt(s)) return result
    s.advance() // the backslash
    result += consumeEscapedCodePoint(s)
  }
}
