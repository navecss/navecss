/**
 * AC-token-build-19 covers: R19. The `lab()`, `lch()` and
 * `color()` seed forms (the latter restricted to `srgb` and `display-p3`) are converted to
 * OKLCH at ingest THROUGH THE SHIPPED ENTRY POINT, and the triple each resolves to matches a
 * PUBLISHED CSS Color 4 test vector within the pipeline's stated numeric tolerance.
 *
 * Provenance of every number below, because it is the whole point of the criterion: NONE is
 * recalled, derived here, or read back out of the implementation. The four primary rows are
 * WPT computed-value and reftest vectors (the CSS Color 4 test suite), fetched as exact bytes
 * at pinned commits and reproduced against the specification's own sample code
 * (`css-color-4/conversions.js`) on 2026-09-04, as part of the architecture reviewer's
 * handover; the digests and the reproduction script are recorded separately. The corroborating
 * rows are the Editor's Draft's own example blocks, printed at four significant figures, so
 * they are held to a looser bound and are NOT the fixture the criterion rests on.
 *
 * Rows 1 and 2 pair a `lab()` and an `lch()` input with an `oklch()` expectation published in
 * the same WPT file for the same source colour, `color(srgb 0.25 0.5 0.75)` (lines 850, 854 and
 * 856 are three assertions on that one colour). Both are D50 by CSS definition, so they are the
 * D50 vectors the criterion names, and they are the only rows that exercise the Bradford
 * D50-to-D65 adaptation. Row 4 is outside the sRGB gamut on purpose: R5
 * rider 4 makes form acceptance and gamut normalisation two acts, and this row checks the FIRST
 * act, so it reads the build record's `input.value` (the conversion's own output) and never the
 * normalised `resolved` triple.
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Oklch } from '../../src/theming/color-math.ts'

import { build } from '../../src/facade.ts'
import { ingestSeed } from '../../src/theming/seed-ingest.ts'

/**
 * The pipeline states exactly one numeric tolerance, `SAME_COLOUR_TOLERANCE = 1e-4` on OKLCH
 * `l` and `c` (`build-record.ts`, the "is this step the seed colour" test), and none for hue;
 * the seed suite's existing hue precision is `toBeCloseTo(h, 2)`, i.e. 5e-3 degrees. Both are
 * hand-typed here rather than imported: a fixture that reads its own tolerance out of the code
 * under test would loosen itself the day the constant moves.
 *
 * `1e-4` deliberately holds tighter than WPT's OWN epsilon on the assertions behind rows 1-3
 * (`color-computed-relative-color.html` lines 850/854/856): `0.02` there ("larger values means
 * larger epsilon", the WPT file's own wording). That is not slack this fixture failed to
 * inherit: WPT's `0.02` tolerates real BROWSER implementation variance against a printed
 * reference, whereas this fixture reproduces the specification's own deterministic sample code
 * and compares that reproduction to itself, a tighter, apples-to-apples comparison with no
 * browser variance to absorb. Confirmed exercisable rather than a bound nothing can hit:
 * perturbing one untested transcribed constant produces residuals of roughly 1e-3 to 1.4e-3,
 * an order of magnitude past `1e-4` (round-review mutation test, architecture and quality
 * review, 2026-09-04).
 *
 * Row 4's expectation (`color(display-p3 0 1 0)`) is sourced from a REFTEST's authored comment
 * (`oklch-008.html`, `rel=match`), not from a machine-checked computed-value assertion the way
 * rows 1-3 are, a slightly weaker link in the provenance chain, even though it passes at the
 * same `1e-4` bound.
 */
const LC_TOLERANCE = 1e-4
const HUE_TOLERANCE_DEG = 5e-3

/**
 * Editor's Draft example blocks print four to five significant figures, so their residual
 * against the sample code sits around 1e-4 and 3e-2 degrees for a reason unrelated to
 * correctness. Held at this looser bound, and deliberately never at the fixture tolerance.
 */
const CORROBORATING_LC_TOLERANCE = 2e-4
const CORROBORATING_HUE_TOLERANCE_DEG = 5e-2

// `oklch(from color(srgb 0.25 0.5 0.75) l c h)` computes to this, WPT
// css/css-color/parsing/color-computed-relative-color.html @ 464d084, line 856.
const WPT_SRGB_QUARTER_HALF_THREE_QUARTER: Oklch = { c: 0.118266, h: 250.532, l: 0.58555 }

const PRIMARY_ROWS: readonly {
  expected: Oklch
  form: string
  input: string
  source: string
}[] = [
  {
    expected: WPT_SRGB_QUARTER_HALF_THREE_QUARTER,
    form: 'lab() (D50)',
    input: 'lab(51.4321 -5.22826 -40.1438)',
    source:
      'web-platform-tests/wpt @ 464d084866c67cdc6b97a060e78cf650b623446b, css/css-color/parsing/color-computed-relative-color.html line 850 (the lab() value) and line 856 (the oklch() value)',
  },
  {
    expected: WPT_SRGB_QUARTER_HALF_THREE_QUARTER,
    form: 'lch() (D50)',
    input: 'lch(51.4321 40.4828 262.58)',
    source: 'same file and commit, line 854 (the lch() value) and line 856',
  },
  {
    expected: WPT_SRGB_QUARTER_HALF_THREE_QUARTER,
    form: 'color(srgb …)',
    input: 'color(srgb 0.25 0.5 0.75)',
    source: 'same file and commit, line 856, a direct pair',
  },
  {
    // `oklch(84.883% 0.36853 145.645)`, "green color(display-p3 0 1 0) converted to OKLCH".
    expected: { c: 0.36853, h: 145.645, l: 0.84883 },
    form: 'color(display-p3 …)',
    input: 'color(display-p3 0 1 0)',
    source:
      'web-platform-tests/wpt @ 5f49cdf9eda04cf4c055ab35cb96361b092f4f64, css/css-color/oklch-008.html (rel=match greensquare-display-p3-ref.html @ 2537e597960874b2a6a641dde9c6d3b1ed3d54ca, whose background is color(display-p3 0 1 0))',
  },
]

const CORROBORATING_ROWS: readonly { expected: Oklch; input: string; source: string }[] = [
  {
    expected: { c: 0.12332, h: 21.555, l: 0.40101 },
    input: 'lab(29.2345% 39.3825 20.0664)',
    source:
      'drafts.csswg.org/css-color-4/ #ex-lab-samples with #ex-oklch-samples (Overview.bs @ cbca081)',
  },
  {
    expected: { c: 0.12332, h: 21.555, l: 0.40101 },
    input: 'lch(29.2345% 44.2 27)',
    source: '#ex-lch-samples with #ex-oklch-samples',
  },
  {
    expected: { c: 0.12403, h: 247.996, l: 0.72322 },
    input: 'lab(67.5345 -8.6911 -41.6019)',
    source: '#ex-lab-samples with #ex-oklch-samples',
  },
  {
    expected: { c: 0.3685, h: 145.6, l: 0.8488 },
    input: 'color(display-p3 0 1 0)',
    source: '#ex-gamut-clip-acceptable',
  },
  {
    expected: { c: 0.3221, h: 142.3, l: 0.8079 },
    input: 'color(display-p3 0.3265 0.9165 0)',
    source: '#ex-gamut-clip-good',
  },
]

function scratchDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'navecss-tokens-css-color-4-'))
}

/**
 * The OKLCH the entry point's ingest produced for `seed`, read from the build record it wrote:
 * `input.value` is the conversion's own output BEFORE gamut normalisation (R20's
 * input/resolved split is what makes the first act observable on its own).
 */
async function ingestedThroughEntryPoint(seed: string): Promise<Oklch> {
  const outDir = scratchDir()
  await build({ outDir, seed })
  const record = JSON.parse(readFileSync(path.join(outDir, 'build-record.json'), 'utf8')) as {
    seeds: { primary: { input: { value: Oklch } } }
  }
  return record.seeds.primary.input.value
}

/**
Per-channel absolute residual of `actual` against a published `expected` triple.
 */
function residual(actual: Oklch, expected: Oklch): Oklch {
  return {
    c: Math.abs(actual.c - expected.c),
    h: Math.abs(actual.h - expected.h),
    l: Math.abs(actual.l - expected.l),
  }
}

describe('AC-token-build-19 covers: R19', () => {
  it.each(PRIMARY_ROWS)(
    '$form: $input ingested through the shipped entry point matches the published vector within |Δl|,|Δc| < 1e-4 and |Δh| < 5e-3° ($source)',
    async ({ expected, input }) => {
      const delta = residual(await ingestedThroughEntryPoint(input), expected)
      expect(delta.l).toBeLessThan(LC_TOLERANCE)
      expect(delta.c).toBeLessThan(LC_TOLERANCE)
      expect(delta.h).toBeLessThan(HUE_TOLERANCE_DEG)
    },
  )

  it.each(CORROBORATING_ROWS)(
    "corroborating, at the Editor's Draft's own printed precision: $input matches the spec example within 2e-4 and 5e-2° ($source)",
    ({ expected, input }) => {
      const delta = residual(ingestSeed(input), expected)
      expect(delta.l).toBeLessThan(CORROBORATING_LC_TOLERANCE)
      expect(delta.c).toBeLessThan(CORROBORATING_LC_TOLERANCE)
      expect(delta.h).toBeLessThan(CORROBORATING_HUE_TOLERANCE_DEG)
    },
  )

  it('the D50 reference white, lab(100 0 0), adapts to OKLab lightness 1 with zero chroma (an identity the D50 literal and the Bradford matrix must satisfy together)', () => {
    const white = ingestSeed('lab(100 0 0)')
    expect(Math.abs(white.l - 1)).toBeLessThan(LC_TOLERANCE)
    expect(white.c).toBeLessThan(LC_TOLERANCE)
  })

  it('the module cites the pinned commit and digest of the transcription source, and pins two spot-checked literals against them; transcription FIDELITY itself is established by the vector rows above, not by this test', () => {
    // This is a pure string-containment check over the module's own source: it cannot establish
    // that the cited commit's actual bytes equal what is transcribed, and it does not spot-check
    // the other untested constants (D50_WHITE, KAPPA/EPSILON, the full LIN_P3_TO_XYZ matrix, the
    // remaining matrix entries), so a self-consistent-but-wrong transcription of any of those would
    // pass this test outright. What actually discharges "transcribed, never hand-derived" is the
    // PRIMARY_ROWS/CORROBORATING_ROWS vector tests above: perturbing a single untested digit in
    // this module fails 6 of the 11 tests in this file, off by an order of magnitude past their
    // tolerance (round-review mutation test, quality review, 2026-09-04). This test only pins the
    // citation, the digest, and two literals as a discoverability aid for a reader auditing
    // provenance by eye.
    const source = readFileSync(
      path.resolve(import.meta.dirname, '../../src/theming/css-color-4.ts'),
      'utf8',
    )
    expect(source).toContain('af8661bfe903aac7dbb9c5d1e1eccb725b8c331d')
    expect(source).toContain('73551b73012580c774012279ffbdc7e150f8b269ee4c446a3c042aed4719c153')
    expect(source).toContain('0.955473421488075')
    expect(source).toContain('0.819022437996703')
    // Written with the digit separator this repository's lint applies to integer literals.
    expect(source).toContain('24_389 / 27')
  })
})
