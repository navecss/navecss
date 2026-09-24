/**
 * Nave theming — OKLCH colour math (G1, the accepted theming specification).
 *
 * Pure, dependency-free colour math shared by the whole generation pipeline:
 * OKLab/OKLCH <-> linear-sRGB <-> sRGB conversions, in-gamut testing, gamut-relative
 * max-chroma search (R3, R4), and WCAG 2.x contrast ratio (R21/R38, T6).
 *
 * The generating direction (`oklchToSrgb` and everything built on it) is what the
 * pipeline runs today: seeds are authored as OKLCH and expand to CSS. The inverse
 * (`srgbToOklch`) converts a consumer-authored seed to OKLCH at ingest: called from
 * `seed-form-parsers.ts` (hex, rgb(), hsl()) and `seed-form-parsers-css-color-4.ts`
 * (`color(srgb …)`). Covered by a round-trip test that is the only check the forward
 * and inverse matrices agree.
 *
 * Conversion matrices are Björn Ottosson's OKLab constants (the ones CSS Color 4
 * itself cites). Kept in one module so every other file computes gamut and
 * contrast the same way (T6: "R21 must compute the same way or the verdicts do
 * not transfer").
 */

export interface Oklch {
  l: number // 0..1
  c: number // >= 0
  h: number // degrees, 0..360 (undefined at c === 0, callers must not read it then)
}

export interface LinearRgb {
  r: number
  g: number
  b: number
}

export interface Srgb {
  r: number
  g: number
  b: number
}

// ---------------------------------------------------------------------------
// OKLab <-> linear sRGB (Björn Ottosson's constants)
// ---------------------------------------------------------------------------

/**
 *
 */
function linearSrgbToOklab(rgb: LinearRgb): { a: number; b: number; l: number } {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    // 0.7827717662, not 0.8078151484 as this line read until 2026-08-16. The a and b rows
    // must each SUM TO ZERO, which is what makes a neutral grey (r = g = b, hence
    // l_ = m_ = s_) come out achromatic; the old value summed to 0.0250 and gave every
    // grey a phantom chroma. Dormant because nothing called this direction — see the
    // round-trip test in color-math.test.ts, which is what caught it.
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

/**
 *
 */
function oklabToLinearSrgb(lab: { a: number; b: number; l: number }): LinearRgb {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

// ---------------------------------------------------------------------------
// linear sRGB <-> sRGB (gamma / EOTF), and <-> OKLCH
// ---------------------------------------------------------------------------

/**
 *
 */
function linearToGamma(c: number): number {
  const abs = Math.abs(c)
  if (abs <= 0.0031308) return 12.92 * c
  return Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055)
}

/**
 *
 */
function gammaToLinear(c: number): number {
  const abs = Math.abs(c)
  if (abs <= 0.04045) return c / 12.92
  return Math.sign(c) * ((abs + 0.055) / 1.055) ** 2.4
}

/**
 *
 */
function linearRgbToSrgb(rgb: LinearRgb): Srgb {
  return { r: linearToGamma(rgb.r), g: linearToGamma(rgb.g), b: linearToGamma(rgb.b) }
}

/**
 * sRGB's transfer curve, decoded per channel. Exported for `css-color-4.ts`, because CSS Color 4
 * defines display-p3's transfer curve as this same function (`lin_P3` is `lin_sRGB` in the
 * specification's sample code); the two spaces differ in their primaries, not their curve.
 */
export function srgbToLinearRgb(rgb: Srgb): LinearRgb {
  return { r: gammaToLinear(rgb.r), g: gammaToLinear(rgb.g), b: gammaToLinear(rgb.b) }
}

/**
 *
 */
function oklchToOklab(c: Oklch): { a: number; b: number; l: number } {
  const hRad = (c.h * Math.PI) / 180
  return { l: c.l, a: c.c * Math.cos(hRad), b: c.c * Math.sin(hRad) }
}

/**
 *
 */
function oklchToLinearSrgb(c: Oklch): LinearRgb {
  return oklabToLinearSrgb(oklchToOklab(c))
}

/**
 *
 */
export function oklchToSrgb(c: Oklch): Srgb {
  return linearRgbToSrgb(oklchToLinearSrgb(c))
}

/**
 * OKLab to its polar form. Exported for `css-color-4.ts`'s XYZ route so every path into OKLCH
 * takes the hue and chroma the same way (including the `c === 0` hue convention).
 */
export function oklabToOklch(lab: { a: number; b: number; l: number }): Oklch {
  const c = Math.hypot(lab.a, lab.b)
  const h = c === 0 ? 0 : ((((Math.atan2(lab.b, lab.a) * 180) / Math.PI) % 360) + 360) % 360
  return { l: lab.l, c, h }
}

/**
 * The inverse of `oklchToSrgb`: recovers a colour's OKLCH coordinates from its rendered
 * sRGB value. No caller in the pipeline, which generates in the other direction; this is
 * what a rung-1b re-seed needs the day a consumer supplies a brand colour as a hex string
 * rather than an OKLCH triple.
 *
 * An achromatic sRGB input (`r === g === b`) is short-circuited to EXACTLY zero chroma,
 * rather than left to `oklabToOklch`'s general `Math.hypot`. The published Ottosson matrix
 * constants (`linearSrgbToOklab`'s `a`/`b` rows) do not sum to exactly zero at
 * 10-significant-figure precision, so a grey input left a residual chroma around 1e-7 and an
 * arbitrary hue (whichever direction that residual happened to fall in) instead of selecting
 * R3(a)'s achromatic branch — every achromatic sRGB seed except pure black (which cubes to
 * exact zero through every stage) picked up a hue-dependent tint invisible in a colour
 * swatch but present in the emitted CSS. Fixed at THIS boundary, the one conversion every
 * hex/rgb()/hsl()/color(srgb) seed passes through, rather than by widening the
 * achromatic-branch check downstream: that check fires at exactly zero and nowhere else for
 * a seed authored directly in OKLCH (a deliberate, tested contract — a consumer who writes a
 * tiny non-zero chroma on purpose is not asking for the achromatic branch).
 */
export function srgbToOklch(rgb: Srgb): Oklch {
  const lab = linearSrgbToOklab(srgbToLinearRgb(rgb))
  if (rgb.r === rgb.g && rgb.g === rgb.b) return { c: 0, h: 0, l: lab.l }
  return oklabToOklch(lab)
}

// ---------------------------------------------------------------------------
// Gamut testing (R4, R5)
// ---------------------------------------------------------------------------

const GAMUT_EPSILON = 1e-4

/**
Whether an sRGB triple is inside [0, 1] on every channel (with a small numeric tolerance).
 */
function isSrgbInGamut(rgb: Srgb): boolean {
  return (
    rgb.r >= -GAMUT_EPSILON &&
    rgb.r <= 1 + GAMUT_EPSILON &&
    rgb.g >= -GAMUT_EPSILON &&
    rgb.g <= 1 + GAMUT_EPSILON &&
    rgb.b >= -GAMUT_EPSILON &&
    rgb.b <= 1 + GAMUT_EPSILON
  )
}

/**
Whether an OKLCH colour renders inside sRGB.
 */
export function isOklchInGamut(c: Oklch): boolean {
  return isSrgbInGamut(oklchToSrgb(c))
}

/**
 * The maximum chroma at a given lightness and hue that stays inside sRGB (R3's
 * `maxChroma(L, H)`). Binary search: monotonic in chroma at fixed L, H (once
 * you leave the gamut you never re-enter it by raising chroma further), so a
 * simple bisection converges reliably and is the standard technique for this
 * exact problem (CSS Color 4 gamut mapping, colorjs.io's approach).
 */
export function maxChroma(l: number, h: number, precision = 1e-5): number {
  if (l <= 0 || l >= 1) return 0
  let lo = 0
  let hi = 0.4 // generous upper bound; OKLCH sRGB chroma never approaches this
  // hi must be out of gamut (or the search degenerates); grow it if not.
  while (isOklchInGamut({ l, c: hi, h }) && hi < 2) hi *= 2
  while (hi - lo > precision) {
    const mid = (lo + hi) / 2
    if (isOklchInGamut({ l, c: mid, h })) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Which of R5's normalization outcomes fired for one seed: `'none'` when the seed was already
 * in gamut, `'chroma-reduced'` for the interior (0, 1) lightness case, or `'mapped-to-white'`/
 * `'mapped-to-black'` at the two lightness endpoints (see `normalizeSeed`'s own docblock).
 */
export type SeedNormalization = 'chroma-reduced' | 'mapped-to-black' | 'mapped-to-white' | 'none'

/**
 * R5: normalize an out-of-gamut seed, once. A no-op (chroma unchanged) if the seed is already
 * in gamut. Follows CSS Color 4's gamut-mapping algorithm at the two lightness endpoints,
 * where no in-gamut chroma reduction can exist: a seed whose OKLCH lightness is at or above 1
 * maps to exactly white (`{l: 1, c: 0, h: 0}`), and one at or below 0 maps to exactly black
 * (`{l: 0, c: 0, h: 0}`), before any chroma reduction is attempted. Every other out-of-gamut
 * seed (lightness strictly inside (0, 1)) keeps the original constant-lightness, constant-hue
 * chroma reduction. The trigger is unchanged: only a seed that is ITSELF outside sRGB is
 * normalized — `oklch(1 0 0)` and `oklch(0 0 0)` are already in gamut and are left alone.
 */
export function normalizeSeed(seed: Oklch): {
  normalization: SeedNormalization
  normalized: boolean
  seed: Oklch
} {
  if (isOklchInGamut(seed)) return { normalization: 'none', normalized: false, seed }
  if (seed.l >= 1)
    return { normalization: 'mapped-to-white', normalized: true, seed: { c: 0, h: 0, l: 1 } }
  if (seed.l <= 0)
    return { normalization: 'mapped-to-black', normalized: true, seed: { c: 0, h: 0, l: 0 } }
  const cap = maxChroma(seed.l, seed.h)
  return {
    normalization: 'chroma-reduced',
    normalized: true,
    seed: { l: seed.l, c: Math.min(seed.c, cap), h: seed.h },
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
Formats an OKLCH triple as a CSS `oklch()` literal, fixed to 4 significant decimals.
 */
export function formatOklch(c: Oklch): string {
  return `oklch(${roundTo(c.l, 4)} ${roundTo(c.c, 4)} ${roundTo(c.h, 2)})`
}

/**
 *
 */
function roundTo(n: number, d: number): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

// ---------------------------------------------------------------------------
// WCAG 2.x contrast (R21/R38, T6)
// ---------------------------------------------------------------------------

/**
WCAG 2.x relative luminance of an sRGB colour (T6's reference rendering).
 */
function relativeLuminance(rgb: Srgb): number {
  const lin = srgbToLinearRgb(rgb)
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b
}

/**
 * WCAG 2.x contrast ratio `(L1+0.05)/(L2+0.05)` between two OKLCH colours, computed on the
 * rendered sRGB value per T6. Order-independent (always >= 1).
 */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(oklchToSrgb(a))
  const lb = relativeLuminance(oklchToSrgb(b))
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}
