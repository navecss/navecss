/**
 * R21-R23: the channel-argument tokenising shared by the six channel-list seed forms
 * (`rgb()`, `hsl()`, `oklch()`, `lab()`, `lch()`, `color()`) — CSS-
 * whitespace-only trimming, the CSS `<number-token>` grammar, and the paren-depth-aware
 * channel/alpha split. hex is the seventh accepted seed form; it carries no channel list to
 * tokenise, so it never reaches this module. Split out of `seed-form-parsers.ts` so it and
 * `seed-form-parsers-css-color-4.ts` both read alpha, hue and channel tokens off one shared
 * module, rather than one importing the other's parsing internals.
 */

import { clamp01 } from './seed-refusal.ts'

/**
 * CSS's OWN whitespace set (`<whitespace-token>`: space, tab, line feed, carriage return, form
 * feed), which is strictly NARROWER than JavaScript's `\s`. `\s` also matches U+00A0 and the
 * other Unicode space separators, so tokenising with it lets an invisible non-CSS space act as
 * a channel separator: `lab(50<NBSP>20 30)` split on `\s` yields three well-formed tokens and
 * was silently accepted as `lab(50 20 30)` (a quality reviewer's
 * finding B, elected for fix by Cédric at GATE 2). Every trimming and splitting step below uses
 * this set, so an NBSP stays INSIDE the token it was typed in, where `readNumericToken` refuses it.
 */
const CSS_WHITESPACE_EDGES = /^[ \t\n\r\f]+|[ \t\n\r\f]+$/g

/**
 * Trims CSS whitespace only, leaving any other Unicode space in place to be refused as a value.
 */
function cssTrim(text: string): string {
  return text.replaceAll(CSS_WHITESPACE_EDGES, '')
}

/**
 * CSS Syntax Level 3's `<number-token>` production, anchored to match the WHOLE token: an
 * optional sign, then either a digit run with an optional fractional part, or a fractional
 * part alone (a leading dot with digits after it, never a bare trailing dot with nothing
 * after it), then an optional exponent. This is deliberately narrower than what
 * `Number(text)` accepts: JavaScript's numeral grammar is a superset of
 * CSS's, and every shape in that superset silently converts to an unrelated, wrong number
 * instead of refusing, rather than throwing the way a genuinely non-numeric token would.
 */
const CSS_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * Reads a channel or alpha token's numeric text as a number, refusing (returning `NaN`) anything
 * that is not a whole CSS `<number>`. The three shapes `Number` would otherwise convert silently
 * are recorded below. `CSS_NUMBER` subsumes all three since a later widening, so neither check
 * above it decides anything today; keep both, lest a future widening of it re-admit one by
 * accident.
 *
 * First, text that is empty or whitespace-only: `Number('')` is `0`, not `NaN`, which is the one
 * gap `Number.isFinite` alone cannot see afterwards, and it let a bare `%` (no digits before the
 * sign) read as channel value `0` instead of refusing (quality-review
 * findings F1/F1b, and the same gap in `oklch()`'s inline percentage parsing and in
 * `parseHueDeg`'s `deg`-stripping, quality-review findings F5/F6). Callers pass the text AFTER
 * stripping a percentage sign or a `deg` unit, since that is exactly where the text can turn up
 * empty.
 *
 * Second, text still carrying whitespace of ANY kind once the tokeniser has run. The tokeniser
 * splits on CSS whitespace alone, so a token reaching here can only still contain a space
 * character CSS does not tokenise on (an NBSP, say). `Number` trims those before converting, so
 * `Number` of an NBSP followed by `5` is `5`; refusing instead keeps an invisible character from being
 * read as part of a value (a quality reviewer's finding B). No valid input reaches here with
 * whitespace in it.
 *
 * Third, text that is not a CSS `<number>` at all but IS a JavaScript numeral `Number` accepts:
 * a hex-integer literal (`0x10`, `0X1F` -- CSS has no hex-integer syntax
 * outside the hex COLOUR forms, which are handled entirely separately and never reach this
 * function), or any other numeral shape CSS's grammar does not admit. Checked against
 * `CSS_NUMBER` above, which is anchored so a token that is merely PREFIXED or SUFFIXED by a
 * valid number (rather than being one, whole) still refuses. A valid CSS exponent form
 * (`1e5`) is legal syntax and is NOT refused here -- the resulting out-of-domain channel value,
 * if any, is a separate range-validation question this function does not raise or resolve.
 *
 * Shared with `seed-form-parsers-css-color-4.ts` so the six channel-list forms (`rgb()`, `hsl()`,
 * `oklch()`, `lab()`, `lch()`, `color()`) refuse the same way -- hex is the seventh accepted form
 * and has no channel list to tokenise (see the header comment).
 */
export function readNumericToken(text: string): number {
  if (text.trim() === '') return NaN
  if (/\s/u.test(text)) return NaN
  if (!CSS_NUMBER.test(text)) return NaN
  return Number(text)
}

/**
 * CSS Color 4's `none` keyword, legal in any channel (or alpha) slot of every accepted colour
 * function written in the MODERN, space-separated syntax: "explicitly not specified", which
 * resolves to 0 wherever a value is used directly rather than interpolated — exactly this
 * build's situation, since a seed is a single static value. ASCII case-insensitive, like every
 * CSS keyword.
 *
 * Matches the WHOLE token only, never a substring: `none` replaces an entire channel value, it
 * is not a number that can carry a `%` sign or an angle unit (`none%`, `nonedeg` are not
 * `none`, they are unreadable tokens, which is why `readNumericToken` above no longer treats
 * `none` specially — it would otherwise fire on the `none` left behind once a caller strips a
 * suffix from one of those). Every caller that accepts `none` checks this on the token AS
 * WRITTEN, before any `%` or unit is stripped from it.
 */
export function isNoneKeyword(text: string): boolean {
  return /^none$/i.test(text)
}

/**
 * Parses a raw alpha token (a bare number or a percentage) to a 0-1 fraction.
 */
function parseAlphaToken(token: string): number {
  const t = cssTrim(token)
  if (t.endsWith('%')) return clamp01(readNumericToken(t.slice(0, -1)) / 100)
  return clamp01(readNumericToken(t))
}

const CSS_WHITESPACE_CHARS = ' \t\n\r\f'

/**
 * Splits `text` at every occurrence of a character `isSeparator` accepts, EXCEPT while inside a
 * nested `(...)`: a paren pair balances to depth 0 before its contents can be split on, so a
 * function call sitting in a channel slot (`calc(1 + 2)`) stays one token end to end, the same
 * way CSS's own tokeniser treats a function block as a single component value.
 * Depth tracking is `()`-only, the one bracket a channel's grammar nests.
 * A run of separator characters collapses the same way `String.split` on a run would: an empty
 * token between two separators is simply never pushed.
 */
function splitTopLevel(text: string, isSeparator: (ch: string) => boolean): string[] {
  const tokens: string[] = []
  let current = ''
  let depth = 0
  for (const ch of text) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && isSeparator(ch)) {
      if (current !== '') tokens.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current !== '') tokens.push(current)
  return tokens
}

/**
 * The index of the LAST top-level `/` in `text` (outside any `(...)`), or -1. `lastIndexOf`
 * alone would also match a `/` nested inside a channel's function call (`calc(60 / 2)`),
 * misreading part of a channel as the alpha slash; paren depth is what
 * `splitTopLevel` already tracks for the channel split itself, so the alpha-slash lookup uses
 * the same rule.
 */
function lastTopLevelSlashIndex(text: string): number {
  let depth = 0
  let lastIndex = -1
  // `text.split('')`, NOT `[...text]`: spreading a string iterates by UNICODE CODE POINT, while
  // `splitChannelArgs` below slices this same string with UTF-16 `String.prototype.slice` --
  // `split('')` iterates by UTF-16 code unit instead, so `i` stays a valid slice index even when
  // a non-BMP character (an astral emoji, say) sits before the slash.
  for (const [i, ch] of text.split('').entries()) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === '/' && depth === 0) lastIndex = i
  }
  return lastIndex
}

/**
 * Splits a colour function's argument list into channel tokens plus an optional alpha.
 * `isLegacySyntax` tells a caller whether the argument list used comma syntax, so a caller for
 * whom that matters (rgb()/hsl(), whose `none` is legal only in the modern space-separated
 * syntax, CSS Color 4 §4.1.2) can refuse it without re-deriving the split's own comma/space
 * decision.
 */
export function splitChannelArgs(args: string): {
  alpha: number | undefined
  isLegacySyntax: boolean
  parts: string[]
} {
  const trimmed = cssTrim(args)
  const slashIdx = lastTopLevelSlashIndex(trimmed)
  let main = trimmed
  let alpha: number | undefined
  if (slashIdx !== -1) {
    main = cssTrim(trimmed.slice(0, slashIdx))
    alpha = parseAlphaToken(trimmed.slice(slashIdx + 1))
  }
  const commaParts = splitTopLevel(main, (ch) => ch === ',')
  const isLegacySyntax = commaParts.length > 1
  let parts: string[]
  if (isLegacySyntax) {
    parts = commaParts.map((p) => cssTrim(p)).filter(Boolean)
    // Legacy comma syntax (rgba(r, g, b, a)) may carry alpha as a 4th comma-separated part.
    if (alpha === undefined && parts.length === 4) {
      alpha = parseAlphaToken(parts.pop()!)
    }
  } else {
    parts = splitTopLevel(main, (ch) => CSS_WHITESPACE_CHARS.includes(ch))
  }
  return { alpha, isLegacySyntax, parts }
}

/**
 * CSS's four `<angle>` units, converted to degrees. `<hue>` is `<number> | <angle>` (CSS Color
 * 4), so a hue channel may carry any of these instead of a bare number or `deg`. Checked
 * longest-suffix-first: `grad` ends in the three letters `rad`, so `rad` must never be tried
 * before `grad` or `90grad` would mis-strip to `90g`.
 */
const ANGLE_UNITS: readonly { toDeg: number; unit: string }[] = [
  { toDeg: 0.9, unit: 'grad' },
  { toDeg: 360, unit: 'turn' },
  { toDeg: 180 / Math.PI, unit: 'rad' },
  { toDeg: 1, unit: 'deg' },
]

/**
 * Parses a hue token — a bare number, a number carrying one of CSS's four `<angle>` units, or
 * `none` (0) — to degrees.
 */
export function parseHueDeg(token: string): number {
  if (isNoneKeyword(token)) return 0
  const lower = token.toLowerCase()
  for (const { toDeg, unit } of ANGLE_UNITS) {
    if (lower.endsWith(unit)) {
      return readNumericToken(token.slice(0, token.length - unit.length)) * toDeg
    }
  }
  return readNumericToken(token)
}
