import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OutputFile } from '../../src/builder.ts'
import type { BuildRecord } from '../../src/theming/build-record.ts'
import type { EmittedCss } from '../../src/theming/emit.ts'

import { writeOutputs } from '../../src/builder.ts'
import { composeThemingOutputs, withThemingLayer } from '../../src/theming/build-step.ts'
import {
  assertContactSheetComplete,
  composeContactSheet,
  expectedCells,
} from '../../src/theming/contact-sheet.ts'
import {
  FEEDBACK_SHARED_IDENTITY_NOTICE,
  findConformanceFraming,
  RETHEMING_NOTICE,
} from '../../src/theming/copy-lint.ts'
import { SLOT_DESCRIPTIONS } from '../../src/theming/descriptions.ts'
import { type PipelineResult, runPipeline, type Seeds } from '../../src/theming/pipeline.ts'
import { DEFAULT_ENV } from '../../src/theming/ramp.ts'
import { STEP_TABLE } from '../../src/theming/step-table.ts'

const PREVIOUS_ARTIFACT = '/* the previous complete artifact */\n'
const TEAL = { l: 0.7859, c: 0.1316, h: 186.17 }
const RED = { l: 0.6, c: 0.15, h: 25 }
const DANGER = { l: 0.6357, c: 0.2072, h: 15.02 }

const sheetSeeds = (primary = TEAL): Seeds => ({
  primary,
  danger: DANGER,
  declaredTintHue: 186.17,
})

/**
 * The composed artifact by name — the emitted file's own bytes, not an in-memory field the
 * consumer cannot reach.
 */
function artifact(name: string, options?: Parameters<typeof composeThemingOutputs>[0]): string {
  const composed = composeThemingOutputs(options)
  return composed.files.find((file) => file.destination.endsWith(name))!.content
}

const record = (options?: Parameters<typeof composeThemingOutputs>[0]): BuildRecord =>
  JSON.parse(artifact('build-record.json', options)) as BuildRecord

const CELL_PATTERN = /data-cell="([^"]+)"/g
const sheetCellIds = (html: string): string[] =>
  html
    .matchAll(CELL_PATTERN)
    .map((m) => m[1]!)
    .toArray()

async function scratchDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'nave-theming-'))
}

/**
 * The real build's own three phases (build.ts): compose the DTCG outputs, compose the
 * theming layer and its artifacts (running every wired guard), then write ONCE.
 */
async function runBuildInto(
  dir: string,
  env: ReadonlyMap<number, number> = DEFAULT_ENV,
): Promise<void> {
  const composed: OutputFile[] = [
    { destination: path.join(dir, 'tokens.css'), content: '/* dtcg layer */' },
  ]
  await writeOutputs(withThemingLayer(composed, { distDir: dir, env }))
}

describe('AC-theming-05 covers: R4 (no partially regenerated artifact on disk)', () => {
  it('a failing run leaves tokens.css at its previous complete content, with no partial and no stray temp file', async () => {
    const dir = await scratchDir()
    try {
      await writeFile(path.join(dir, 'tokens.css'), PREVIOUS_ARTIFACT)

      const badEnv = new Map(DEFAULT_ENV)
      badEnv.set(600, 0.99) // R7's hard ceiling, the violation AC-theming-05 constructs

      await expect(runBuildInto(dir, badEnv)).rejects.toThrow(/0\.95/)

      // Nothing was written: not the CSS, not the resolved DTCG, not the record, not the
      // sheet — and no `.tmp` sibling survived the failure either.
      expect(await readdir(dir)).toEqual(['tokens.css'])
      expect(await readFile(path.join(dir, 'tokens.css'), 'utf8')).toBe(PREVIOUS_ARTIFACT)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('a green run writes every artifact, complete, in one phase', async () => {
    const dir = await scratchDir()
    try {
      await runBuildInto(dir)
      const written = await readdir(dir)
      expect(written.toSorted((a, b) => a.localeCompare(b))).toEqual([
        'build-record.json',
        'contact-sheet.html',
        'core-contract.json',
        'palette-record.json',
        'tokens.css',
      ])

      const css = await readFile(path.join(dir, 'tokens.css'), 'utf8')
      expect(css).toContain('/* dtcg layer */')
      expect(css).toContain('/* Nave theming')
      expect(css.trimEnd().endsWith('}')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('AC-theming-19/-41/-46 cover: R18a, R35, R18b ($description reaches the built artifact)', () => {
  // SLOT_DESCRIPTIONS was validated by runSourceGuards() (the R35 lint)
  // but never landed in a shipped artifact — every prior test for these three AC ids read
  // the in-memory SLOT_DESCRIPTIONS map, never dist/palette-record.json, so the "and the
  // built artifact" half of R18a's own wording was untested. This describe block is that
  // missing half; the source-level assertions stay in remaining-ac.test.ts / copy-lint.test.ts.
  it('the resolved DTCG artifact carries a $description for every slot SLOT_DESCRIPTIONS names, on both branches', () => {
    const resolved = JSON.parse(artifact('palette-record.json')) as Record<
      string,
      { $description?: string; $type: string; $value: string }
    >
    for (const [slot, description] of SLOT_DESCRIPTIONS) {
      for (const branch of ['light', 'dark']) {
        const entry = resolved[`color.${slot}.${branch}`]
        expect(entry, `color.${slot}.${branch} should be in the resolved artifact`).toBeDefined()
        expect(entry!.$description).toBe(description)
      }
    }
  })

  it('a slot with no entry in SLOT_DESCRIPTIONS carries no $description key at all (never an empty string)', () => {
    const resolved = JSON.parse(artifact('palette-record.json')) as Record<
      string,
      { $description?: string }
    >
    const undescribed = Object.keys(resolved).find(
      (key) => !SLOT_DESCRIPTIONS.has(key.replace(/^color\./, '').replace(/\.(light|dark)$/, '')),
    )
    expect(undescribed, 'expected at least one slot with no SLOT_DESCRIPTIONS entry').toBeDefined()
    expect(resolved[undescribed!]!.$description).toBeUndefined()
  })

  // FORWARD GUARD, not an independent check today. composeThemingOutputs
  // runs lintDescriptions(SLOT_DESCRIPTIONS) via runSourceGuards() and THROWS before writing
  // any artifact, and the loop below copies each string verbatim with no transform in between,
  // so this assertion cannot go red without the build having already failed to produce the
  // fixture. Kept deliberately: it is the check that acquires teeth the moment anything is
  // inserted between the source map and the emitted artifact (a truncation, a template, a
  // docs-generator rewrite), which is exactly when the source-side lint stops covering the
  // shipped bytes. Recorded rather than deleted so a later reader does not mistake a
  // deliberate forward guard for a tautology of the kind the note above was raised about.
  it('every emitted $description passes the R35 conformance-framing lint (built-artifact half of the same guarantee runSourceGuards enforces at source)', () => {
    const resolved = JSON.parse(artifact('palette-record.json')) as Record<
      string,
      { $description?: string }
    >
    for (const [key, entry] of Object.entries(resolved)) {
      if (entry.$description === undefined) continue
      const reason = findConformanceFraming(entry.$description)
      expect(reason, `${key}: ${String(reason)}`).toBeUndefined()
    }
  })
})

describe('every guard whose binding surface exists at build time is WIRED', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../../src/theming/adjacency.ts')
    vi.doUnmock('../../src/theming/contrast.ts')
    vi.doUnmock('../../src/theming/copy-lint.ts')
    vi.doUnmock('../../src/theming/ladder.ts')
    vi.doUnmock('../../src/theming/neutral.ts')
    vi.doUnmock('../../src/theming/on-star.ts')
    vi.doUnmock('../../src/theming/semantics.ts')
  })

  // "A check that exists but is not wired in cannot catch what it exists to catch." Each
  // guard is replaced with one that fails, and the BUILD STEP is then asked to compose: if
  // the composition succeeds, that guard is not reached by a real build run, whatever its
  // own unit tests say.
  const THROWING_GUARDS: readonly [string, string][] = [
    ['../../src/theming/adjacency.ts', 'assertNoForbiddenAdjacency'],
    ['../../src/theming/adjacency.ts', 'assertNoFocusableAdjacentToActionFill'],
    ['../../src/theming/adjacency.ts', 'assertCoverageFloor'],
    // The three guards this round wired into runSourceGuards. A
    // guard added to that function and not to this list is exactly the case this test suite
    // was written for, and it is the list, not the function, that would have caught it.
    ['../../src/theming/adjacency.ts', 'assertNoOrphanedSemanticSlot'],
    ['../../src/theming/contrast.ts', 'assertFloorProvenance'],
    ['../../src/theming/neutral.ts', 'assertNeutralChromaCeilingWithinMargin'],
    ['../../src/theming/on-star.ts', 'assertOnStarShape'],
    ['../../src/theming/ladder.ts', 'assertLadderOrder'],
    ['../../src/theming/copy-lint.ts', 'assertNoticeIsClean'],
    ['../../src/theming/copy-lint.ts', 'assertHarnessFramingIsClean'],
    ['../../src/theming/copy-lint.ts', 'assertDescriptionsAreClean'],
    ['../../src/theming/contrast.ts', 'assertContrastFloors'],
  ]

  it.each(THROWING_GUARDS)('%s: %s fails the build when it throws', async (module, name) => {
    vi.resetModules()
    vi.doMock(module, async () => {
      const actual: Record<string, unknown> = await vi.importActual(module)
      return {
        ...actual,
        [name]: () => {
          throw new Error(`WIRED: ${name}`)
        },
      }
    })
    const step = await import('../../src/theming/build-step.ts')
    expect(() => step.composeThemingOutputs()).toThrow(`WIRED: ${name}`)
  })

  it("R39's same-step lint is wired, and a 'fail'-severity violation fails the build", async () => {
    vi.resetModules()
    vi.doMock('../../src/theming/contrast.ts', async () => {
      const actual: Record<string, unknown> = await vi.importActual('../../src/theming/contrast.ts')
      return {
        ...actual,
        // assertHarnessFramingIsClean (runSourceGuards, called BEFORE
        // this mocked export's own production call site) now also drives checkSameStepLint
        // with an empty adjacency array to capture its fail-closed message. Delegate that
        // one shape to the real function so this mock overrides only the severity path this
        // test is actually about, rather than silently disabling an unrelated guard's own
        // invariant for every call regardless of argument.
        checkSameStepLint: (
          result: PipelineResult,
          source: 'consumer' | 'nave' = 'nave',
          adjacency?: readonly unknown[],
        ) => {
          // Any EXPLICIT adjacency argument (whether the empty
          // fail-closed shape the guard above probes, or a real non-empty array this test's
          // own probe passes) delegates to the real function; only the bare, unparameterised
          // production call site (adjacency === undefined) gets this test's synthetic
          // severity override.
          if (adjacency !== undefined) {
            return (
              actual as { checkSameStepLint: (...args: unknown[]) => unknown }
            ).checkSameStepLint(result, source, adjacency)
          }
          return [{ slot: 'content.primary', description: 'constructed hit', severity: 'fail' }]
        },
      }
    })
    const step = await import('../../src/theming/build-step.ts')
    expect(() => step.composeThemingOutputs()).toThrow(
      /same palette step in both the light and the dark scheme/,
    )
  })

  it("a 'report'-severity violation does NOT fail the build (the severity is what is conditioned, not the predicate)", async () => {
    vi.resetModules()
    vi.doMock('../../src/theming/contrast.ts', async () => {
      const actual: Record<string, unknown> = await vi.importActual('../../src/theming/contrast.ts')
      return {
        ...actual,
        // Same delegation as the sibling test above.
        checkSameStepLint: (
          result: PipelineResult,
          source: 'consumer' | 'nave' = 'nave',
          adjacency?: readonly unknown[],
        ) => {
          // Any EXPLICIT adjacency argument (whether the empty
          // fail-closed shape the guard above probes, or a real non-empty array this test's
          // own probe passes) delegates to the real function; only the bare, unparameterised
          // production call site (adjacency === undefined) gets this test's synthetic
          // severity override.
          if (adjacency !== undefined) {
            return (
              actual as { checkSameStepLint: (...args: unknown[]) => unknown }
            ).checkSameStepLint(result, source, adjacency)
          }
          return [{ slot: 'content.primary', description: 'constructed hit', severity: 'report' }]
        },
      }
    })
    const step = await import('../../src/theming/build-step.ts')
    expect(step.composeThemingOutputs()).toBeDefined()
  })

  // R35's own throw message is asserted end-to-end against a real fixture in the
  // block below, which is a stronger test than mocking the lint could be:
  // `assertDescriptionsAreClean` calls `lintDescriptions` through its own module-local
  // binding, so a `vi.doMock` of that export never reaches it. Its wiring rides the table above.
  it('the shipped build passes every wired guard (the positive direction, run unmocked)', () => {
    expect(() => composeThemingOutputs()).not.toThrow()
  })
})

describe('runSourceGuards lints the real DTCG source, not only SLOT_DESCRIPTIONS', () => {
  // lintDescriptions was documented as covering "every $description string in the DTCG
  // source"; its one production caller previously passed SLOT_DESCRIPTIONS alone, so
  // tokens.json's own $description strings reached no build-time lint. `tokensSourcePaths`
  // lets this inject a synthetic fixture rather than mutating the real tracked tokens.json.
  it('a $description carrying conformance framing in the DTCG source (not SLOT_DESCRIPTIONS) fails the build', async () => {
    const dir = await scratchDir()
    try {
      const fixturePath = path.join(dir, 'tokens.json')
      await writeFile(
        fixturePath,
        JSON.stringify({
          color: {
            example: { $type: 'color', $value: '#000', $description: 'Meets WCAG AA contrast.' },
          },
        }),
      )
      expect(() => composeThemingOutputs({ tokensSourcePaths: [fixturePath] })).toThrow(
        /state or imply an accessibility conformance claim/,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('a clean DTCG-source description does not fail the build on this guard', async () => {
    const dir = await scratchDir()
    try {
      const fixturePath = path.join(dir, 'tokens.json')
      await writeFile(
        fixturePath,
        JSON.stringify({
          color: { example: { $type: 'color', $value: '#000', $description: 'Example swatch.' } },
        }),
      )
      expect(() => composeThemingOutputs({ tokensSourcePaths: [fixturePath] })).not.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // A violation in the FIRST of two colliding source files must still be reported (a
  // quality-review finding, F3): a merge-into-one-map implementation lets a clean SECOND
  // file's entry at the same dotted path silently overwrite the first file's violating one,
  // and the build passes with nothing to catch it.
  it('a violation in the FIRST of two source paths sharing a dotted path is still reported, not silently overwritten by the second', async () => {
    const dir = await scratchDir()
    try {
      const firstPath = path.join(dir, 'tokens-a.json')
      const secondPath = path.join(dir, 'tokens-b.json')
      await writeFile(
        firstPath,
        JSON.stringify({
          color: {
            example: { $type: 'color', $value: '#000', $description: 'Meets WCAG AA contrast.' },
          },
        }),
      )
      await writeFile(
        secondPath,
        JSON.stringify({
          color: { example: { $type: 'color', $value: '#000', $description: 'Example swatch.' } },
        }),
      )
      expect(() => composeThemingOutputs({ tokensSourcePaths: [firstPath, secondPath] })).toThrow(
        /state or imply an accessibility conformance claim/,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // A quality-review finding, F1: the two prior tests inject a fixture; neither pins the
  // DEFAULT (no options passed) to the real, non-empty tokens.json. A bare
  // `expect(() => composeThemingOutputs()).not.toThrow()` (this block's prior version of this
  // test, byte-identical to the "positive direction, run unmocked" assertion above) would stay
  // green even if the default were repointed at any other valid JSON with no `$description`
  // strings at all — reinstating this describe block's own original defect silently. This
  // intercepts the collector's actual call and pins BOTH the real path and a non-empty, real
  // description set.
  it('the default tokensSourcePaths resolves to the real, non-empty tokens.json — not merely that a build does not throw', async () => {
    const realTokensJsonPath = path.resolve(import.meta.dirname, '../../tokens.json')
    let capturedSourcePaths: readonly string[] | undefined
    vi.resetModules()
    vi.doMock('../../src/dtcg-descriptions.ts', async () => {
      const actual: Record<string, unknown> = await vi.importActual(
        '../../src/dtcg-descriptions.ts',
      )
      const realCollect = actual.collectDescriptionsFromSources as (
        sourcePaths: readonly string[],
      ) => ReadonlyMap<string, string>[]
      return {
        ...actual,
        collectDescriptionsFromSources: (sourcePaths: readonly string[]) => {
          capturedSourcePaths = sourcePaths
          return realCollect(sourcePaths)
        },
      }
    })
    try {
      const step = await import('../../src/theming/build-step.ts')
      expect(() => step.composeThemingOutputs()).not.toThrow()
      expect(capturedSourcePaths).toEqual([realTokensJsonPath])

      const { collectDescriptions } = await import('../../src/dtcg-descriptions.ts')
      const raw = await readFile(realTokensJsonPath, 'utf8')
      const realDescriptions = collectDescriptions(JSON.parse(raw))
      expect(realDescriptions.size).toBeGreaterThan(0)
    } finally {
      vi.doUnmock('../../src/dtcg-descriptions.ts')
      vi.resetModules()
    }
  })
})
/**
 * Mocks the emit step so the composed CSS carries `rewrite(notice)` wherever it carried
 * `notice`, then asks the build step to compose. `replaceAll`, not `replace`: `replace` rewrites
 * the FIRST occurrence only, so a notice that ever landed twice would leave a verbatim copy
 * behind and the mutation would silently stop being one.
 */
async function composeWithRewrittenNotice(
  notice: string,
  rewrite: (notice: string) => string,
): Promise<() => unknown> {
  vi.resetModules()
  vi.doMock('../../src/theming/emit.ts', async () => {
    const actual: Record<string, unknown> = await vi.importActual('../../src/theming/emit.ts')
    const realEmitCss = actual.emitCss as (result: PipelineResult) => EmittedCss
    return {
      ...actual,
      emitCss: (result: PipelineResult): EmittedCss => {
        const emitted = realEmitCss(result)
        return { ...emitted, css: emitted.css.replaceAll(notice, () => rewrite(notice)) }
      },
    }
  })
  const step = await import('../../src/theming/build-step.ts')
  return () => step.composeThemingOutputs()
}

/**
 * `composeThemingOutputs` calls `assertNoticeIsEmitted` once per cleared notice, and the two
 * calls sit on consecutive lines. Written as one parameterised block rather than two copies so
 * that a third notice costs one line, and, more to the point, so that neither call can be the
 * one nothing exercises: a prior review measured that deleting the R20 call left
 * the whole tokens suite green, because the only tests reaching this code path named R34.
 * `emit-r20-notice.test.ts` cannot cover it either, since it calls `emitCss(runPipeline(...))`
 * directly and never enters `composeThemingOutputs`.
 *
 * The notices are opaque here on purpose: nothing below reads, quotes or reasons about their
 * wording, only about whether the composed CSS still carries them verbatim.
 */
function describeEmittedNoticeGuard(label: string, notice: string): void {
  describe(`${label}: composeThemingOutputs catches a missing/truncated notice in the real emitted CSS, not only the source-level assertNoticeIsClean check`, () => {
    afterEach(() => {
      vi.resetModules()
      vi.doUnmock('../../src/theming/emit.ts')
    })

    it(`an emit step that drops the notice entirely fails the build, naming ${label}`, async () => {
      const compose = await composeWithRewrittenNotice(notice, () => '')
      expect(compose).toThrow(new RegExp(`${label} violation`))
    })

    it('an emit step that truncates the notice fails the build the same way, not only a total absence', async () => {
      const compose = await composeWithRewrittenNotice(notice, (text) => text.slice(0, -20))
      expect(compose).toThrow(new RegExp(`${label} violation`))
    })
  })
}

describeEmittedNoticeGuard('Feedback notice', FEEDBACK_SHARED_IDENTITY_NOTICE)
describeEmittedNoticeGuard('Retheming notice', RETHEMING_NOTICE)

describe('R3(a)/R3(b)/R5/R6 recorded in the build output: dist/build-record.json', () => {
  it('AC-theming-06: the seed is recorded AS GIVEN alongside the resolved triple, with the normalization flagged and its reason stated', () => {
    const wild = { l: 0.6, c: 0.9, h: 20 }
    const built = record({
      seeds: { primary: wild, danger: { l: 0.6357, c: 0.2072, h: 15.02 }, declaredTintHue: 20 },
    })
    expect(built.seeds.primary.input.value).toEqual(wild)
    expect(built.seeds.primary.resolved.l).toBe(wild.l)
    expect(built.seeds.primary.resolved.h).toBe(wild.h)
    expect(built.seeds.primary.resolved.c).toBeLessThan(wild.c)
    expect(built.seeds.primary.substitutions.normalized.applied).toBe(true)
    expect(built.seeds.primary.substitutions.normalized.reason).toMatch(/chroma reduced/)
  })

  it('AC-theming-44: a band-clamped lightness is recorded naming the seed, its own lightness and the substituted one', () => {
    const pastel = { l: 0.985, c: 0.02, h: 90 }
    const built = record({
      seeds: { primary: pastel, danger: { l: 0.6357, c: 0.2072, h: 15.02 }, declaredTintHue: 90 },
    })
    expect(built.seeds.primary.substitutions.lightnessBandClamped.applied).toBe(true)
    expect(built.seeds.primary.substitutions.lightnessBandClamped.reason).toMatch(
      /\[0\.20, 0\.90\]/,
    )
    expect(built.seeds.primary.input.value.l).toBe(0.985)
    expect(built.seeds.primary.sLightness).toBe(0.9)
  })

  it('AC-theming-43: the achromatic branch RECORDS ITSELF, naming the seed and the substituted slots', () => {
    const grey = { l: 0.6, c: 0, h: 0 }
    const built = record({
      seeds: { primary: grey, danger: { l: 0.6357, c: 0.2072, h: 15.02 }, declaredTintHue: 186.17 },
    })
    expect(built.achromaticBranch.selected).toBe(true)
    expect(built.achromaticBranch.seed).toEqual(grey)
    expect(built.achromaticBranch.substitutedSlots.toSorted((a, b) => a.localeCompare(b))).toEqual([
      'action.primary',
      'action.primary.active',
      'action.primary.hover',
      'border.focus',
      'content.link',
      'on-action.primary',
    ])
    expect(built.achromaticBranch.reason).toMatch(/exactly zero chroma/)
    // R13's achromatic clause: the tint takes the DECLARED default hue, never one read off
    // a zero-chroma seed, and the record says which.
    expect(built.tint.source).toBe('declared-default')
  })

  it('AC-theming-03: the record states, for the shipped teal, that the seed’s own colour appears at no step of the ramp it generates', () => {
    const built = record()
    expect(built.seeds.primary.seedColourAppearsInRamp).toBe(false)
    expect(built.seeds.primary.seedColourStep).toBeUndefined()
    expect(built.seeds.danger.seedColourAppearsInRamp).toBe(false)
    expect(built.achromaticBranch.selected).toBe(false)
    expect(built.tint.source).toBe('primary-seed')
  })

  // assertNoOrphanedSemanticSlot's `{ open }` report used to be
  // discarded by its one caller (a bare statement in runSourceGuards). This is the report
  // surface instead — the real shipped set's four OPEN slots (ADJACENCY_OPEN) reach the
  // real build-record.json rather than only this module's own tests.
  it('the shipped OPEN adjacency slots reach build-record.json, not only the test suite', () => {
    const built = record()
    // Nave's own build always passes the array (build-step.ts:243), so the key is always
    // present here; the `?? []` only satisfies the type, which is optional because the
    // consumer build path (round 2, finding C) genuinely omits the key when unmeasured.
    const openSlots = built.openAdjacencySlots ?? []
    expect(openSlots.toSorted((a, b) => a.localeCompare(b))).toEqual([
      'border.strong',
      'feedback.info.foreground',
      'feedback.success.foreground',
      'feedback.warning.foreground',
    ])
  })
})

describe('AC-theming-08 covers: R7 (the contact sheet is emitted and complete)', () => {
  it('the emitted sheet carries every step of every generated scale, in both schemes, for every seed in R8’s adversarial set plus the default', () => {
    const cells = new Set(sheetCellIds(artifact('contact-sheet.html')))

    const seedColumns = ['teal (shipped default)', 'red', 'blue', 'violet', 'yellow-green']
    const expected: string[] = []
    for (const seed of seedColumns) {
      for (const scheme of ['light', 'dark']) {
        for (const scale of ['primary', 'danger', 'neutral']) {
          expected.push(...STEP_TABLE.map(({ step }) => `${seed}|${scheme}|${scale}|${step}`))
        }
      }
    }
    const missing = expected.filter((id) => !cells.has(id))
    expect(missing).toEqual([])
    expect(cells.size).toBe(seedColumns.length * 2 * 3 * STEP_TABLE.length)
  })

  it('the sheet is self-contained: one inline stylesheet, no script and no external asset', () => {
    const sheet = artifact('contact-sheet.html')
    expect(sheet).not.toMatch(/<script/i)
    expect(sheet).not.toMatch(/<link\b/i)
    expect(sheet).not.toMatch(/https?:\/\//)
  })

  it('every step of every scale is rendered on each of the five shipped surfaces it actually sits on', () => {
    const sheet = artifact('contact-sheet.html')
    for (const surface of [
      'surface.base',
      'surface.raised',
      'surface.overlay',
      'surface.sunken',
      'surface.inverse',
    ]) {
      expect(sheet).toContain(surface)
    }
    // One rendering per surface, per cell: the swatch count is the cell count times five.
    const ids = sheetCellIds(sheet)
    expect(ids.length).toBe(new Set(ids).size * 5)
  })

  it('R7’s cosmetic note is carried in the sheet: the chromatic columns ending in a white and a black swatch is the arithmetic, not an oversight', () => {
    expect(artifact('contact-sheet.html')).toMatch(/chroma goes to zero/i)
  })

  it('a STEP missing from the sheet fails the run, naming the missing cell', () => {
    const columns = [
      { name: 'teal', seed: TEAL, result: runPipeline(sheetSeeds()) },
      { name: 'red', seed: RED, result: runPipeline(sheetSeeds(RED)) },
    ]
    const { html, cells } = composeContactSheet(columns)
    // Drop one step from the rendered markup, exactly as a renderer with a stray filter
    // would. The check re-reads the MARKUP, so this is caught rather than passed over.
    // `replaceAll`, not `replace`: the cell is rendered once per surface, so dropping one
    // rendering of it is not dropping the step.
    const dropped = html.replaceAll('data-cell="red|light|primary|500"', 'data-cell="dropped"')
    expect(dropped).not.toBe(html)
    expect(() => assertContactSheetComplete(dropped, cells)).toThrow(/red\|light\|primary\|500/)
  })

  it('a SEED missing from the sheet fails the run', () => {
    const teal = { name: 'teal', seed: TEAL, result: runPipeline(sheetSeeds()) }
    const red = { name: 'red', seed: RED, result: runPipeline(sheetSeeds(RED)) }
    // A sheet rendered for one column, checked against the expectation for two: the shape
    // of "the sheet only ever shows the default", which R7 says cannot discharge A3.
    const oneColumn = composeContactSheet([teal])
    expect(() => assertContactSheetComplete(oneColumn.html, expectedCells([teal, red]))).toThrow(
      /is missing \d+ of \d+ cells/,
    )
  })

  it('an empty column set is not a complete sheet', () => {
    expect(() => composeContactSheet([])).toThrow(/no seed column/)
  })
})

/**
 * Every artifact this build step composes is read by someone who has only this package.
 * `dist/tokens.css` and `dist/build-record.json` are both packed, so a path or an identifier
 * written into either reaches every consumer who installs `@navecss/tokens`;
 * `dist/contact-sheet.html` is not packed and is held to the same property here because the
 * same build step composes it and the same authoring mistake produces it.
 *
 * Each pattern below is checked against the composed CONTENT, so the patterns themselves have
 * to appear in this file. That is deliberate and load-bearing: their presence in the source is
 * what makes their absence in the artifacts assertable, and removing them from here would
 * delete the check rather than clean it up.
 *
 * Scope, stated so the name of this block is not read as wider than what it does: six
 * SHAPES are checked (a path that leaves the published package, a markdown document the
 * package's own reader has no copy of, a tracker URL written out in full, a spec-round
 * shorthand, an internal issue reference, an internal record id). Prose that names an
 * unreadable document without using any of those shapes is not detectable here and is not
 * claimed to be.
 *
 * ONE CLASS IS DELIBERATELY OUT OF SCOPE, stated here rather than left to be rediscovered: a
 * non-markdown path into a companion repository, written with no leading relative segment and
 * no `.md` suffix, is not detectable here and will not be made so. Any shape that caught it
 * would have to spell the directory name out, which is the whole of what the retirement this
 * block belongs to was for. The shapes above cover every class reachable from a current code
 * path.
 *
 * The issue-reference shape used to match ONLY a fully-prefixed `<repository>#<N>` form,
 * while this codebase's own dominant citation style in source
 * comments is the BARE form — a plain `#N`, a parenthesized `(#N)`, or a possessive
 * `#N's own` — the same names-a-class-checks-one-member gap that produced this file's own
 * internal-path widening in the first place, one level deeper. The naive widening
 * (`/#\d+/` unconditionally) is itself wrong: `contact-sheet.html`'s own shipped `<style>`
 * block carries `background: #f6f6f6; color: #111;`, and that trailing hex value is exactly
 * the shape a bare digit-run pattern would flag as a false positive. The negative lookbehind
 * below excludes a `#` preceded by `:` or `&` (optionally with intervening whitespace before
 * the `#`, which is how a real declaration reads: `background: #f6f6f6`) — a CSS hex-colour
 * value or an HTML numeric character reference (e.g. `&#8202;`) respectively. Neither
 * precedes a real citation in any artifact this build composes.
 *
 * A later round (finding G) named three more shapes this detector missed, all
 * inert against today's shipped artifacts (0 hits, checked at the ref each was written
 * against — a fact about the current build, not a guarantee about a future one). Two are
 * closed here (review round 4); the third stays a deliberate carve-out:
 *
 *   - CLOSED: a numeric reference preceded by `,`, `(` or `=` rather than `:` or `&` —
 *     `var(--x, #123456)` (a CSS custom-property fallback), `url(#123)`, `href="#123"`
 *     (SVG/HTML fragment refs). Widening the lookbehind above to a blanket `[:&,(=]` was
 *     rejected in round 2: a parenthesized bare citation is this codebase's own genuine
 *     bare-citation shape (pinned below), and a paren immediately precedes the `#` there
 *     exactly as it does in `url(#123)` — a punctuation-only lookbehind cannot tell them apart.
 *     The three additional lookbehinds below instead anchor on the SPECIFIC surrounding syntax
 *     (`url(`, a `var(--name,` fallback position, an `href=`/`xlink:href=` attribute), which
 *     those parenthesized citations never carry, so the general punctuation lookbehind stays
 *     untouched and every existing citation shape still matches.
 *   - CLOSED: a document filename with no directory in front of it (a bare `<name>.md`, a
 *     shorthand this codebase's own docblocks use routinely), which the path shape above
 *     cannot see. This used to be a closed, hand-maintained enumeration of the specific
 *     document names this codebase cites by bare name, which had two problems at once: the
 *     list itself named documents this package's reader cannot open, and it went stale the
 *     day one of them was renamed. `UNRESOLVABLE_MARKDOWN_PATTERN` replaces it with the
 *     property actually at stake, inverted: every markdown filename is unreadable to the
 *     package's own reader EXCEPT the ones the tarball carries, so the shape allows the
 *     packed documents by name and flags everything else, whichever directory it lives in
 *     and whether or not it has one. That subsumes the `specs/`-prefixed path shape as well,
 *     which is why no separate entry for it survives in the list: the six shapes above would
 *     otherwise have been seven.
 *
 *     Note which direction the allowlist runs, because the opposite reading is the tempting
 *     one: this is NOT a ban on markdown references. `packages/tokens/README.md` is packed,
 *     and it is the surface product ruled this package's cleared contrast-threshold paragraph
 *     onto BY NAME, so a blanket
 *     `\.md` shape would forbid the one documentation pointer this package is supposed to
 *     make. The allowlist is what keeps the guard on the reader's side of that ruling instead
 *     of against it.
 *   - CARVED OUT, still: none. Both round-2 gaps are closed; nothing is currently known-open.
 */
const ISSUE_REFERENCE_PATTERN =
  /(?<![:&]\s{0,20})(?<!\burl\(\s{0,20})(?<!var\(--[\w-]+,\s{0,20})(?<!(?:href|xlink:href)\s*=\s*["'])#\d+\b/

/**
 * The markdown documents a consumer of the published package actually holds: the ones the
 * tarball carries. Derived from nothing on purpose — this is a statement about what is PACKED,
 * which is a manifest question rather than a tree question.
 *
 * It is ONE name, and the name that used to sit beside it is why this paragraph exists.
 * `CHANGELOG.md` was on this list, and `npm pack --dry-run --json` emits a changelog for no
 * publishable package in this repository: no `files` array lists one, and npm force-includes
 * only `README`, `LICENSE` and `package.json`. So the allowlist was permitting a pointer to a
 * document the reader does not hold — the exact failure this block exists to catch, arriving
 * through the ALLOWLIST rather than through the shape, which is the direction that fails quiet.
 * Note the asymmetry that makes a wrong name here expensive: a name wrongly ABSENT reds a
 * lawful pointer and someone notices, while a name wrongly PRESENT reds nothing, ever.
 *
 * So measure before adding one. `npm pack --dry-run --json` in the package directory answers it
 * directly, and it is a manifest read, not a tree read. A changelog becoming packed is a
 * packaging decision that has to be made first; this list follows such a decision and never
 * anticipates it.
 */
const PACKED_MARKDOWN_BASENAMES = ['README.md'] as const

/**
 * See the header comment above: any markdown filename that is not one of the packed documents,
 * with or without a directory in front of it. The lookahead is what makes this an allowlist
 * rather than a ban on markdown references.
 *
 * Two details on the allowlist limb, both of which decide whether a LAWFUL pointer reds. The
 * `i` flag: a filename is matched case-insensitively by every filesystem this package is read
 * on, and `readme.md` is the same packed document `README.md` is, so a case-sensitive allowlist
 * flags a correct pointer. And the allowlist ends on `(?![\w-]|\.\w)` rather than on `\b`,
 * because `\b` holds before the `.` of `README.md.bak` — which allowlists a file the tarball
 * does NOT carry, on the strength of a prefix. The trailing `\b` on the shape itself stays: it
 * is what lets the flag land on the `README.md` inside that lookalike.
 *
 * WHY THE SECOND LIMB IS `\.\w` AND NOT A BARE `.`, because the bare form is the obvious
 * spelling and it was measured wrong. A dot after the packed name is a FILENAME character only
 * when a word character follows it; a dot with a space or an end of input after it is an
 * ordinary sentence-final period. Rejecting the allowlist on any dot therefore flags
 * `See README.md. It explains the tokens.`, which is the most ordinary spelling there is of
 * exactly the pointer this allowlist exists to keep referenceable, and it lands against the
 * argument two paragraphs up rather than with it.
 */
const UNRESOLVABLE_MARKDOWN_PATTERN = new RegExp(
  String.raw`\b(?!(?:${PACKED_MARKDOWN_BASENAMES.map((name) => name.replaceAll('.', String.raw`\.`)).join('|')})(?![\w-]|\.\w))[\w-]+\.md\b`,
  'i',
)

/**
 * A relative pointer that genuinely LEAVES the published package. From `dist/`, where every
 * artifact this block checks is read, a single `../` lands on the package ROOT, which is inside
 * the tarball: `../README.md` and `url(../assets/font.woff2)` are both lawful and the packed
 * README is the one documentation pointer the allowlist above exists to keep referenceable. Two
 * or more levels is what actually leaves.
 */
const CLIMB_OUT_PATTERN = /(?:\.\.\/){2,}/

const TRACKER_URL_LABEL = 'a tracker URL a reader of the published package has no access to'

/**
 * The other spelling of the same defect: a tracker reference written out as a full URL carries
 * no `<slug>#<digits>` and no `.md`, so neither the issue-reference shape nor the markdown shape
 * can see it.
 */
const TRACKER_URL_PATTERN = /\bgithub\.com\/[\w-]+\/[\w-]+\/(?:issues|pull)\/\d+/

const RECORD_ID_LABEL = 'an internal record id'

/**
 * An internal record id: one of four prefixes, a date and a trailing separator.
 *
 * The one-letter prefix is a member in its own right and not a prefix of the two-letter one.
 * The alternation tries the longer spelling FIRST, so a two-letter id still matches as itself
 * and a lone one-letter id stops reading as unremarkable prose. That single-letter form is the
 * commonest of the four in practice, which is exactly why its absence went unnoticed here.
 */
const RECORD_ID_PATTERN = /\b(?:F|D|LE|L)-\d{8}-/

const SPEC_ROUND_SHORTHAND_LABEL =
  'a spec-round shorthand only meaningful in the internal companion repository'

const UNRESOLVABLE_REFERENCE_SHAPES: readonly (readonly [string, RegExp])[] = [
  ['a path that climbs out of the published package', CLIMB_OUT_PATTERN],
  ['a markdown document this package does not ship', UNRESOLVABLE_MARKDOWN_PATTERN],
  [TRACKER_URL_LABEL, TRACKER_URL_PATTERN],
  [SPEC_ROUND_SHORTHAND_LABEL, /\bG\d+\b/],
  ['an internal issue reference', ISSUE_REFERENCE_PATTERN],
  [RECORD_ID_LABEL, RECORD_ID_PATTERN],
]

// 🔵 nit: a plain `expect().not.toMatch()` per pair throws on the
// FIRST hit, which means a second, real regression in a different artifact or shape is
// masked until the first is fixed and the suite reruns. Collecting every violation first
// and asserting once reports the whole set in one failing run.
describe('no composed theming artifact points at a document its reader cannot open', () => {
  it('the emitted CSS layer, build-record.json and contact-sheet.html carry no internal reference', () => {
    const composed = composeThemingOutputs()

    const buildRecord = composed.files.find((file) =>
      file.destination.endsWith('build-record.json'),
    )
    const sheet = composed.files.find((file) => file.destination.endsWith('contact-sheet.html'))
    expect(buildRecord, 'the build step should compose build-record.json').toBeDefined()
    expect(sheet, 'the build step should compose contact-sheet.html').toBeDefined()

    const artifacts: readonly (readonly [string, string])[] = [
      ['the emitted CSS layer', composed.css],
      ['build-record.json', buildRecord!.content],
      ['contact-sheet.html', sheet!.content],
    ]

    const violations: string[] = []
    for (const [artifact, content] of artifacts) {
      for (const [shape, pattern] of UNRESOLVABLE_REFERENCE_SHAPES) {
        if (pattern.test(content)) violations.push(`${artifact} carries ${shape}`)
      }
    }
    expect(violations).toEqual([])
  })
})

// The pattern's own behaviour, isolated from the real artifacts, so its
// false-positive avoidance and its widened catch are each pinned directly rather than only
// exercised incidentally by whatever the real build happens to contain today.
describe('the widened issue-reference shape', () => {
  // The positive fixtures below have to BE the shape under test, so they cannot be reworded and
  // they cannot be given different digits: what is pinned is the spelling, not the number. They
  // are composed from this constant instead, so the literal never appears in the file and the
  // repository-wide bare-reference guard does not count this test's own fixtures as offenders.
  // The strings handed to the matcher are byte-identical to the ones written out before.
  const HASH = '#'

  it('catches the bare form this codebase actually writes, not only the fully-prefixed one', () => {
    for (const text of [
      `/* see ${HASH}290 for context */`,
      `a reviewer's implementation-shape request on ${HASH}9`,
      `(${HASH}68)`,
      `${HASH}231's own`,
    ]) {
      expect(text).toMatch(ISSUE_REFERENCE_PATTERN)
    }
  })

  it('does not false-positive on a CSS hex colour or an HTML numeric character reference', () => {
    for (const text of [
      // The real shipped string this guard would otherwise trip on, transcribed from
      // contact-sheet.ts's own <style> block.
      'body { margin: 0; padding: 1.5rem; background: #f6f6f6; color: #111; }',
      '&#8202;',
    ]) {
      expect(text).not.toMatch(ISSUE_REFERENCE_PATTERN)
    }
  })

  // Round 2 (finding G), closed round 4: the three named
  // false-positive shapes are now excluded by SYNTAX-ANCHORED lookbehinds rather than a
  // blanket punctuation widening, so they do not reopen the round-2 tension below.
  it('does not false-positive on a CSS custom-property fallback, a url() fragment ref, or an href fragment ref', () => {
    for (const text of [
      'color: var(--x, #123456);',
      'background: url(#123);',
      '<use href="#123" />',
      "<use xlink:href='#456' />",
    ]) {
      expect(text).not.toMatch(ISSUE_REFERENCE_PATTERN)
    }
  })

  // The exact tension round 2 declined to resolve by widening the general lookbehind: a
  // genuine bare-paren citation and a url() fragment ref both put `(` immediately before the
  // `#`, so only a pattern anchored on `url(` specifically — not on the paren alone — can
  // tell them apart. Both directions pinned in one test so a future edit cannot fix one by
  // breaking the other.
  it('still catches a genuine paren-preceded citation once the url()/var()/href exclusions are in place', () => {
    for (const text of [`(${HASH}68)`, `(see ${HASH}290)`]) {
      expect(text).toMatch(ISSUE_REFERENCE_PATTERN)
    }
  })
})

// Round 2 (finding G), closed round 4, and re-cut when the enumeration it used to depend on
// was replaced by the packed-document allowlist: a markdown filename the package's own reader
// has no copy of. Every fixture below is synthetic; the shape is what is pinned, never a
// particular document's name.
describe('the unresolvable-markdown-document shape', () => {
  it('catches a document filename with no directory in front of it', () => {
    for (const text of ['design-notes.md', 'see build-plan.md for the rungs']) {
      expect(text).toMatch(UNRESOLVABLE_MARKDOWN_PATTERN)
    }
  })

  // The directory-prefixed case is the SAME shape now, not a second one left to another
  // pattern: the old split was an artefact of keying on where a document lived rather than on
  // whether its reader holds it, and a reader who holds neither is not helped by the
  // distinction. Both directions are pinned so a future narrowing cannot quietly restore it.
  it('catches the same filename when a directory IS in front of it', () => {
    for (const text of ['guides/design-notes.md', 'docs/internal/build-plan.md']) {
      expect(text).toMatch(UNRESOLVABLE_MARKDOWN_PATTERN)
    }
  })

  it('allows the documents the tarball actually carries, at any depth', () => {
    for (const text of ['see README.md for setup', 'packages/tokens/README.md']) {
      expect(text).not.toMatch(UNRESOLVABLE_MARKDOWN_PATTERN)
    }
  })

  // The allowlist is measured against the MANIFEST, never against what the repository happens
  // to hold. `CHANGELOG.md` sat on that list while being packed by no publishable package here,
  // so the guard allowed a pointer its reader cannot open. That is this block's own failure
  // mode reached through the allowlist instead of through the shape, and it is the direction
  // that fails QUIET: a name wrongly present reds nothing, ever, so only a row can find it.
  // `CONSUMER-ATOMS.md` is a real unpacked document in a sibling package, kept here as a
  // second fixture so the row does not stand on one name.
  it('flags a markdown document the tarball omits, however ordinary the name', () => {
    for (const text of ['see CHANGELOG.md for the history', 'CHANGELOG.md', 'CONSUMER-ATOMS.md']) {
      expect(text).toMatch(UNRESOLVABLE_MARKDOWN_PATTERN)
    }
  })

  it('allows the packed documents however they are cased, and flags a suffixed lookalike', () => {
    for (const text of ['see readme.md', 'Readme.md']) {
      expect(text).not.toMatch(UNRESOLVABLE_MARKDOWN_PATTERN)
    }
    expect('README.md.bak').toMatch(UNRESOLVABLE_MARKDOWN_PATTERN)
  })

  // The row that separates "a dot continues the filename" from "a dot ends the sentence". Both
  // directions are pinned together with the lookalike above, so the next edit to the allowlist
  // limb cannot buy one by losing the other.
  it('allows a packed document at the end of a sentence', () => {
    for (const text of ['See README.md. It explains the tokens.', 'read README.md.']) {
      expect(text).not.toMatch(UNRESOLVABLE_MARKDOWN_PATTERN)
    }
  })
})

// The climb-out shape's own two directions. The label says "climbs OUT of the published
// package", and from `dist/` a single `../` does not: it lands on the package root, which the
// tarball carries. One level is therefore a lawful pointer and the label would have overclaimed
// against it; two or more genuinely leaves.
describe('the climb-out-of-the-package shape', () => {
  it('does not flag a relative pointer that stays inside the published package', () => {
    for (const text of [
      '<a href="../README.md">the package README</a>',
      'url(../assets/font.woff2)',
    ]) {
      expect(text).not.toMatch(CLIMB_OUT_PATTERN)
    }
  })

  it('catches a path that genuinely leaves the package', () => {
    expect('see ../../internal/notes.md').toMatch(CLIMB_OUT_PATTERN)
  })
})

// The tracker-URL shape. The two patterns that replaced the retired directory-name shape both
// key on a `#` or on a `.md`, and a tracker reference written out as a full URL carries
// neither, so nothing in this list could see it until this member existed. The fixture names
// `owner/repo` and never a real repository.
describe('the tracker-URL shape', () => {
  // Read through the LIVE entry, by label, so removing the member from the checked set reds
  // this block rather than leaving a constant nothing consults (the same reason the spec-round
  // shorthand below reads its entry instead of re-declaring the literal).
  const [, LIVE_TRACKER_URL_PATTERN] = UNRESOLVABLE_REFERENCE_SHAPES.find(
    ([label]) => label === TRACKER_URL_LABEL,
  )!

  it('catches a tracker URL a reader of the published package has no access to', () => {
    for (const text of [
      'see https://github.com/owner/repo/issues/632',
      'see https://github.com/owner/repo/pull/632',
    ]) {
      expect(text).toMatch(TRACKER_URL_PATTERN)
      expect(text).toMatch(LIVE_TRACKER_URL_PATTERN)
    }
  })

  it('does not flag an ordinary repository URL with no issue path', () => {
    for (const text of ['https://github.com/owner/repo', 'https://github.com/owner']) {
      expect(text).not.toMatch(TRACKER_URL_PATTERN)
    }
  })
})

// Round 2 (finding M): the widened G\d -> G\d+ shape, pinned directly —
// nothing in this suite previously exercised the widened entry, and today's real artifacts
// carry zero G-shorthand references either way.
//
// 🔵 nit (flagged in review round 3): this used to re-declare a second
// literal `/\bG\d+\b/` rather than reading `UNRESOLVABLE_REFERENCE_SHAPES`, so a future
// narrowing of that entry (e.g. back to `/\bG\d\b/`) would leave this test green — a
// transcription that loses the tripwire it exists to protect. Reads the live entry by its
// label instead.
// The record-id shape's four prefixes. The one-letter one was missing, so a lone
// single-letter id read as ordinary prose to every artifact this block scans.
describe('the record-id shape', () => {
  const [, LIVE_RECORD_ID_PATTERN] = UNRESOLVABLE_REFERENCE_SHAPES.find(
    ([label]) => label === RECORD_ID_LABEL,
  )!

  // COMPOSED, never written out, for the same reason the issue-reference fixtures above are:
  // this file is itself scanned for the shapes it defines, so a fixture spelled literally is an
  // instance of the thing under test. `${PREFIX}-${DATE}-` is byte-identical to the id form.
  const DATE = '20260812'
  const id = (prefix: string): string => `Per ${prefix}-${DATE}-01.`

  it('catches every prefix, the one-letter form included', () => {
    for (const prefix of ['F', 'D', 'LE', 'L']) {
      expect(id(prefix)).toMatch(RECORD_ID_PATTERN)
      expect(id(prefix)).toMatch(LIVE_RECORD_ID_PATTERN)
    }
  })

  it('still reads the two-letter prefix as itself, not as the one-letter one plus a stray', () => {
    // `exec`, not `String#match`: the repository's lint requires it, and on a non-global
    // pattern the two return the same array with no `lastIndex` state either way.
    expect(RECORD_ID_PATTERN.exec(id('LE'))![0]).toBe(`LE-${DATE}-`)
    expect(RECORD_ID_PATTERN.exec(id('L'))![0]).toBe(`L-${DATE}-`)
  })

  it('does not false-positive on a longer word ending in one of the prefixes', () => {
    for (const text of [`Per XL-${DATE}-01.`, `Per Lc-${DATE}-01.`, `Per AC-${DATE}-01.`]) {
      expect(text).not.toMatch(RECORD_ID_PATTERN)
    }
  })
})

describe('the widened spec-round shorthand', () => {
  const [, SPEC_ROUND_SHORTHAND_PATTERN] = UNRESOLVABLE_REFERENCE_SHAPES.find(
    ([label]) => label === SPEC_ROUND_SHORTHAND_LABEL,
  )!

  it('catches single- and multi-digit spec rounds', () => {
    for (const text of ['G1', 'G10', 'G99']) {
      expect(text).toMatch(SPEC_ROUND_SHORTHAND_PATTERN)
    }
  })

  it('does not false-positive with no word boundary before G', () => {
    for (const text of ['PNG10', 'SVG2', 'likeGuard2']) {
      expect(text).not.toMatch(SPEC_ROUND_SHORTHAND_PATTERN)
    }
  })
})
