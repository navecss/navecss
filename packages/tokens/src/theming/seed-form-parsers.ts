/**
 * R21-R23: parses the four seed forms that take `color-math.ts`'s direct path (hex, rgb(),
 * hsl(), oklch()) into OKLCH. The standard closed-form HSL -> sRGB conversion used here is CSS
 * Color's own algorithm, exact by definition. lab(), lch() and color() live in
 * `seed-form-parsers-css-color-4.ts` (R19); both files read alpha, hue and channel tokens off
 * `seed-channel-split.ts`'s shared tokenising rather than one importing the other's internals.
 */

import type { Oklch, Srgb } from './color-math.ts'

import { srgbToOklch } from './color-math.ts'
import {
  isNoneKeyword,
  parseHueDeg,
  readNumericToken,
  splitChannelArgs,
} from './seed-channel-split.ts'
import { badChannelValue, checkOpaqueAlpha, clamp01 } from './seed-refusal.ts'

export const RECOGNISED_ALIASED_FUNCTIONS: Record<string, 'hsl' | 'oklch' | 'rgb'> = {
  hsl: 'hsl',
  hsla: 'hsl',
  oklch: 'oklch',
  rgb: 'rgb',
  rgba: 'rgb',
}

/**
 * Parses one rgb() channel token (0-255, a percentage, or `none`) to a 0-1 fraction. `none` is
 * checked on the token as written, before the `%` branch, so it is only ever recognised as a
 * whole channel value (see `isNoneKeyword`'s own docblock).
 */
function parseRgbChannel(token: string): number {
  if (isNoneKeyword(token)) return 0
  if (token.endsWith('%')) return clamp01(readNumericToken(token.slice(0, -1)) / 100)
  return clamp01(readNumericToken(token) / 255)
}

/**
 * Parses a percentage token, or `none`, to a 0-1 fraction.
 */
function parsePercent01(token: string): number {
  if (isNoneKeyword(token)) return 0
  const t = token.endsWith('%') ? token.slice(0, -1) : token
  return clamp01(readNumericToken(t) / 100)
}

/**
 * CSS Color 4 §4.1.2: the `none` keyword is legal only in the modern, space-separated syntax
 * of a colour function — legacy comma syntax (`rgb(none, 0, 0)`, `hsl(none, 0%, 50%)`) does
 * not allow it. `oklch()` has no legacy comma form to guard.
 */
function refuseNoneInLegacySyntax(
  input: string,
  form: string,
  parts: readonly string[],
  isLegacySyntax: boolean,
): void {
  if (!isLegacySyntax) return
  if (parts.some((part) => isNoneKeyword(part))) {
    throw badChannelValue(
      input,
      form,
      'it uses the `none` keyword, which legacy comma-separated syntax does not allow; write the seed in modern space-separated syntax instead.',
    )
  }
}

/**
The RGB' triple for one 60°-wide HSL hue sector, before adding the lightness offset `m`.
 */
function hslSectorRgbPrime(hp: number, c: number, x: number): Srgb {
  switch (Math.floor(hp) % 6) {
    case 0: {
      return { b: 0, g: x, r: c }
    }
    case 1: {
      return { b: 0, g: c, r: x }
    }
    case 2: {
      return { b: x, g: c, r: 0 }
    }
    case 3: {
      return { b: c, g: x, r: 0 }
    }
    case 4: {
      return { b: c, g: 0, r: x }
    }
    default: {
      return { b: x, g: 0, r: c }
    }
  }
}

/**
 * Converts an HSL triple to sRGB via CSS Color's standard closed-form algorithm.
 */
function hslToSrgb(h: number, s: number, l: number): Srgb {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = hue / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2
  const prime = hslSectorRgbPrime(hp, c, x)
  return { b: prime.b + m, g: prime.g + m, r: prime.r + m }
}

/**
 * Parses hex digits (3, 4, 6 or 8 of them) to OKLCH, refusing a non-opaque alpha channel.
 */
export function ingestHex(input: string, digits: string): Oklch {
  let r: number
  let g: number
  let b: number
  let alphaHex: string | undefined
  switch (digits.length) {
    case 3: {
      r = Number.parseInt(digits[0]! + digits[0]!, 16)
      g = Number.parseInt(digits[1]! + digits[1]!, 16)
      b = Number.parseInt(digits[2]! + digits[2]!, 16)
      break
    }
    case 4: {
      r = Number.parseInt(digits[0]! + digits[0]!, 16)
      g = Number.parseInt(digits[1]! + digits[1]!, 16)
      b = Number.parseInt(digits[2]! + digits[2]!, 16)
      alphaHex = digits[3]! + digits[3]!
      break
    }
    case 6: {
      r = Number.parseInt(digits.slice(0, 2), 16)
      g = Number.parseInt(digits.slice(2, 4), 16)
      b = Number.parseInt(digits.slice(4, 6), 16)
      break
    }
    default: {
      r = Number.parseInt(digits.slice(0, 2), 16)
      g = Number.parseInt(digits.slice(2, 4), 16)
      b = Number.parseInt(digits.slice(4, 6), 16)
      alphaHex = digits.slice(6, 8)
    }
  }
  if (alphaHex !== undefined) checkOpaqueAlpha(input, Number.parseInt(alphaHex, 16) / 255, 'hex')
  return srgbToOklch({ b: b / 255, g: g / 255, r: r / 255 })
}

/**
 * Parses an rgb()/rgba() argument list to OKLCH, refusing a wrong channel count, an unreadable
 * channel, or a non-opaque alpha.
 */
export function ingestRgb(input: string, args: string): Oklch {
  const { alpha, isLegacySyntax, parts } = splitChannelArgs(args)
  if (parts.length !== 3) {
    throw badChannelValue(input, 'rgb()', `it needs three channels and this has ${parts.length}.`)
  }
  refuseNoneInLegacySyntax(input, 'rgb()', parts, isLegacySyntax)
  const r = parseRgbChannel(parts[0]!)
  const g = parseRgbChannel(parts[1]!)
  const b = parseRgbChannel(parts[2]!)
  if ([r, g, b].some((n) => !Number.isFinite(n))) {
    throw badChannelValue(
      input,
      'rgb()',
      'one or more of its channel values could not be read as a number.',
    )
  }
  checkOpaqueAlpha(input, alpha, 'rgb()')
  return srgbToOklch({ b, g, r })
}

/**
 * Parses an hsl()/hsla() argument list to OKLCH, refusing a wrong channel count, an unreadable
 * channel, or a non-opaque alpha.
 */
export function ingestHsl(input: string, args: string): Oklch {
  const { alpha, isLegacySyntax, parts } = splitChannelArgs(args)
  if (parts.length !== 3) {
    throw badChannelValue(input, 'hsl()', `it needs three channels and this has ${parts.length}.`)
  }
  refuseNoneInLegacySyntax(input, 'hsl()', parts, isLegacySyntax)
  const h = parseHueDeg(parts[0]!)
  const s = parsePercent01(parts[1]!)
  const l = parsePercent01(parts[2]!)
  if ([h, s, l].some((n) => !Number.isFinite(n))) {
    throw badChannelValue(
      input,
      'hsl()',
      'one or more of its channel values could not be read as a number.',
    )
  }
  checkOpaqueAlpha(input, alpha, 'hsl()')
  return srgbToOklch(hslToSrgb(h, s, l))
}

/**
 * Parses an oklch() lightness token: a number, a percentage where 100% is 1, or `none`.
 */
function parseOklchLightness(token: string): number {
  if (isNoneKeyword(token)) return 0
  if (token.endsWith('%')) return readNumericToken(token.slice(0, -1)) / 100
  return readNumericToken(token)
}

/**
 * Parses an oklch() chroma token: a number, a percentage where 100% is 0.4 (CSS Color 4's own
 * reference for oklch() chroma), or `none`.
 */
function parseOklchChroma(token: string): number {
  if (isNoneKeyword(token)) return 0
  if (token.endsWith('%')) return (readNumericToken(token.slice(0, -1)) / 100) * 0.4
  return readNumericToken(token)
}

/**
 * Parses an oklch() argument list to OKLCH (the identity conversion), refusing a wrong channel
 * count, an unreadable channel, or a non-opaque alpha. A lightness or chroma outside the range
 * oklch() defines is CSS-lawful input, not a refusal: CSS Color 4 §9.4 clamps lightness to
 * [0%, 100%] and chroma to >= 0 at parsed-value time (verbatim: lightness "values less than 0%
 * or 0.0 must be clamped to 0% at parsed-value time; values greater than 100% or 1.0 are
 * clamped to 100% at parsed-value time", chroma "if the provided value is negative, it is
 * clamped to 0 at parsed-value time"), so this parser does the same, on both the number and
 * the percentage form of each channel.
 */
export function ingestOklch(input: string, args: string): Oklch {
  const { alpha, parts } = splitChannelArgs(args)
  if (parts.length !== 3) {
    throw badChannelValue(input, 'oklch()', `it needs three channels and this has ${parts.length}.`)
  }
  const l = parseOklchLightness(parts[0]!)
  const c = parseOklchChroma(parts[1]!)
  const h = parseHueDeg(parts[2]!)
  if ([l, c, h].some((n) => !Number.isFinite(n))) {
    throw badChannelValue(
      input,
      'oklch()',
      'one or more of its channel values could not be read as a number.',
    )
  }
  checkOpaqueAlpha(input, alpha, 'oklch()')
  return { c: Math.max(0, c), h, l: clamp01(l) }
}
