/**
 * R19, R21-R23: parses the three seed forms whose conversion is verified against the CSS
 * Color 4 test suite's published vectors (`test/theming/css-color-4-vectors.test.ts`): lab(),
 * lch(), and color() in its two accepted spaces. lab(), lch() and color(display-p3 …) take the
 * CIE XYZ route in `css-color-4.ts`; color(srgb …) is sRGB and takes `color-math.ts`'s direct
 * path, the same one rgb() and hex use. Argument splitting, alpha and hue tokens are shared with
 * `seed-form-parsers.ts` via `seed-channel-split.ts` so all seven forms read them one way, and
 * refusals go through `seed-refusal.ts`'s one shape (R21/R22).
 */

import type { Oklch, Srgb } from './color-math.ts'
import type { ColorFunctionSpace } from './seed-input.ts'

import { srgbToOklch } from './color-math.ts'
import { displayP3ToOklch, labToOklch, lchToOklch } from './css-color-4.ts'
import {
  isNoneKeyword,
  parseHueDeg,
  readNumericToken,
  splitChannelArgs,
} from './seed-channel-split.ts'
import { badChannelValue, checkOpaqueAlpha, unsupportedColourSpace } from './seed-refusal.ts'

/**
 * The two `color()` colour spaces the entry point converts (`AC-token-build-19`'s own
 * restriction). Every other predefined space is refused by name in `ingestColor`.
 */
const COLOR_FUNCTION_SPACES: ReadonlySet<string> = new Set<ColorFunctionSpace>([
  'display-p3',
  'srgb',
])

/**
 * Parses a lab()/lch() lightness token: a number, a percentage where 100% is 100 (CSS Color
 * 4's own scale for these two functions, not OKLCH's 0-1), or `none`. `none` is checked on the
 * token as written, before the `%` branch, so it is only ever recognised as a whole channel
 * value (see `isNoneKeyword`'s own docblock).
 */
function parseLabLightness(token: string): number {
  if (isNoneKeyword(token)) return 0
  if (token.endsWith('%')) return readNumericToken(token.slice(0, -1))
  return readNumericToken(token)
}

/**
 * Parses a signed lab() axis or an lch() chroma token: a number, a percentage of the
 * reference CSS Color 4 assigns to 100% for that channel (125 for `a`/`b`, 150 for `C`), or
 * `none`.
 */
function parseScaledChannel(token: string, percentReference: number): number {
  if (isNoneKeyword(token)) return 0
  if (token.endsWith('%')) return (readNumericToken(token.slice(0, -1)) / 100) * percentReference
  return readNumericToken(token)
}

/**
 * Parses a color() channel token: a number where 1 is the gamut edge, a percentage where
 * 100% is 1, or `none`. Deliberately NOT clamped, unlike rgb()'s channels: CSS Color 4 clamps
 * rgb() at parse time but defines a color() value past the edge as an out-of-gamut colour,
 * which R5's normalisation then handles as its own second act.
 */
function parseColorChannel(token: string): number {
  if (isNoneKeyword(token)) return 0
  if (token.endsWith('%')) return readNumericToken(token.slice(0, -1)) / 100
  return readNumericToken(token)
}

/**
 * CSS Color 4 §9.3: lab()/lch() lightness is clamped to [0, 100] at parsed-value time, exactly
 * as oklch()'s own lightness is clamped to [0, 1] (`seed-form-parsers.ts`'s `ingestOklch`).
 */
function clampCieLightness(l: number): number {
  return Math.min(100, Math.max(0, l))
}

/**
Reads exactly three channel tokens from a function's split argument list, refusing any other count.
 */
function readThreeChannels(input: string, form: string, parts: string[]): [string, string, string] {
  if (parts.length !== 3) {
    throw badChannelValue(input, form, `it needs three channels and this has ${parts.length}.`)
  }
  return [parts[0]!, parts[1]!, parts[2]!]
}

/**
Refuses a channel triple any member of which did not read as a number.
 */
function checkFiniteChannels(input: string, form: string, channels: readonly number[]): void {
  if (channels.some((n) => !Number.isFinite(n))) {
    throw badChannelValue(
      input,
      form,
      'one or more of its channel values could not be read as a number.',
    )
  }
}

/**
 * Parses a lab() argument list (CIE Lab, D50) to OKLCH through the CSS Color 4 route,
 * refusing a wrong channel count, an unreadable channel, or a non-opaque alpha. A lightness
 * outside [0, 100] is CSS-lawful input, not a refusal: CSS Color 4 §9.3 clamps it to that
 * range at parsed-value time (the same rule `ingestOklch` applies on OKLCH's own scale).
 */
export function ingestLab(input: string, args: string): Oklch {
  const { alpha, parts } = splitChannelArgs(args)
  const [lToken, aToken, bToken] = readThreeChannels(input, 'lab()', parts)
  const l = parseLabLightness(lToken)
  const a = parseScaledChannel(aToken, 125)
  const b = parseScaledChannel(bToken, 125)
  checkFiniteChannels(input, 'lab()', [l, a, b])
  checkOpaqueAlpha(input, alpha, 'lab()')
  return labToOklch({ a, b, l: clampCieLightness(l) })
}

/**
 * Parses an lch() argument list (CIE LCH, D50) to OKLCH through the CSS Color 4 route,
 * refusing a wrong channel count, an unreadable channel, or a non-opaque alpha. A lightness
 * outside [0, 100] and a negative chroma are each CSS-lawful input, not a refusal: CSS Color 4
 * §9.3 clamps lightness to [0, 100] and chroma to >= 0 at parsed-value time.
 */
export function ingestLch(input: string, args: string): Oklch {
  const { alpha, parts } = splitChannelArgs(args)
  const [lToken, cToken, hToken] = readThreeChannels(input, 'lch()', parts)
  const l = parseLabLightness(lToken)
  const c = parseScaledChannel(cToken, 150)
  const h = parseHueDeg(hToken)
  checkFiniteChannels(input, 'lch()', [l, c, h])
  checkOpaqueAlpha(input, alpha, 'lch()')
  return lchToOklch({ c: Math.max(0, c), h, l: clampCieLightness(l) })
}

/**
 * Parses a color() argument list (a colour space, then three channels) to OKLCH, refusing a
 * colour space other than `srgb` or `display-p3` by name, a wrong channel count, an unreadable
 * channel, or a non-opaque alpha. Returns the space alongside the value so the build record can
 * name it (R20).
 */
export function ingestColor(
  input: string,
  args: string,
): { space: ColorFunctionSpace; value: Oklch } {
  const { alpha, parts } = splitChannelArgs(args)
  const spaceToken = parts[0]
  if (spaceToken === undefined) {
    throw badChannelValue(
      input,
      'color()',
      'it needs a colour space and three channels and this has neither.',
    )
  }
  const space = spaceToken.toLowerCase()
  if (!COLOR_FUNCTION_SPACES.has(space)) throw unsupportedColourSpace(input, spaceToken)
  const [rToken, gToken, bToken] = readThreeChannels(input, 'color()', parts.slice(1))
  const rgb: Srgb = {
    b: parseColorChannel(bToken),
    g: parseColorChannel(gToken),
    r: parseColorChannel(rToken),
  }
  checkFiniteChannels(input, 'color()', [rgb.r, rgb.g, rgb.b])
  checkOpaqueAlpha(input, alpha, 'color()')
  return {
    space: space as ColorFunctionSpace,
    value: space === 'srgb' ? srgbToOklch(rgb) : displayP3ToOklch(rgb),
  }
}
