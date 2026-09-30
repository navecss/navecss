import type {
  DimensionStructured,
  NumberStructured,
  NumberType,
  PercentageStructured,
  Token,
} from './token-types.ts'

/**
 * §4.3.13 "consume a number" and §4.3.3 "consume a numeric token".
 */
import { consumeName } from './escape.ts'
import { isDigit, isIdentSequenceStartAt, type Scanner } from './scanner.ts'

interface NumberResult {
  readonly repr: string
  readonly value: number
  readonly type: NumberType
  readonly sign: '+' | '-' | undefined
}

/**
 *
 */
function consumeSign(s: Scanner): '+' | '-' | undefined {
  const c = s.peek()
  if (c !== '+' && c !== '-') return undefined
  s.advance()
  return c
}

/**
 *
 */
function consumeDigitRun(s: Scanner): string {
  let digits = ''
  while (isDigit(s.peek())) {
    digits += s.peek()
    s.advance()
  }
  return digits
}

/**
The fraction part (`.digits`), or `''` when there is none.
 */
function consumeFraction(s: Scanner): string {
  if (s.peek() !== '.' || !isDigit(s.peek(1))) return ''
  s.advance()
  return `.${consumeDigitRun(s)}`
}

/**
The exponent part (`e`/`E`, optional sign, digits), or `''` when there is none.
 */
function consumeExponent(s: Scanner): string {
  const e = s.peek()
  if (e !== 'e' && e !== 'E') return ''
  const afterE = s.peek(1)
  const expSign = afterE === '+' || afterE === '-' ? afterE : ''
  const digitsOffset = expSign ? 2 : 1
  if (!isDigit(s.peek(digitsOffset))) return ''
  s.advance(digitsOffset)
  return `${e}${expSign}${consumeDigitRun(s)}`
}

/**
 * §4.3.13 "consume a number". Returns the representation string (used to
 * compute the numeric value) split into its sign / body so the caller can
 * report `signCharacter` only when one was authored.
 */
function consumeNumber(s: Scanner): NumberResult {
  const sign = consumeSign(s)
  const integer = consumeDigitRun(s)
  const fraction = consumeFraction(s)
  const exponent = consumeExponent(s)
  const repr = (sign ?? '') + integer + fraction + exponent
  const type: NumberType = fraction || exponent ? 'number' : 'integer'
  return { repr, value: Number(repr), type, sign }
}

/**
§4.3.3 "consume a numeric token".
 */
export function consumeNumericToken(s: Scanner, start: number): Token {
  const num = consumeNumber(s)
  const signCharacter = num.sign ? ({ signCharacter: num.sign } as const) : {}

  if (isIdentSequenceStartAt(s)) {
    const unit = consumeName(s)
    const structured: DimensionStructured = {
      value: num.value,
      type: num.type,
      unit,
      ...signCharacter,
    }
    return {
      type: 'dimension-token',
      raw: s.input.slice(start, s.pos),
      startIndex: start,
      endIndex: s.pos,
      structured,
    }
  }

  if (s.peek() === '%') {
    s.advance()
    const structured: PercentageStructured = { value: num.value, ...signCharacter }
    return {
      type: 'percentage-token',
      raw: s.input.slice(start, s.pos),
      startIndex: start,
      endIndex: s.pos,
      structured,
    }
  }

  const structured: NumberStructured = { value: num.value, type: num.type, ...signCharacter }
  return {
    type: 'number-token',
    raw: s.input.slice(start, s.pos),
    startIndex: start,
    endIndex: s.pos,
    structured,
  }
}
