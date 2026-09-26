import type { Token } from './token-types.ts'

/**
 * §4.3.4 "consume an ident-like token".
 */
import { consumeName } from './escape.ts'
import { isWhitespace, type Scanner } from './scanner.ts'
import { consumeUrlToken } from './url.ts'

/**
True iff, past any whitespace, the next code point opens a quoted string (a plain function call, not a bare url).
 */
function isFollowedByQuote(s: Scanner): boolean {
  let lookahead = 0
  while (isWhitespace(s.peek(lookahead))) lookahead++
  const next = s.peek(lookahead)
  return next === '"' || next === "'"
}

/**
 *
 */
function consumeUrlOrFunctionToken(s: Scanner, start: number): Token {
  s.advance() // the `(` of `url(`
  if (isFollowedByQuote(s)) {
    return {
      type: 'function-token',
      raw: s.input.slice(start, s.pos),
      startIndex: start,
      endIndex: s.pos,
      structured: { value: 'url' },
    }
  }
  const { value, bad } = consumeUrlToken(s)
  return {
    type: bad ? 'bad-url-token' : 'url-token',
    raw: s.input.slice(start, s.pos),
    startIndex: start,
    endIndex: s.pos,
    // eslint-disable-next-line unicorn/no-null -- the corpus's format carries null (not undefined) for a bad-url-token's structured field
    structured: bad ? null : { value },
  }
}

/**
§4.3.4 "consume an ident-like token".
 */
export function consumeIdentLikeToken(s: Scanner, start: number): Token {
  const name = consumeName(s)

  if (name.toLowerCase() === 'url' && s.peek() === '(') {
    return consumeUrlOrFunctionToken(s, start)
  }

  if (s.peek() === '(') {
    s.advance()
    return {
      type: 'function-token',
      raw: s.input.slice(start, s.pos),
      startIndex: start,
      endIndex: s.pos,
      structured: { value: name },
    }
  }

  return {
    type: 'ident-token',
    raw: s.input.slice(start, s.pos),
    startIndex: start,
    endIndex: s.pos,
    structured: { value: name },
  }
}
