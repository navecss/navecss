/**
 * The CLI's consumer-invocable composition (R6, R7, R9, R10, R16, R24, R25, R26). Distinct from
 * `build-step.ts`'s `composeThemingOutputs`/`withThemingLayer`, which is Nave's own build
 * path (scans core's real source, ships `core-contract.json` + `contact-sheet.html`, fails
 * the build on a contrast verdict, emits into `@layer tokens.defaults`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PerStepOverrides, Seeds } from '../../src/theming/pipeline.ts'

import { composeConsumerBuild, CONSUMER_LAYER } from '../../src/theming/consumer-build.ts'
import { FEEDBACK_SHARED_IDENTITY_NOTICE, RETHEMING_NOTICE } from '../../src/theming/copy-lint.ts'
import { emitCss } from '../../src/theming/emit.ts'
import { runPipeline } from '../../src/theming/pipeline.ts'
import { codeOnly } from './code-only.ts'

const CONSUMER_BUILD_SOURCE = path.resolve(
  import.meta.dirname,
  '../../src/theming/consumer-build.ts',
)

/**
 * Row `F3` (round 2): the OTHER half of the consumer-invocable build path.
 * `AC-token-build-06`'s second clause scopes its scan to "the consumer-invocable build path",
 * which is `facade.build` — and `facade.build` reaches `builder.ts`, `formats.ts`, `reader.ts`
 * and `overrides.ts` as well as this file's theming half. `formats.ts` writes FIVE of R7's
 * seven committed artifacts, so a wall-clock timestamp there ships into files R7 tells the
 * consumer to COMMIT while a walk rooted at `consumer-build.ts` alone stays green.
 */
const FACADE_SOURCE = path.resolve(import.meta.dirname, '../../src/facade.ts')

const FORMATS_SOURCE = path.resolve(import.meta.dirname, '../../src/formats.ts')

/**
 * Row `R3-02` (verifier-gated tail): the consumer-invocable build path's own ENTRY POINT —
 * what `bin: navecss-tokens` resolves to. Nothing imports it, so it is unreachable from the
 * other two roots and has to be a root itself. It constructs the options object every artifact
 * is composed from, so a `process.env`-derived default here would vary a COMMITTED artifact
 * with the environment while a scan rooted one level below stayed green.
 */
const BIN_SOURCE = path.resolve(import.meta.dirname, '../../src/bin.ts')

/**
 * The roots `AC-token-build-06`'s nondeterminism scan walks from. Named once so the scan and
 * the row asserting its COVERAGE bind to the same set: a row that re-derived its own roots
 * would pass while the scan below went on walking a narrower graph, which is the exact shape
 * of the defect this is here to close.
 */
const SCAN_ROOTS: readonly string[] = [CONSUMER_BUILD_SOURCE, FACADE_SOURCE, BIN_SOURCE]

/**
 * R7's nondeterminism predicate, named once so the scan below and the armed-mutation row that
 * proves the scan bites are demonstrably the SAME predicate rather than two spellings of it.
 */
const NONDETERMINISM_RE = /\bDate\.(now|prototype)\b|\bnew Date\b|Math\.random|process\.env/

const TEAL = { l: 0.7859, c: 0.1316, h: 186.17 }
const DANGER = { l: 0.6357, c: 0.2072, h: 15.02 }
const SEEDS = { primary: TEAL, danger: DANGER, declaredTintHue: 186.17 }

/**
 * Every package source file REACHABLE from the consumer-invocable build path, walked
 * transitively through relative imports rather than named in a hand-kept list — a list is
 * exactly what goes stale when a new import is added, and the criterion's scope is "the
 * package's source scanned", not "one file".
 */
function reachableSources(...entries: readonly string[]): Map<string, string> {
  const sources = new Map<string, string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (sources.has(file)) continue
    const source = readFileSync(file, 'utf8')
    sources.set(file, source)
    for (const match of source.matchAll(/from '(\.[^']+)'/g)) {
      queue.push(path.resolve(path.dirname(file), match[1]!))
    }
  }
  return sources
}

const OVERRIDDEN_CHROMA = 0.01

/**
 * A bounded set of inputs to run the entry point over, so an observation about a real run is
 * an observation about several rather than one: the shipped defaults, two other seeds, and a
 * per-step override. Nothing is claimed here about what any of them produces.
 */
const BOUNDED_INPUTS: readonly { overrides?: PerStepOverrides; seeds: Seeds }[] = [
  { seeds: SEEDS },
  { seeds: { primary: { l: 0.98, c: 0, h: 0 }, danger: DANGER, declaredTintHue: 0 } },
  { seeds: { primary: { l: 0.42, c: 0.19, h: 292 }, danger: DANGER, declaredTintHue: 292 } },
  { seeds: SEEDS, overrides: { primary: { 500: OVERRIDDEN_CHROMA } } },
]

/**
 * The declarations that differ between a baseline consumer build and an overridden one, as
 * `[property, baselineLine, overriddenLine]`. The emitted CSS is where the ramp becomes
 * visible to a consumer (each declaration resolves to one scale at one step), so "exactly
 * one declaration moved" IS the surface form of `AC-token-build-24`'s "every other step of
 * that scale and every step of every other scale untouched".
 */
function movedDeclarations(overrides: PerStepOverrides): [string, string, string][] {
  const baseline = composeConsumerBuild({ seeds: SEEDS }).css.split('\n')
  const overridden = composeConsumerBuild({ seeds: SEEDS, overrides }).css.split('\n')
  expect(overridden.length).toBe(baseline.length)
  return baseline
    .map((line, i): [string, string, string] => [
      line.trim().split(':', 1)[0]!,
      line,
      overridden[i]!,
    ])
    .filter(([, before, after]) => before !== after)
}

/**
 * Runs `composeConsumerBuild` for real over `BOUNDED_INPUTS` with `contrast.ts` replaced by
 * a recording double, and returns what was observed. The instrument is BEHAVIOURAL, not
 * textual, because R25 ranges over the whole CALL GRAPH rather than over one file: a
 * refactor moving `build-step.ts`'s `runResultGuards` down into `runPipeline` would put the
 * failing guard on this path without changing a byte of `consumer-build.ts`, and a
 * text-only guard would stay green through exactly that. Recording covers every level and
 * every named export, rather than a two-name allowlist against a prohibition (R30's own
 * warning about a prohibition written as a list).
 *
 * The double RECORDS and returns inert values rather than delegating, so an invocation is
 * reported by name instead of being masked by whatever the real function would do.
 *
 * Everything below observes CALLS. Nothing here asserts, computes, restates or implies any
 * contrast ratio, floor, threshold, category, verdict or conformance outcome, and nothing
 * here characterises what any input reaches: none of that is this test's, or this
 * persona's, to say.
 */
async function observeContrastUse(): Promise<{ invoked: string[]; sameStepSources: unknown[] }> {
  const invoked: string[] = []
  const sameStepSources: unknown[] = []
  vi.resetModules()
  vi.doMock('../../src/theming/contrast.ts', async () => {
    const actual: Record<string, unknown> = await vi.importActual('../../src/theming/contrast.ts')
    return {
      ...actual,
      assertContrastFloors: () => {
        invoked.push('assertContrastFloors')
      },
      checkSameStepLint: (...args: unknown[]) => {
        sameStepSources.push(args[1])
        return []
      },
      runContrastHarness: () => {
        invoked.push('runContrastHarness')
        return []
      },
    }
  })
  const consumerBuild = await import('../../src/theming/consumer-build.ts')
  for (const input of BOUNDED_INPUTS) {
    consumerBuild.composeConsumerBuild(input)
  }
  return { invoked, sameStepSources }
}

describe('AC-token-build-05 covers: R6', () => {
  it('the consumer build emits exactly {palette-record.json, build-record.json} from the theming half, never core-contract.json or contact-sheet.html', () => {
    const { files } = composeConsumerBuild({ seeds: SEEDS })
    const destinations = files
      .map((f) => path.basename(f.destination))
      .toSorted((a, b) => a.localeCompare(b))
    expect(destinations).toEqual(['build-record.json', 'palette-record.json'])
    expect(destinations).not.toContain('core-contract.json')
    expect(destinations).not.toContain('contact-sheet.html')
  })
})

describe('AC-token-build-06 covers: R7', () => {
  it('identical inputs run twice, with a real time delay between the runs, produce byte-identical output', async () => {
    const first = composeConsumerBuild({ seeds: SEEDS })
    // The delay is the point: back-to-back runs can complete inside one millisecond, so a
    // millisecond-precision timestamp would not differ between them and this assertion
    // would pass over the exact defect it exists to catch (the technique
    // `core-contract.test.ts`'s own AC-token-build-13 byte-identity test already uses).
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = composeConsumerBuild({ seeds: SEEDS })
    expect(JSON.stringify(first.files)).toBe(JSON.stringify(second.files))
    expect(first.css).toBe(second.css)
  })

  it('no source reachable from the consumer build path reads Date, Date.now, Math.random or process.env', () => {
    const sources = reachableSources(...SCAN_ROOTS)

    // The walk itself is asserted before its result is trusted: a walker that collected
    // only the entry file (or nothing) would pass the scan below vacuously, which is the
    // narrowness this test was widened to fix.
    const reached = new Set(sources.keys().map((f) => path.basename(f)))
    for (const name of [
      'consumer-build.ts',
      'pipeline.ts',
      'emit.ts',
      'build-record.ts',
      'ramp.ts',
      'contrast.ts',
      'palette-record.ts',
    ]) {
      expect(reached).toContain(name)
    }

    for (const [file, source] of sources) {
      expect(
        codeOnly(source),
        `${path.basename(file)} is reachable from the consumer build path`,
      ).not.toMatch(NONDETERMINISM_RE)
    }
  })

  /**
   * ROW `F3` (Phase 3 round 2). `AC-token-build-06`'s second clause
   * scopes its scan to "the consumer-invocable build path", and that path is `facade.build`,
   * not the theming half alone. Two conjuncts, because either one alone is satisfiable by an
   * instrument that proves nothing: (a) the scan's own roots reach `formats.ts` — the file
   * that writes five of R7's seven COMMITTED artifacts — and (b) the scan's own predicate
   * bites on exactly the mutation the quality reviewer measured, which at the narrow roots left the
   * whole 707-test suite green while two builds 1.2s apart differed on line 1 of `tokens.css`,
   * `tokens.d.ts`, `breakpoints.d.ts` and `breakpoints.js`.
   *
   * The mutation is applied to a COPY of the source in memory and never to the file: a test
   * that edits its own subject on disk is a test that can leave the tree dirty on a failure.
   */
  it('row F3: the scan covers the DTCG half of the consumer-invocable build path, and reds on a wall-clock timestamp spliced into formats.ts', () => {
    const sources = reachableSources(...SCAN_ROOTS)
    const reached = new Set(sources.keys().map((f) => path.basename(f)))

    // (a) COVERAGE: the façade and everything reachable from it, named one by one rather
    // than counted, so a walk that silently stopped early fails here by name.
    for (const name of ['facade.ts', 'formats.ts', 'builder.ts', 'reader.ts', 'overrides.ts']) {
      expect(reached).toContain(name)
    }
    expect(sources.keys().toArray()).toContain(FORMATS_SOURCE)

    // (b) BITE: the identical predicate, applied to formats.ts's real bytes with the quality
    // reviewer's own mutation spliced into the generated-header constant.
    const real = readFileSync(FORMATS_SOURCE, 'utf8')
    const mutated = real.replace(
      "const HEADER = '/* Nave Design System — generated, do not edit */'",
      () =>
        'const HEADER = `/* Nave Design System — generated ${new Date().toISOString()}, do not edit */`',
    )
    // The splice landed: without this the assertion below could pass on unmutated bytes if
    // the header constant were ever re-spelled, which is the vacuous-fixture failure mode.
    expect(mutated).not.toBe(real)
    expect(codeOnly(real)).not.toMatch(NONDETERMINISM_RE)
    expect(codeOnly(mutated)).toMatch(NONDETERMINISM_RE)
  })

  /**
   * ROW `R3-02` (Phase 3 verifier-gated tail). Round 2 widened the walk
   * to `facade.ts` and stopped one level below the phrase the criterion actually uses:
   * `AC-token-build-06`'s clause scopes the scan to "the consumer-invocable build path", and
   * `bin.ts` IS that path's entry point. Nothing imports it, so no widening of the other two
   * roots can ever reach it — it has to be named. Same two conjuncts as the row above, for the
   * same reason: coverage alone, or bite alone, is satisfiable by an instrument that proves
   * nothing.
   */
  it('row R3-02: the scan reaches bin.ts, the consumer-invocable entry point itself, and reds on a process.env default planted there', () => {
    const sources = reachableSources(...SCAN_ROOTS)
    const reached = new Set(sources.keys().map((f) => path.basename(f)))

    // (a) COVERAGE.
    expect(reached).toContain('bin.ts')
    expect(sources.keys().toArray()).toContain(BIN_SOURCE)

    // (b) BITE: an environment-derived default for `--out`, the flag every artifact's
    // destination is composed from.
    const real = readFileSync(BIN_SOURCE, 'utf8')
    const mutated = real.replace(
      'if (!values.out)',
      () => 'values.out ??= process.env.NAVE_OUT\n  if (!values.out)',
    )
    expect(mutated).not.toBe(real)
    expect(codeOnly(real)).not.toMatch(NONDETERMINISM_RE)
    expect(codeOnly(mutated)).toMatch(NONDETERMINISM_RE)
  })

  /**
   * ROW `G1` (still-open row 1, fixed on Cédric's GATE-2 decision).
   * The stripper above was fixed TWICE, one round apart, because it existed in two copies:
   * round 2 anchored the copy in this file and the verifier-gated tail then anchored the
   * identical inline copy in `seed-ingest.test.ts`. Both are correct today, and the finding
   * is that the NEXT fix will again reach only one of them.
   *
   * The package has met this exact class before and named the remedy: `markdown-headings.ts`
   * consolidated two diverged copies of a fence-aware heading scan and
   * calls itself "the ONE copy of this logic in the package" — in PROSE, enforced by nothing.
   * This row is what that sentence was missing, and it is why the row counts DEFINITIONS
   * rather than asserting the hoist happened: a second copy is the defect whenever it appears,
   * not only on the day it was introduced.
   */
  it('row 1: the comment stripper has exactly ONE definition in this package test tree', () => {
    // Assembled from fragments rather than written as one literal, because this file would
    // otherwise contain the needle it searches for and the count could never reach one.
    const stripperPattern = [
      String.raw`^[ \t]*`,
      String.raw`\/`,
      String.raw`\*`,
      String.raw`[\s\S]*?`,
      String.raw`\*`,
      String.raw`\/`,
    ].join('')
    const testRoot = path.resolve(import.meta.dirname, '..')
    const definers = readdirSync(testRoot, { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('.ts'))
      .filter((entry) => readFileSync(path.join(testRoot, entry), 'utf8').includes(stripperPattern))
      .toSorted((a, b) => a.localeCompare(b))

    expect(definers).toEqual(['theming/code-only.ts'])
  })
})

describe('AC-token-build-08 covers: R9', () => {
  it('composeConsumerBuild never reads a monorepo-relative core source path (context-free)', () => {
    const code = codeOnly(
      readFileSync(
        path.resolve(import.meta.dirname, '../../src/theming/consumer-build.ts'),
        'utf8',
      ),
    )
    expect(code).not.toMatch(/\.\.\/\.\.\/\.\.\/core/)
    expect(code).not.toMatch(/scanCoreContractFromDisk/)
  })

  it('composeConsumerBuild does not throw ENOENT and produces output when called with only its own inputs (no monorepo path reachable)', () => {
    expect(() => composeConsumerBuild({ seeds: SEEDS })).not.toThrow()
  })
})

describe('AC-token-build-09 covers: R10', () => {
  it("the consumer build's emitted tokens.css declarations sit inside @layer tokens.presets, never tokens.defaults, and it is not a build option", () => {
    const { css } = composeConsumerBuild({ seeds: SEEDS })
    expect(css).toContain('@layer tokens.presets {')
    expect(css).not.toContain('@layer tokens.defaults {')
  })
})

// AC-token-build-16 (R16) moved to test/facade.test.ts: the check's
// subject is the UNION of this module's names and the DTCG-reader half's, computed from the
// consumer's own source, which this module never sees (R9) and therefore cannot exercise —
// `composeConsumerBuild` no longer validates against the manifest at all (see this file's
// own header). `build`'s own docblock in `facade.ts` is the check's new home.

describe('AC-token-build-24 covers: R24', () => {
  it('a per-step override lands at that exact step, carrying the overridden value, with every other declaration byte-identical', () => {
    const moved = movedDeclarations({ primary: { 500: OVERRIDDEN_CHROMA } })
    expect(moved).toHaveLength(1)
    const [property, before, after] = moved[0]!
    expect(property.startsWith('--nave-color-')).toBe(true)
    // The overridden value is what landed, not merely "something changed".
    expect(after).toContain(` ${OVERRIDDEN_CHROMA} `)
    expect(before).not.toContain(` ${OVERRIDDEN_CHROMA} `)
  })

  it('the override is addressed to the STEP: overriding a different step of the same scale moves a different declaration, and only that one', () => {
    const at500 = movedDeclarations({ primary: { 500: OVERRIDDEN_CHROMA } })
    const at700 = movedDeclarations({ primary: { 700: OVERRIDDEN_CHROMA } })
    expect(at500).toHaveLength(1)
    expect(at700).toHaveLength(1)
    // Were the override applied scale-wide (or ignored and something else moving), the two
    // runs could not disagree on WHICH declaration moves.
    expect(at700[0]![0]).not.toBe(at500[0]![0])
  })

  it('the override is addressed to the SCALE: overriding another scale at the same step moves a different declaration, and only that one', () => {
    const primary500 = movedDeclarations({ primary: { 500: OVERRIDDEN_CHROMA } })
    const neutral500 = movedDeclarations({ neutral: { 500: OVERRIDDEN_CHROMA } })
    expect(neutral500).toHaveLength(1)
    expect(neutral500[0]![0]).not.toBe(primary500[0]![0])
  })
})

describe('AC-token-build-25 covers: R25', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../../src/theming/contrast.ts')
  })

  it('a real consumer build never invokes the contrast harness or its floor assertion, anywhere in its call graph', async () => {
    const { invoked, sameStepSources } = await observeContrastUse()
    expect(invoked).toEqual([])
    // The double was reached, so the empty record above is evidence of non-invocation and
    // not of a mock that never took effect.
    expect(sameStepSources).toHaveLength(BOUNDED_INPUTS.length)
  })

  it("R25's second clause: no call reachable from this entry point passes Nave's own source class", async () => {
    const { sameStepSources } = await observeContrastUse()
    // The invariant, not the literal: what R25 forbids is Nave's own source class reaching a
    // source-conditioned guard on this path. Asserted over EVERY reachable call, because
    // `consumer-build.ts` discards the return value, which makes the two source classes
    // behaviourally identical here today and leaves nothing else able to go red.
    expect(sameStepSources).not.toContain('nave')
    expect(sameStepSources.length).toBeGreaterThan(0)
    expect(new Set(sameStepSources)).toEqual(new Set(['consumer']))
  })

  // Kept beside the spy because it is cheap and reads as intent at the call site, never as
  // the guarantee: the behavioural check above is the one that holds R25.
  it('the consumer module itself names neither assertContrastFloors nor runContrastHarness', () => {
    const code = codeOnly(readFileSync(CONSUMER_BUILD_SOURCE, 'utf8'))
    expect(code).not.toMatch(/\bassertContrastFloors\b/)
    expect(code).not.toMatch(/\brunContrastHarness\b/)
  })
})

describe('AC-token-build-26 covers: R26', () => {
  it('build-record.json (a pure data artifact) carries no contrast field at all', () => {
    const { files } = composeConsumerBuild({ seeds: SEEDS })
    const buildRecord = files.find((f) => f.destination.endsWith('build-record.json'))!
    expect(buildRecord.content.toLowerCase()).not.toMatch(/contrast/)
    expect(buildRecord.content.toLowerCase()).not.toMatch(/\bratio\b/)
  })

  it('the composed css carries no computed contrast ratio (an "N:1" figure) or pass/fail verdict — R34s cleared notice PROSE is not itself a computed number', () => {
    const { css } = composeConsumerBuild({ seeds: SEEDS })
    // A computed ratio always reads as a number immediately followed by ":1".
    expect(css).not.toMatch(/\d+(\.\d+)?\s*:\s*1\b/)
    expect(css.toLowerCase()).not.toMatch(/\b(pass|fail)(es|ed|ing)?\b/)
    expect(css.toLowerCase()).not.toMatch(/\bbadge\b/)
  })
})

/**
 * Every line of `css` that carries `needle` verbatim (mirrors `assertNoticeIsEmitted`'s own
 * carrying-line filter in copy-lint.ts, without its throwing behaviour — this test cares
 * whether the two outputs' carrying lines match, not whether either is well-formed).
 */
function carryingLines(css: string, needle: string): string[] {
  return css.split('\n').filter((line) => line.includes(needle))
}

// The shipped SEEDS fixture is chromatic (both TEAL
// and DANGER carry non-zero chroma). Running the guarantee below only against a chromatic
// seed leaves any branch conditioned JOINTLY on `layer` and emit.ts's own achromatic branch
// (the achromatic tintDefault path, emit.ts:112) unexercised — such a branch would pass this
// test every time regardless of what it did on the achromatic side. `ACHROMATIC_SEEDS` below
// reuses the same achromatic primary shape (`c: 0`) BOUNDED_INPUTS already exercises above.
const ACHROMATIC_SEEDS: Seeds = {
  primary: { l: 0.98, c: 0, h: 0 },
  danger: DANGER,
  declaredTintHue: 0,
}

describe('the consumer build path never asserts notice presence, so the guarantee is a shared-emitCss trigger, not a runtime check', () => {
  it.each([
    { label: 'a chromatic seed (the shipped SEEDS fixture)', seeds: SEEDS },
    {
      label: "an achromatic seed (emit.ts:112's achromatic tintDefault branch)",
      seeds: ACHROMATIC_SEEDS,
    },
  ])(
    "composeConsumerBuild's own emitCss(result, CONSUMER_LAYER) call and Nave's own emitCss(result) produce byte-identical lines for both notices, over the SAME pipeline result, for $label — this is the trigger this file's own composeConsumerBuild docblock names: the day emitCss starts branching on `layer` for these lines, this test goes red and this guarantee must be revisited",
    ({ seeds }) => {
      // One real pipeline result, run once, fed to both emitCss calls — never two separately
      // run pipelines, which could differ for reasons that have nothing to do with `layer`.
      const result = runPipeline(seeds)

      const naveEmitted = emitCss(result)
      const consumerEmitted = emitCss(result, CONSUMER_LAYER)

      for (const notice of [RETHEMING_NOTICE, FEEDBACK_SHARED_IDENTITY_NOTICE]) {
        const naveLines = carryingLines(naveEmitted.css, notice)
        const consumerLines = carryingLines(consumerEmitted.css, notice)
        // Both sides actually carry the notice at least once — otherwise an equally-empty
        // pair of arrays would pass this comparison vacuously, which is not evidence of
        // anything the guarantee this test exists to check for.
        expect(naveLines.length).toBeGreaterThan(0)
        expect(consumerLines).toEqual(naveLines)
      }
    },
  )
})
