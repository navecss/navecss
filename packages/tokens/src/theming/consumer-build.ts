/**
 * The theming-layer half of the consumer-invocable build's composition (R6, R7, R9, R10, R16,
 * R24, R25, R26). Distinct from `build-step.ts`'s `composeThemingOutputs`/
 * `withThemingLayer`, which is Nave's OWN build path: it scans core's real source
 * (`scanCoreContractFromDisk`, a monorepo-relative path), ships `core-contract.json` and
 * `contact-sheet.html`, FAILS the build on a contrast verdict (`assertContrastFloors`), and
 * emits into `@layer tokens.defaults`. None of that belongs on the consumer path.
 *
 * R6: the emitted file set here is exactly `{palette-record.json, build-record.json}` — the
 * theming half of R6's seven-artifact set; `tokens.css`/`tokens.js`/`tokens.d.ts`/
 * `breakpoints.js`/`breakpoints.d.ts` are the DTCG-reader half, composed by the existing
 * generic `composeBuild` (`builder.ts`) over the consumer's own token source, unchanged by
 * this module. `core-contract.json` and `contact-sheet.html` are Nave's own artifacts and
 * are never composed here at all.
 *
 * R7: no wall-clock timestamp, no `Math.random`, no `process.env` read anywhere in this
 * file — verified both by inspection (nothing here reads any of the three) and by a
 * source-text guard test.
 *
 * R9: this file is CONTEXT-FREE. It never imports `scanCoreContractFromDisk` and never
 * reads any monorepo-relative path; the manifest it checks against is a caller-supplied
 * value (the façade reads it from `@navecss/tokens`'s OWN installed `dist/core-contract.json`
 * — a path inside this package's own directory, not outside it). The one composition shared
 * with Nave's build path, `palette-record.ts`, reads no path at module load or at call time,
 * which is why sharing it (rather than duplicating it) holds R9; Nave's monorepo-relative
 * scan lives in `core-source.ts`, which this file does not import.
 *
 * R10: emits into `@layer tokens.presets`, fixed — never `tokens.defaults` (Nave's own
 * build) and never a public option.
 *
 * R16: this module does NOT
 * validate against the manifest — it used to, but the check's subject is the UNION of this
 * half's names and the DTCG-reader half's, computed from the consumer's own source, and this
 * file never sees that source (R9: context-free, no source path reaches it). Validating only
 * this half's constant, shipped-property set was a check that could not fail for any
 * consumer on any input (measured at head `e557647`). The
 * check now lives in `facade.ts`'s `build`, the one function holding both halves at once,
 * computed BEFORE either composition runs (this function included).
 *
 * R24: `overrides` is plumbed straight through to `runPipeline`, never a hardcoded `{}`.
 *
 * R25/R26: this path never calls `assertContrastFloors` (which THROWS on a contrast
 * verdict) and never calls `runContrastHarness` at all, so no contrast ratio, verdict or
 * badge can reach the consumer's build in any form — stronger than R26 strictly requires
 * (which only forbids the OUTPUT), chosen because it is the simplest way to guarantee R26
 * holds with no separate suppression step to keep in sync. `checkSameStepLint` runs with
 * `source: 'consumer'` (R25's second clause: a source-conditioned guard is invoked with the
 * consumer's own source-class), so every violation it finds is REPORTED and none fails the
 * build. Its one unconditional throw is a fail-closed guard on the pair-declaration source
 * being absent; that source is this package's own shipped `tokens.json`, and no input this
 * entry point accepts can empty it, so the throw is unreachable from a consumer's own
 * values. The guarantee is the ENTRY POINT'S input set, not the function: if a
 * consumer-supplied adjacency source ever reaches this call, this sentence stops being true.
 */

import path from 'node:path'

import type { OutputFile } from '../builder.ts'
import type { PerStepOverrides, Seeds } from './pipeline.ts'
import type { SeedInputs } from './seed-input.ts'

import { composeBuildRecord } from './build-record.ts'
import { checkSameStepLint } from './contrast.ts'
import { emitCss } from './emit.ts'
import { composePaletteRecord } from './palette-record.ts'
import { runPipeline } from './pipeline.ts'
import { DEFAULT_ENV, type SeedRecord } from './ramp.ts'

// Exported so a regression test can compare `emitCss(result)` (Nave's own layer) against
// `emitCss(result, CONSUMER_LAYER)` (this path) over the SAME layer this function actually
// uses, rather than a second, independently-typed literal that could silently drift from it
// (see this file's own `composeConsumerBuild` docblock).
export const CONSUMER_LAYER = 'tokens.presets'

export interface ConsumerBuildOptions {
  seeds: Seeds
  /**
   * R20: the seed AS GIVEN, for each seed that arrived as a CSS string, so `build-record.json`
   * records the string and its form rather than only the OKLCH it became. A seed absent here
   * is recorded as the authored OKLCH triple `seeds` holds.
   */
  seedInputs?: SeedInputs
  overrides?: PerStepOverrides
  env?: ReadonlyMap<number, number>
  outDir?: string
}

export interface ConsumerBuildComposition {
  /**
  The theming layer's CSS, to be appended to the DTCG-reader half's `tokens.css` content.
   */
  css: string
  /**
  Exactly R6's two theming-half artifacts: `palette-record.json` and `build-record.json`.
   */
  files: OutputFile[]
  /**
   * R35: the PRIMARY seed's own record from this run — the seed as actually resolved (post
   * gamut-normalisation) and the substitution flags that fired for it. Surfaced so a caller
   * (`facade.ts`'s `build`) can report what the pipeline actually built from, rather than
   * re-deriving or re-stating a value this function never returned.
   */
  primaryRecord: SeedRecord
}

const json = (value: unknown): string => JSON.stringify(value, undefined, 2)

/**
 * Composes the theming layer's CSS and artifacts for a consumer build. Never validates
 * against the core contract manifest (R16 moved that check to `facade.ts`'s `build`, the
 * site that holds both halves — see this file's own header); never throws on a contrast
 * verdict over the consumer's own values (R25), and never computes or prints one (R26).
 *
 * This path never calls `assertNoticeIsEmitted` (unlike
 * `build-step.ts`'s `composeThemingOutputs`, which asserts it twice, once per notice
 * constant, right after its own `emitCss(result)` call). The presence guarantee for
 * `RETHEMING_NOTICE` and `FEEDBACK_SHARED_IDENTITY_NOTICE` on THIS path rests entirely on
 * `emitCss` producing byte-identical notice-carrying lines regardless of the `layer`
 * argument — true today (verified), and guarded by an operational regression test in
 * `consumer-build.test.ts` that fails the moment it stops being true. If `emitCss` is ever
 * changed to branch its output on `layer` in a way that touches either notice's carrying
 * lines, that test goes red and this guarantee breaks — wiring `assertNoticeIsEmitted` in
 * here directly must be revisited (do not add it preemptively:
 * per R25/R26 this path never throws on or prints a contrast verdict, and a Nave-side
 * notice bug must not fail a consumer's own build).
 */
export function composeConsumerBuild(options: ConsumerBuildOptions): ConsumerBuildComposition {
  const { seeds, seedInputs = {}, overrides = {}, env = DEFAULT_ENV, outDir = 'dist' } = options

  const result = runPipeline(seeds, overrides, env)
  const emitted = emitCss(result, CONSUMER_LAYER)

  // R25's second clause: the same-step lint is source-conditioned and is invoked with the
  // consumer's own source-class in every call reachable from this entry point, so every
  // violation it finds is reported and none fails the build. Its one unconditional throw
  // guards the pair-declaration source being absent, which is this package's own shipped
  // source rather than a consumer input. Deliberately not read further: R26 forbids
  // surfacing a contrast number, verdict or badge, so nothing here inspects or forwards
  // its result.
  checkSameStepLint(result, 'consumer')

  return {
    css: emitted.css,
    files: [
      {
        // The SAME composition Nave's own build emits (`palette-record.ts`), so the
        // consumer's copy carries R18a's `$description` strings exactly as Nave's does.
        // That module is context-free by construction (no path read at load or at call
        // time), which is what makes sharing it legal on this path under R9.
        destination: path.join(outDir, 'palette-record.json'),
        content: json(composePaletteRecord(result)),
      },
      {
        destination: path.join(outDir, 'build-record.json'),
        content: json(composeBuildRecord(seeds, result, undefined, seedInputs)),
      },
    ],
    primaryRecord: result.records.primary,
  }
}
