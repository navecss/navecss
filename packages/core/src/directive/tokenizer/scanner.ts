/**
 * Code point classification (CSS Syntax Level 3 §4.2) and the scanner used
 * by every `consume*` routine in this tokenizer.
 *
 * Every UTF-16 code unit is treated as its own "code point" while scanning:
 * classification (ident-start, name, whitespace, digit, …) gives the same
 * answer for either half of a surrogate pair as it would for the combined
 * code point (both halves are non-ASCII), and every produced string is
 * either a substring of the input (surrogate pairs stay paired because
 * nothing splits them individually) or built through `consumeLiteralCodePoint`
 * / `String.fromCodePoint` — the places where the code point's numeric
 * value, not just its classification, must be right.
 *
 * Positions (`startIndex`/`endIndex`) are plain string indices into the
 * ORIGINAL input: CR, LF, FF and CRLF are each treated as a single
 * whitespace/newline event for tokenization purposes, but nothing is
 * rewritten first, so a CRLF pair stays two bytes long — required for
 * `expandText` to leave every untouched byte alone (R3).
 */

/**
An ASCII digit, U+0030-U+0039.
 */
function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9'
}

/**
A digit, or an ASCII hex letter A-F/a-f.
 */
function isHexDigit(c: string | undefined): boolean {
  if (isDigit(c)) return true
  return c !== undefined && ((c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))
}

/**
An ASCII letter, upper- or lowercase.
 */
function isLetter(c: string | undefined): boolean {
  return c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
}

/**
One [low, high] code point range, inclusive on both ends.
 */
type Range = readonly [number, number]

/**
 * The non-ASCII ranges accepted as an ident-start / ident code point. Not
 * every code point >= U+0080, which is what CSS Syntax Level 3's literal
 * definition reads: matched against the conformance corpus instead (R4),
 * which excludes symbol and punctuation ranges inside and past Latin-1
 * Supplement — U+00D7 MULTIPLICATION SIGN and U+00F7 DIVISION SIGN sit in
 * two of the gaps below, the same gaps real-world CSS tokenizers carve out
 * of the range for identifier safety. A surrogate code unit (lone, or half
 * of a pair) and U+0000 both qualify: `consumeLiteralCodePoint` reads either
 * back as U+FFFD, which IS ident-forming once decoded.
 */
const NON_ASCII_IDENT_RANGES: readonly Range[] = [
  [0x00, 0x00], // NUL, read back as U+FFFD by consumeLiteralCodePoint
  [0xb7, 0xb7],
  [0xc0, 0xd6],
  [0xd8, 0xf6],
  [0xf8, 0x3_7d],
  [0x3_7f, 0x1f_ff],
  [0x20_0c, 0x20_0d],
  [0x20_3f, 0x20_40],
  [0x20_70, 0x21_8f],
  [0x2c_00, 0x2f_ef],
  [0x30_01, 0xd7_ff],
  [0xd8_00, 0xdf_ff], // any surrogate code unit, lone or half of a pair
  [0xf9_00, 0xfd_cf],
  [0xfd_f0, 0xff_fd],
]

/**
Whether `c`'s code point falls in one of `NON_ASCII_IDENT_RANGES`.
 */
function isNonAsciiIdentCodePoint(c: string | undefined): boolean {
  if (c === undefined) return false
  const cp = c.codePointAt(0)!
  return NON_ASCII_IDENT_RANGES.some(([low, high]) => cp >= low && cp <= high)
}

/**
§4.2 "ident-start code point": a letter, the accepted non-ASCII range, or `_`.
 */
export function isIdentStartCodePoint(c: string | undefined): boolean {
  return c !== undefined && (isLetter(c) || isNonAsciiIdentCodePoint(c) || c === '_')
}

/**
§4.2 "ident code point": an ident-start code point, a digit, or `-`.
 */
export function isIdentCodePoint(c: string | undefined): boolean {
  return c !== undefined && (isIdentStartCodePoint(c) || isDigit(c) || c === '-')
}

const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\f'])

/**
§4.2 "whitespace": a newline (LF, CR or FF, CRLF handled by the caller as a pair of these), tab or space.
 */
export function isWhitespace(c: string | undefined): boolean {
  return c !== undefined && WHITESPACE_CHARS.has(c)
}

const NON_PRINTABLE_RANGES: readonly Range[] = [
  [0x00, 0x08],
  [0x0b, 0x0b],
  [0x0e, 0x1f],
  [0x7f, 0x7f],
]

/**
§4.2 "non-printable code point".
 */
export function isNonPrintable(c: string | undefined): boolean {
  if (c === undefined) return false
  const cp = c.codePointAt(0)!
  return NON_PRINTABLE_RANGES.some(([low, high]) => cp >= low && cp <= high)
}

export { isDigit, isHexDigit }

export class Scanner {
  readonly input: string
  pos = 0

  constructor(input: string) {
    this.input = input
  }

  advance(count = 1): void {
    this.pos += count
  }

  eof(offset = 0): boolean {
    return this.pos + offset >= this.input.length
  }

  peek(offset = 0): string | undefined {
    return this.input[this.pos + offset]
  }
}

/**
 * §4.3.8 "check if two code points are a valid escape": a `\` not followed
 * by a newline — an escape at EOF is also valid, and resolved to U+FFFD by
 * `consumeEscapedCodePoint`.
 */
export function isValidEscapeAt(s: Scanner, offset = 0): boolean {
  return s.peek(offset) === '\\' && s.peek(offset + 1) !== '\n'
}

/**
 * §4.3.9 "check if three code points would start an ident sequence".
 */
export function isIdentSequenceStartAt(s: Scanner, offset = 0): boolean {
  const c0 = s.peek(offset)
  if (c0 === '-') {
    const c1 = s.peek(offset + 1)
    if (c1 === '-' || isIdentStartCodePoint(c1)) return true
    return isValidEscapeAt(s, offset + 1)
  }
  if (isIdentStartCodePoint(c0)) return true
  // `isValidEscapeAt` already re-checks `s.peek(offset) === '\\'` itself, so
  // testing `c0` first here would only repeat that same comparison.
  return isValidEscapeAt(s, offset)
}

/**
 * §4.3.10 "check if three code points would start a number".
 */
export function isNumberStartAt(s: Scanner, offset = 0): boolean {
  const c0 = s.peek(offset)
  if (c0 === '+' || c0 === '-') {
    const c1 = s.peek(offset + 1)
    if (isDigit(c1)) return true
    return c1 === '.' && isDigit(s.peek(offset + 2))
  }
  if (c0 === '.') return isDigit(s.peek(offset + 1))
  return isDigit(c0)
}

/**
 * Consumes a CR, LF, FF or CRLF pair starting at the scanner's current
 * position, iff one is there. Used only where the spec's preprocessing step
 * (replacing CR/FF/CRLF with a single LF before tokenizing) would otherwise
 * matter for how MANY code points a step consumes: a line continuation in a
 * string (§4.3.5) and the optional whitespace after a hex escape (§4.3.7).
 */
export function didConsumeNewline(s: Scanner): boolean {
  if (s.peek() === '\r' && s.peek(1) === '\n') {
    s.advance(2)
    return true
  }
  if (s.peek() === '\n' || s.peek() === '\r' || s.peek() === '\f') {
    s.advance(1)
    return true
  }
  return false
}

/**
 * Reads one input code point into a VALUE being built (a name, string or URL
 * content) — never into `raw`, which always stays a plain slice of the
 * original bytes. Two of §4.2's preprocessing replacements apply here even
 * though nothing is preprocessed up front (step 3: "replace U+0000 with
 * U+FFFD"): a literal NUL, and a surrogate code unit that is not half of a
 * valid pair, both read back as U+FFFD.
 */
export function consumeLiteralCodePoint(s: Scanner): string {
  const cp = s.input.codePointAt(s.pos) ?? 0
  if (cp === 0 || (cp >= 0xd8_00 && cp <= 0xdf_ff)) {
    s.advance()
    return '�'
  }
  const width = cp > 0xff_ff ? 2 : 1
  const text = s.input.slice(s.pos, s.pos + width)
  s.advance(width)
  return text
}
