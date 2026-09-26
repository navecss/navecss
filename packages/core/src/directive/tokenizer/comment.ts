/**
 * §4.3.2 "consume comments". Emitted here as its own `comment` token
 * (`@rmenke/css-tokenizer-tests`' format) rather than silently discarded:
 * the spec does not require exposing it, but `expandText` needs comment
 * spans to never touch a `@nave`-looking run of text inside one (R3).
 */
import type { Scanner } from './scanner.ts'
import type { Token } from './token-types.ts'

/**
One comment starting at `/*`, or `undefined` when the scanner isn't at one.
 */
export function tryConsumeComment(s: Scanner, start: number): Token | undefined {
  if (s.peek() !== '/' || s.peek(1) !== '*') return undefined
  s.advance(2)
  for (;;) {
    if (s.eof()) break // parse error: unterminated, consume to EOF anyway
    if (s.peek() === '*' && s.peek(1) === '/') {
      s.advance(2)
      break
    }
    s.advance()
  }
  return {
    type: 'comment',
    raw: s.input.slice(start, s.pos),
    startIndex: start,
    endIndex: s.pos,
    // eslint-disable-next-line unicorn/no-null -- the corpus's format carries null (not undefined) for a comment's structured field
    structured: null,
  }
}
