/**
 * The CIE XYZ route to OKLCH, for the seed forms `color-math.ts`'s direct linear-sRGB
 * matrices cannot reach: `lab()` and `lch()` (CIE Lab, D50 white by CSS definition) and
 * `color(display-p3 …)`. `color(srgb …)` does NOT come through here: it is sRGB and takes
 * `srgbToOklch`'s existing path, which the published `color(srgb 0.25 0.5 0.75)` vector
 * verifies within tolerance with no second conversion.
 *
 * PROVENANCE, stated because it is what the acceptance criterion turns on. Every matrix and
 * constant in this module is TRANSCRIBED, never derived here and never recalled, from the CSS
 * Color 4 specification's own sample code, `css-color-4/conversions.js` in the
 * w3c/csswg-drafts repository at commit af8661bfe903aac7dbb9c5d1e1eccb725b8c331d (sha256 of
 * the fetched bytes: 73551b73012580c774012279ffbdc7e150f8b269ee4c446a3c042aed4719c153). The
 * prose for the same steps is https://drafts.csswg.org/css-color-4/#predefined-to-lab-oklab
 * and https://drafts.csswg.org/css-color-4/#color-conversion-code. A self-consistent but wrong
 * adaptation matrix passes every test that only checks itself and produces a silently wrong
 * brand colour with no error anywhere; the citation is what makes each number checkable
 * against its source. The functions are this package's own; only the numbers are copied. The
 * results are checked against the CSS Color 4 test suite's published vectors in
 * `test/theming/css-color-4-vectors.test.ts`.
 *
 * The chain, exactly as the sample code prescribes: `lab()` -> `Lab_to_XYZ` (D50) ->
 * `D50_to_D65` (Bradford) -> `XYZ_to_OKLab` -> OKLCH; `lch()` -> `LCH_to_Lab`, then the same;
 * `color(display-p3 …)` -> `lin_P3` (the sRGB transfer curve, per the sample code) ->
 * `lin_P3_to_XYZ` (D65, no adaptation) -> `XYZ_to_OKLab` -> OKLCH.
 */

import type { Oklch } from './color-math.ts'

import { oklabToOklch, srgbToLinearRgb } from './color-math.ts'

type Vec3 = readonly [number, number, number]
type Mat3 = readonly [Vec3, Vec3, Vec3]

export interface CieLab {
  /**
  CSS `lab()` lightness, 0 to 100 (not OKLab's 0 to 1).
   */
  l: number
  a: number
  b: number
}

export interface CieLch {
  /**
  CSS `lch()` lightness, 0 to 100.
   */
  l: number
  c: number
  /**
  Hue in degrees.
   */
  h: number
}

/**
The gamma-encoded display-p3 triple `color(display-p3 r g b)` writes, 0 to 1 inside the gamut.
 */
export interface DisplayP3 {
  r: number
  g: number
  b: number
}

/**
 * The D50 reference white, computed from the four-figure CIE x,y chromaticities exactly as the
 * sample code does (`D50`), never written as a decimal literal.
 */
const D50_WHITE: Vec3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585]

// CIE Lab's two constants as rational fractions, which is how the CIE standard now defines them.
const KAPPA = 24_389 / 27 // 29^3 / 3^3
const EPSILON = 216 / 24_389 // 6^3 / 29^3

/**
Bradford chromatic adaptation, D50 to D65 (`D50_to_D65`).
 */
const D50_TO_D65: Mat3 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
]

/**
Linear-light display-p3 to CIE XYZ, D65 (`lin_P3_to_XYZ`); the sample code's rational entries.
 */
const LIN_P3_TO_XYZ: Mat3 = [
  [608_311 / 1_250_200, 189_793 / 714_400, 198_249 / 1_000_160],
  [35_783 / 156_275, 247_089 / 357_200, 198_249 / 2_500_400],
  [0, 32_229 / 714_400, 5_220_557 / 5_000_800],
]

/**
 * XYZ (D65) to LMS, and LMS to OKLab (`XYZ_to_OKLab`'s two matrices), recalculated by the
 * specification for a consistent reference white at 64-bit precision.
 */
const XYZ_TO_LMS: Mat3 = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
]
const LMS_TO_OKLAB: Mat3 = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
]

/**
Row-major 3x3 matrix times a column vector.
 */
function multiply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ]
}

/**
 * CIE Lab to D50-relative XYZ (`Lab_to_XYZ`): the inverse of the CIE f() companding, with the
 * linear segment below epsilon, then scaled by the D50 white.
 */
function labToXyzD50(lab: CieLab): Vec3 {
  const fy = (lab.l + 16) / 116
  const fx = lab.a / 500 + fy
  const fz = fy - lab.b / 200
  const x = fx ** 3 > EPSILON ? fx ** 3 : (116 * fx - 16) / KAPPA
  const y = lab.l > KAPPA * EPSILON ? ((lab.l + 16) / 116) ** 3 : lab.l / KAPPA
  const z = fz ** 3 > EPSILON ? fz ** 3 : (116 * fz - 16) / KAPPA
  return [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]]
}

/**
 * D65-relative XYZ to OKLCH (`XYZ_to_OKLab`, then polar). `Math.cbrt` is sign-matched, which
 * the sample code relies on for out-of-gamut inputs; a general power function would not be.
 */
function xyzD65ToOklch(xyz: Vec3): Oklch {
  const lms = multiply(XYZ_TO_LMS, xyz)
  const [l, a, b] = multiply(LMS_TO_OKLAB, [
    Math.cbrt(lms[0]),
    Math.cbrt(lms[1]),
    Math.cbrt(lms[2]),
  ])
  return oklabToOklch({ a, b, l })
}

/**
 * CSS `lab()` (D50) to OKLCH, through Bradford adaptation to D65.
 *
 * A `lab()` input on the neutral axis (`a === 0 && b === 0`) is short-circuited to EXACTLY
 * zero chroma, mirroring `srgbToOklch`'s own achromatic short-circuit (`color-math.ts`) for
 * the same reason: the XYZ round-trip leaves a residual chroma around 1e-16 and an arbitrary
 * hue instead of hitting R3(a)'s achromatic branch predicate. `lch()` reaches this achromatic
 * too, since `lchToOklch` below turns a clamped-to-zero chroma into `a = c * cos(h) === 0` and
 * `b = c * sin(h) === 0` exactly — zero times any finite number is exactly zero in IEEE 754.
 */
export function labToOklch(lab: CieLab): Oklch {
  const result = xyzD65ToOklch(multiply(D50_TO_D65, labToXyzD50(lab)))
  if (lab.a === 0 && lab.b === 0) return { c: 0, h: 0, l: result.l }
  return result
}

/**
CSS `lch()` (D50) to OKLCH: polar to rectangular (`LCH_to_Lab`), then as `lab()`.
 */
export function lchToOklch(lch: CieLch): Oklch {
  const hRad = (lch.h * Math.PI) / 180
  return labToOklch({ a: lch.c * Math.cos(hRad), b: lch.c * Math.sin(hRad), l: lch.l })
}

/**
 * CSS `color(display-p3 …)` to OKLCH. The transfer curve is sRGB's (`lin_P3` is `lin_sRGB` in
 * the sample code), so `color-math.ts`'s decoder is reused; the primaries are not sRGB's, so
 * the matrix is display-p3's own and the result is D65 with no adaptation.
 *
 * A display-p3 input on its own neutral axis (`r === g === b`) is short-circuited to EXACTLY
 * zero chroma, the same achromatic short-circuit `labToOklch` and `srgbToOklch` apply on
 * their own paths, and for the same reason.
 */
export function displayP3ToOklch(p3: DisplayP3): Oklch {
  const linear = srgbToLinearRgb(p3)
  const result = xyzD65ToOklch(multiply(LIN_P3_TO_XYZ, [linear.r, linear.g, linear.b]))
  if (p3.r === p3.g && p3.g === p3.b) return { c: 0, h: 0, l: result.l }
  return result
}
