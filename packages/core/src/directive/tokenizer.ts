import type { Token, TokenType } from './tokenizer/token-types.ts'

/**
 * A first-party CSS Syntax Level 3 tokenizer (§4.3
 * https://www.w3.org/TR/css-syntax-3/#tokenization). No module reachable
 * from `tokenize` imports a host (PostCSS, Vite, Lightning CSS) or a
 * third-party CSS parsing library: `resolve`, `plan` and `expandText`
 * (R1-R3) are built on this and `block-reader.ts` alone. Character
 * classification and the scanner live in `tokenizer/scanner.ts`; each
 * `consume*` production from the spec has its own file beside it.
 */
import { tryConsumeComment } from './tokenizer/comment.ts'
import { consumeName } from './tokenizer/escape.ts'
import { consumeIdentLikeToken } from './tokenizer/ident-like.ts'
import { consumeNumericToken } from './tokenizer/numeric.ts'
import {
  isDigit,
  isIdentCodePoint,
  isIdentSequenceStartAt,
  isIdentStartCodePoint,
  isNumberStartAt,
  isValidEscapeAt,
  isWhitespace,
  Scanner,
} from './tokenizer/scanner.ts'
import { consumeStringToken } from './tokenizer/string.ts'

export type {
  AtKeywordStructured,
  DelimStructured,
  DimensionStructured,
  HashStructured,
  HashType,
  IdentStructured,
  NumberStructured,
  NumberType,
  PercentageStructured,
  StringStructured,
  Token,
  TokenType,
  UrlStructured,
} from './tokenizer/token-types.ts'

type Dispatch = (s: Scanner, start: number, c: string) => Token | undefined

/**
 *
 */
function delim(s: Scanner, start: number, char: string): Token {
  return {
    type: 'delim-token',
    raw: char,
    startIndex: start,
    endIndex: s.pos,
    structured: { value: char },
  }
}

/**
 *
 */
function noStructured(s: Scanner, start: number, raw: string, type: TokenType): Token {
  // eslint-disable-next-line unicorn/no-null -- the corpus's own format carries null, not undefined, for a structure-less token
  return { type, raw, startIndex: start, endIndex: s.pos, structured: null }
}

const SIMPLE: Partial<Record<string, TokenType>> = {
  ':': 'colon-token',
  ';': 'semicolon-token',
  ',': 'comma-token',
  '[': '[-token',
  ']': ']-token',
  '(': '(-token',
  ')': ')-token',
  '{': '{-token',
  '}': '}-token',
}

/**
 *
 */
function tryConsumeWhitespace(s: Scanner, start: number, c: string): Token | undefined {
  if (!isWhitespace(c)) return undefined
  while (isWhitespace(s.peek())) s.advance()
  return noStructured(s, start, s.input.slice(start, s.pos), 'whitespace-token')
}

/**
 *
 */
function tryConsumeQuoted(s: Scanner, start: number, c: string): Token | undefined {
  if (c !== '"' && c !== "'") return undefined
  s.advance()
  const { value, bad } = consumeStringToken(s, c)
  return {
    type: bad ? 'bad-string-token' : 'string-token',
    raw: s.input.slice(start, s.pos),
    startIndex: start,
    endIndex: s.pos,
    // eslint-disable-next-line unicorn/no-null -- the corpus's own format carries null, not undefined, for a bad-string-token
    structured: bad ? null : { value },
  }
}

/**
 *
 */
function consumeHashToken(s: Scanner, start: number): Token {
  const type = isIdentSequenceStartAt(s) ? 'id' : 'unrestricted'
  const value = consumeName(s)
  return {
    type: 'hash-token',
    raw: s.input.slice(start, s.pos),
    startIndex: start,
    endIndex: s.pos,
    structured: { value, type },
  }
}

/**
 * `#` starts a hash-token only when followed by a name code point or a
 * valid escape (the spec's own gate — narrower than, and separate from,
 * `isIdentSequenceStartAt`'s `id`/`unrestricted` type check just past it).
 */
function tryConsumeHashOrDelim(s: Scanner, start: number, c: string): Token | undefined {
  if (c !== '#') return undefined
  s.advance()
  if (isIdentCodePoint(s.peek()) || isValidEscapeAt(s)) return consumeHashToken(s, start)
  return delim(s, start, c)
}

/**
 *
 */
function tryConsumeSimple(s: Scanner, start: number, c: string): Token | undefined {
  const type = SIMPLE[c]
  if (!type) return undefined
  s.advance()
  return noStructured(s, start, c, type)
}

/**
 *
 */
function tryConsumePlusOrDot(s: Scanner, start: number, c: string): Token | undefined {
  if (c !== '+' && c !== '.') return undefined
  if (isNumberStartAt(s)) return consumeNumericToken(s, start)
  s.advance()
  return delim(s, start, c)
}

/**
 *
 */
function tryConsumeHyphen(s: Scanner, start: number, c: string): Token | undefined {
  if (c !== '-') return undefined
  if (isNumberStartAt(s)) return consumeNumericToken(s, start)
  if (s.peek(1) === '-' && s.peek(2) === '>') {
    s.advance(3)
    return noStructured(s, start, s.input.slice(start, s.pos), 'CDC-token')
  }
  if (isIdentSequenceStartAt(s)) return consumeIdentLikeToken(s, start)
  s.advance()
  return delim(s, start, c)
}

/**
 *
 */
function tryConsumeLessThan(s: Scanner, start: number, c: string): Token | undefined {
  if (c !== '<') return undefined
  if (s.peek(1) === '!' && s.peek(2) === '-' && s.peek(3) === '-') {
    s.advance(4)
    return noStructured(s, start, s.input.slice(start, s.pos), 'CDO-token')
  }
  s.advance()
  return delim(s, start, c)
}

/**
 *
 */
function tryConsumeAtKeyword(s: Scanner, start: number, c: string): Token | undefined {
  if (c !== '@') return undefined
  s.advance()
  if (isIdentSequenceStartAt(s)) {
    const value = consumeName(s)
    return {
      type: 'at-keyword-token',
      raw: s.input.slice(start, s.pos),
      startIndex: start,
      endIndex: s.pos,
      structured: { value },
    }
  }
  return delim(s, start, c)
}

/**
 *
 */
function tryConsumeBackslash(s: Scanner, start: number, c: string): Token | undefined {
  if (c !== '\\') return undefined
  if (isValidEscapeAt(s)) return consumeIdentLikeToken(s, start)
  s.advance() // parse error: a lone backslash before a newline/EOF
  return delim(s, start, c)
}

/**
 *
 */
function tryConsumeDigitOrIdentStart(s: Scanner, start: number, c: string): Token | undefined {
  if (isDigit(c)) return consumeNumericToken(s, start)
  if (isIdentStartCodePoint(c)) return consumeIdentLikeToken(s, start)
  return undefined
}

const DISPATCHERS: readonly Dispatch[] = [
  tryConsumeWhitespace,
  tryConsumeQuoted,
  tryConsumeHashOrDelim,
  tryConsumeSimple,
  tryConsumePlusOrDot,
  tryConsumeHyphen,
  tryConsumeLessThan,
  tryConsumeAtKeyword,
  tryConsumeBackslash,
  tryConsumeDigitOrIdentStart,
]

/**
 *
 */
function nextToken(s: Scanner, start: number): Token {
  const comment = tryConsumeComment(s, start)
  if (comment) return comment

  const c = s.peek()!
  for (const dispatch of DISPATCHERS) {
    const token = dispatch(s, start, c)
    if (token) return token
  }
  s.advance()
  return delim(s, start, c)
}

/**
 * §4.3.1 "consume a token", called until EOF. `tokenize` never preprocesses
 * the string (no CR/FF/CRLF normalization, no U+0000 replacement): both are
 * absorbed into classification and value-building instead
 * (`tokenizer/scanner.ts`), so every returned index is a plain offset into
 * the caller's own string.
 */
export function tokenize(css: string): Token[] {
  const s = new Scanner(css)
  const tokens: Token[] = []
  while (!s.eof()) {
    tokens.push(nextToken(s, s.pos))
  }
  return tokens
}
