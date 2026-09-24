/**
 * G1 theming pipeline build step — colour is generated, not hand-authored, so it runs
 * outside the DTCG reader's alias resolution (R9, R11, R37). Composes the semantic colour
 * layer onto the CSS the reader already built and composes the generated artifacts beside
 * it. Kept out of `build.ts`, at an architecture reviewer's request, so that file stays a
 * thin caller.
 *
 * Two properties this file owns, and both are structural rather than incidental.
 *
 * `AC-theming-05`: a failing build writes NOTHING. Every guard below, and every byte of
 * every artifact, is composed in memory; the caller's single `writeOutputs` phase is the
 * only writer, so a guard that throws leaves `dist/tokens.css` either absent or at its
 * previous complete content and never half-regenerated.
 *
 * A check that exists but is not wired in cannot catch what it exists to catch: every guard
 * whose binding surface exists at build time runs HERE, on the real build, not only in
 * `test/`. The one guard that is deliberately not wired is named below with its reason.
 */

import path from 'node:path'

import type { OutputFile } from '../builder.ts'
import type { PipelineResult, Seeds } from './pipeline.ts'

import { collectDescriptionsFromSources } from '../dtcg-descriptions.ts'
import {
  assertCoverageFloor,
  assertNoFocusableAdjacentToActionFill,
  assertNoForbiddenAdjacency,
  assertNoOrphanedSemanticSlot,
  assertShippedSurfaceCountProvenance,
  type OrphanCheckResult,
} from './adjacency.ts'
import { composeBuildRecord } from './build-record.ts'
import { composeContactSheet, type SheetColumn } from './contact-sheet.ts'
import {
  assertContrastFloors,
  assertFloorProvenance,
  assertNoSameStepViolations,
  checkSameStepLint,
  runContrastHarness,
} from './contrast.ts'
import {
  assertDescriptionsAreClean,
  assertHarnessFramingIsClean,
  assertNoticeIsClean,
  assertNoticeIsEmitted,
  FEEDBACK_SHARED_IDENTITY_NOTICE,
  RETHEMING_NOTICE,
} from './copy-lint.ts'
import { buildCoreContractManifest } from './core-source.ts'
import { SLOT_DESCRIPTIONS } from './descriptions.ts'
import { emitCss } from './emit.ts'
import { assertLadderOrder } from './ladder.ts'
import { assertNeutralChromaCeilingWithinMargin } from './neutral.ts'
import { assertOnStarShape } from './on-star.ts'
import { composePaletteRecord } from './palette-record.ts'
import { runPipeline } from './pipeline.ts'
import { ADVERSARIAL_SEEDS, DEFAULT_ENV } from './ramp.ts'
import { SEMANTIC_SLOTS } from './semantics.ts'
import { SHIPPED_SEEDS } from './shipped-seeds.ts'
import { TOKENS_JSON_PATH } from './tokens-source.ts'

export interface ThemingBuildOptions {
  distDir?: string
  env?: ReadonlyMap<number, number>
  seeds?: Seeds
  /**
   * The DTCG source file(s) `runSourceGuards` lints alongside `SLOT_DESCRIPTIONS`.
   * Defaults to the single-entry list `[TOKENS_JSON_PATH]` — imported
   * from `tokens-source.ts`, which is the one canonical home for the shipped `tokens.json`
   * path; this file deliberately resolves no second copy of it. A test overrides this to
   * inject a synthetic fixture without touching the tracked file.
   */
  tokensSourcePaths?: readonly string[]
}

/**
 * The source-level guards: they read Nave's own declarations rather than a pipeline result,
 * so they run before anything is generated and fail the build on their own terms.
 *
 * R22 (`AC-theming-26` in part, see below; `AC-theming-51`, `AC-theming-53`), R18e
 * (`AC-theming-54`), R29 (`AC-theming-33`), R34/R35/R36 (the conformance-framing lints).
 *
 * **What `AC-theming-26` is and is NOT enforced for here, stated because the criterion's two
 * clauses are not the same check.** `assertNoOrphanedSemanticSlot` is keyed by SLOT, so it
 * enforces SLOT-LEVEL orphaning: a semantic slot mentioned NOWHERE in the declaration —
 * neither as a subject nor as a partner — fails the build naming that slot, which covers the
 * criterion's new-token clause and the deletion case where the deleted entry was a slot's
 * only mention. It does NOT enforce the criterion's PAIR-LEVEL clause ("rather than
 * producing a smaller pair set that the R21 check would pass"): deleting one declared pair
 * from a slot that keeps other mentions leaves every guard here green and the pair set
 * silently smaller. That residual is real and is carried forward as a known gap (a
 * pair-level / per-category coverage check), deliberately deferred; nothing below closes it.
 */
function runSourceGuards(tokensSourcePaths: readonly string[]): OrphanCheckResult {
  assertNoForbiddenAdjacency()
  assertNoFocusableAdjacentToActionFill()
  assertCoverageFloor()
  // A slot resolving through the OPEN channel (neither declared nor a
  // settled exclusion) does not fail this build, and does not pass silently either — its
  // own "visible count" is the typed `open` field on the returned report. `no-console`
  // stays on everywhere but the two named build-progress scripts (eslint.config.js), so
  // this guard is not the place to print it; the composed build record is the report
  // surface instead — the caller below reads this return value and threads it into
  // `dist/build-record.json` rather than discarding it as a bare statement.
  const orphanCheck = assertNoOrphanedSemanticSlot(SEMANTIC_SLOTS)
  assertOnStarShape()
  assertLadderOrder()
  assertNoticeIsClean()
  assertNoticeIsClean(FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice')
  assertHarnessFramingIsClean()
  // The floor constants' citation and the neutral chroma
  // ceiling's own margin bound, both source-level and independent of the pipeline result.
  assertFloorProvenance()
  assertNeutralChromaCeilingWithinMargin()
  // The shipped surface count's own provenance record, same
  // shape as assertFloorProvenance above.
  assertShippedSurfaceCountProvenance()

  // Both description surfaces, not just the narrower one: SLOT_DESCRIPTIONS is the resolved
  // semantic-slot layer, and tokens.json is the DTCG source itself, read fresh from disk
  // (mirroring CORE_SOURCE_PATHS's own R27 scan).
  // One map per source path (a quality-review finding, F3): merging would let a later file
  // silently overwrite an earlier file's entry at a colliding dotted path, hiding that file's
  // own violation.
  assertDescriptionsAreClean(
    SLOT_DESCRIPTIONS,
    ...collectDescriptionsFromSources(tokensSourcePaths),
  )

  return orphanCheck
}

/**
 * The guards that read a resolved pipeline result: R21's harness with R38's threshold
 * binding (`AC-theming-24`), and R39's same-step lint (`AC-theming-49`) at source `'nave'`,
 * where a hit is severity `'fail'` and therefore fails this build.
 */
function runResultGuards(result: PipelineResult): void {
  assertContrastFloors(runContrastHarness(result))
  // Deliberately two-argument: `adjacency` is left to `checkSameStepLint`'s own ADJACENCY
  // default (contrast.ts), not passed explicitly. `build-step.test.ts`'s R39 mocks branch on
  // `adjacency !== undefined` so that ONLY this bare call site gets the mock's synthetic
  // severity override; the callers that DO pass one are `copy-lint.ts`'s two probes, reached
  // from `assertHarnessFramingIsClean()` in `runSourceGuards` above in this same production
  // run, and they get the real function. The coupling is production-to-production. Passing
  // the default explicitly here would flip this site to the real function too: the 'fail'
  // test reddens loudly and the 'report' test stays green vacuously.
  assertNoSameStepViolations(checkSameStepLint(result, 'nave'))
}

/**
 * R7/R8: one pipeline run per seed in R8's adversarial set alongside the shipped default,
 * which is what makes the contact sheet's columns real second computations rather than the
 * default column relabelled. Only the `primary` seed varies; `danger` and the declared tint
 * default stay the build's own, so each column is the palette that seed would actually ship.
 */
function contactSheetColumns(
  seeds: Seeds,
  shipped: PipelineResult,
  env: ReadonlyMap<number, number>,
): SheetColumn[] {
  const columns: SheetColumn[] = [
    { name: 'teal (shipped default)', seed: seeds.primary, result: shipped },
  ]
  for (const { name, seed } of ADVERSARIAL_SEEDS) {
    columns.push({ name, seed, result: runPipeline({ ...seeds, primary: seed }, {}, env) })
  }
  return columns
}

const json = (value: unknown): string => JSON.stringify(value, undefined, 2)

export interface ThemingComposition {
  /**
  The semantic colour layer, appended to the CSS the DTCG reader composed.
   */
  css: string
  /**
  Every generated artifact beside `tokens.css`, composed and not yet written.
   */
  files: OutputFile[]
}

/**
 * Runs the pipeline, runs every wired guard, and composes every theming artifact. Writes
 * nothing: a throw from any guard here happens before the caller's write phase, which is
 * `AC-theming-05`'s "fails before any artifact is written".
 */
export function composeThemingOutputs(options: ThemingBuildOptions = {}): ThemingComposition {
  const {
    distDir = 'dist',
    env = DEFAULT_ENV,
    seeds = SHIPPED_SEEDS,
    tokensSourcePaths = [TOKENS_JSON_PATH],
  } = options

  const orphanCheck = runSourceGuards(tokensSourcePaths)

  const result = runPipeline(seeds, {}, env)
  runResultGuards(result)

  const { css } = emitCss(result)

  // R20/R34: the presence guarantee assertNoticeIsClean does not provide (reviewed and
  // cleared by the project's accessibility steward) — each notice must actually reach the
  // composed CSS, not only pass the source-level framing check above. R34's notice (also
  // reviewed and cleared by the accessibility steward) had the identical gap: a build that
  // imported it and forgot to emit it, or emitted a truncated copy, would have passed
  // runSourceGuards() cleanly.
  assertNoticeIsEmitted(css, FEEDBACK_SHARED_IDENTITY_NOTICE, 'Feedback notice')
  assertNoticeIsEmitted(css, RETHEMING_NOTICE, 'Retheming notice')

  return {
    css,
    files: [
      {
        // R37 / R18a (`palette-record.ts` carries the artifact's own scope note): composed by
        // the one shared function, which is also what the consumer path emits.
        destination: path.join(distDir, 'palette-record.json'),
        content: json(composePaletteRecord(result)),
      },
      {
        // R27/R28 + R13/R14, all of which live in `core-source.ts` because they read core's
        // real source over a monorepo-relative path — Nave's own build path only.
        destination: path.join(distDir, 'core-contract.json'),
        content: json(buildCoreContractManifest()),
      },
      {
        // R3(a) part 3, R3(b), R5 rider 1, R6: the "recorded in the build output" clause.
        // The source-guard's open-slot report rides along here rather
        // than being discarded by this module's own caller.
        destination: path.join(distDir, 'build-record.json'),
        content: json(composeBuildRecord(seeds, result, orphanCheck.open)),
      },
      {
        // R7 [blocking]: the approval artifact for ramp quality. `composeContactSheet`
        // checks its own completeness and throws, so `AC-theming-08`'s "a step or a seed
        // missing from the sheet fails the run" fails HERE, before any write.
        destination: path.join(distDir, 'contact-sheet.html'),
        content: composeContactSheet(contactSheetColumns(seeds, result, env)).html,
      },
    ],
  }
}

/**
 * Appends the theming layer to the DTCG reader's composed `tokens.css` and returns the
 * complete output set for one write phase.
 *
 * Deliberately NOT wired here: `checkFeedbackSignal` (R20). Its binding surface is R20's
 * enumerated 0.1.0 artifact set — README, example, recipe and docs code samples — and it
 * takes a `FeedbackArtifact` per sample. No such sample set exists in this package to scan
 * at build time, so wiring it would mean passing it an empty array, which is a green run
 * over nothing rather than a check. It stays covered by `AC-theming-22`'s constructed cases
 * until the artifact surface it ranges over exists.
 */
export function withThemingLayer(
  outputs: readonly OutputFile[],
  options: ThemingBuildOptions = {},
): OutputFile[] {
  const theming = composeThemingOutputs(options)

  const cssName = `${path.sep}tokens.css`
  const withLayer = outputs.map((file) =>
    file.destination.endsWith(cssName) || file.destination === 'tokens.css'
      ? { ...file, content: `${file.content}\n${theming.css}` }
      : file,
  )
  if (withLayer.every((file) => !file.content.includes('/* Nave theming'))) {
    throw new Error(
      'No composed tokens.css to append the semantic colour layer to — the theming layer ' +
        'would be dropped silently. Open an issue rather than working around this check.',
    )
  }
  return [...withLayer, ...theming.files]
}
