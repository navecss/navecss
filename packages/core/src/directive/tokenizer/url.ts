/**
 * §4.3.6 "consume a url token" and §4.3.14 "consume the remnants of a bad url".
 */
import { consumeEscapedCodePoint } from './escape.ts'
import { consumeLiteralCodePoint, isNonPrintable, isValidEscapeAt, isWhitespace, type Scanner } from './scanner.ts'

interface UrlResult {
  readonly value: string
  readonly bad: boolean
}

const URL_BAD_DELIMITERS = new Set(['"', "'", '('])

/**
 * A quote, an open paren, or a non-printable code point: always bad inside
 * an unquoted url.
 */
function isUrlBadCharacter(c: string | undefined): boolean {
  if (c !== undefined && URL_BAD_DELIMITERS.has(c)) return true
  return isNonPrintable(c)
}

/**
 * §4.3.14 "consume the remnants of a bad url".
 */
function consumeBadUrlRemnants(s: Scanner): void {
  for (;;) {
    if (s.eof()) return
    if (s.peek() === ')') {
      s.advance()
      return
    }
    if (isValidEscapeAt(s)) {
      s.advance()
      consumeEscapedCodePoint(s)
      continue
    }
    s.advance()
  }
}

/**
Discards a bad url's remnants and reports it.
 */
function bad(s: Scanner): UrlResult {
  consumeBadUrlRemnants(s)
  return { value: '', bad: true }
}

/**
 * The `)` or EOF that closes a url token after its trailing whitespace run,
 * or a bad url.
 */
function consumeUrlTrailingWhitespace(s: Scanner, value: string): UrlResult {
  while (isWhitespace(s.peek())) s.advance()
  if (s.eof()) return { value, bad: false } // parse error, still a url-token
  if (s.peek() === ')') {
    s.advance()
    return { value, bad: false }
  }
  return bad(s)
}

/**
One `\` inside an unquoted url: a valid escape, or bad.
 */
function consumeUrlBackslash(s: Scanner, value: string): UrlResult {
  if (isValidEscapeAt(s)) {
    s.advance()
    return { value: value + consumeEscapedCodePoint(s), bad: false }
  }
  return bad(s)
}

/**
 * §4.3.6 "consume a url token". Scanner positioned right after `url(`.
 */
export function consumeUrlToken(s: Scanner): UrlResult {
  let value = ''
  while (isWhitespace(s.peek())) s.advance()

  for (;;) {
    if (s.eof()) return { value, bad: false } // parse error, still a url-token
    const c = s.peek()

    if (c === ')') {
      s.advance()
      return { value, bad: false }
    }
    if (isWhitespace(c)) return consumeUrlTrailingWhitespace(s, value)
    if (isUrlBadCharacter(c)) return bad(s)
    if (c === '\\') {
      const result = consumeUrlBackslash(s, value)
      if (result.bad) return result
      value = result.value
      continue
    }
    value += consumeLiteralCodePoint(s)
  }
}
