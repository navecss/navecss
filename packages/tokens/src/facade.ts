/**
 * R1-R4, R8, R9, R23 (this package's token-build requirements): the narrow public façade (R2)
 * `@navecss/tokens` exports as `./build`, and the one module `bin.ts`'s argv wrapper calls
 * into. Two operations, `build` and `validate`; `validate` runs with no prior `build`
 * (`AC-token-build-01`'s third clause).
 *
 * R3: the public INPUT surface for `build` is exactly the four inputs R3
 * enumerates (token source, output target, seed, per-step override file) plus the output
 * directory; `validate` takes exactly one, its source. No config-file discovery, and no
 * `env` (R2's `{ distDir, env, seeds }` shape is never re-exported).
 *
 * R9: context-free. Every path read is (i) inside THIS package's own installed directory,
 * (ii) a path the caller named, or (iii) a path Node's module resolver returns for another
 * package's `exports` entry (`resolveInstalledCoreVersion`'s `@navecss/core` `"./package.json"`
 * read, R14's mandated route) — never `scanCoreContractFromDisk`, `core-source.ts`, any
 * `packages/core/src` path, or `build-step.ts`. The two non-public seed defaults (`danger`,
 * the declared tint hue) come from `shipped-seeds.ts`, shared with `build-step.ts` so the two
 * paths never drift.
 *
 * A static scanner reads clause (ii) as path traversal: `build` and `validate` read, and `build`
 * writes, whatever path their caller names. That is the contract, and nothing here bounds it.
 * Through the `navecss-tokens` command the caller is the person running it, who can already
 * read and write anything this process can, and a relative path resolves against the working
 * directory they ran it from, as for any other command. Through this `./build` export the caller
 * is another program, and these functions are not a sandbox: a program that forwards a path it
 * did not choose itself (from a request, an upload, a file it does not trust) must check that
 * path before passing it in. Marked at each read site below.
 *
 * R16: `build` validates the UNION
 * of both halves' emitted names — the DTCG half's (the consumer's source, O(1) name
 * computation) and the theming half's (the shipped property constant) — against the manifest
 * BEFORE either is composed. This function holds both halves at once, which is why the check
 * lives here, not in `composeConsumerBuild` (whose own constant-only check, before this
 * validation existed, could not fail for any consumer, ever).
 *
 * R23: a refusal is always a THROW; `build` composes every artifact in memory and writes
 * once, last, via `writeOutputs`, so a thrown error leaves no artifact on disk.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { OutputFile } from './builder.ts'
import type { SeedNormalization } from './theming/color-math.ts'
import type { CoreContractManifest, ManifestVersionSkew } from './theming/core-contract.ts'

import { writeOutputs } from './builder.ts'
import { detectCollidingNames, refuseOnCollision } from './collision.ts'
import { detectVersionSkew } from './core-version.ts'
import { composeDtcgOutputs } from './dtcg-outputs.ts'
import { MissingContractTokensError, UsageError } from './errors.ts'
import { readOverrides } from './overrides.ts'
import { findPackageRoot } from './package-root.ts'
import { formatOklch } from './theming/color-math.ts'
import { composeConsumerBuild } from './theming/consumer-build.ts'
import { validateAgainstManifest } from './theming/core-contract.ts'
import { shippedThemingPropertyNames } from './theming/emit.ts'
import { parseSeed } from './theming/seed-ingest.ts'
import { SHIPPED_SEEDS } from './theming/shipped-seeds.ts'
import { checkManifestFormatSupport, formatValidateReport } from './validate-report.ts'
import {
  computeMissing,
  detectSourceKind,
  namesFromSource,
  splitMissingBySupply,
} from './validate.ts'

/**
 * R4's usage/config-error class: a malformed or missing required argument (an unparsable
 * seed, an unreadable override file, a `validate` source with neither a `.css` nor a `.json`
 * extension — R15 clause 3). Distinct from `MissingContractTokensError` and a seed refusal
 * (the pipeline correctly rejecting build-time INPUT, exit `1`): `UsageError` rejects the
 * CALL ITSELF, before any pipeline work runs. Defined in `./errors.ts`
 * so `validate.ts` can throw it too without a circular import; re-exported unchanged.
 */
export {
  DuplicateTokenNameRefusal,
  MissingContractTokensError,
  TokenCollisionRefusal,
  UsageError,
} from './errors.ts'
// `TokensBuildResult.seedNormalization` is typed `SeedNormalization`; a consumer needs the
// type exported to name it, the same reasoning `PerStepOverrides` is exported for.
export type { SeedNormalization } from './theming/color-math.ts'
// Ruled by an architecture review: `overrides` had no importable type before this — a
// TypeScript consumer could not `satisfies` their own override file against anything.
export type { PerStepOverrides } from './theming/pipeline.ts'
export { SeedIngestRefusal } from './theming/seed-ingest.ts'
// A deliberate public export of `@navecss/tokens/build`: the compiled bin may import only
// the façade (pinned in test/bin.test.ts, AC-token-build-01), and this renders
// `TokensBuildResult.versionSkew` with the same wording `bin.ts` prints.
export { formatVersionSkewFact } from './validate-report.ts'

const PACKAGE_ROOT = findPackageRoot(import.meta.url)

/**
 * R14: reads the manifest from THIS package's own `dist/`, never a consumer's output dir.
 */
async function readManifest(): Promise<CoreContractManifest> {
  const raw = await readFile(path.join(PACKAGE_ROOT, 'dist', 'core-contract.json'), 'utf8')
  return JSON.parse(raw) as CoreContractManifest
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export interface TokensBuildOptions {
  // R21-R23: any CSS colour string `ingestSeed` accepts; ingested exactly once, here.
  seed: string
  /**
   * A DTCG `.json` token source. Defaults to this package's own bundled `tokens.json`
   * (rungs 1b/3/4 re-seed/override without a whole source of their own); rung 5 names its own.
   */
  source?: string
  // A JSON file matching `PerStepOverrides`'s shape (rung 3).
  overrides?: string
  // The output directory; R6's seven artifacts land here.
  outDir: string
}

export interface TokensBuildResult {
  /**
   * R35: the seed as RESOLVED — the post-normalisation seed the pipeline built from, never
   * the raw input nor the pre-normalisation ingest value.
   */
  resolvedSeed: string
  /**
   * Which of `normalizeSeed`'s outcomes moved the primary seed to fit sRGB, `'none'` when it
   * was not moved. `resolvedSeed` is the normalised value whenever this is not `'none'`.
   */
  seedNormalization: SeedNormalization
  /**
  Every file written, output-directory-relative, sorted.
   */
  files: string[]
  /**
   * Always empty on a successful return — a non-empty set
   * throws `TokenCollisionRefusal` instead. Kept as a field so a caller can still probe the
   * detection the refusal reads, without catching.
   */
  collidingNames: string[]
  /**
   * The version-skew fact `validate` already detects, which `build` used
   * to silently skip. `undefined` when it matches, or the installed core could not be resolved
   * at all (`coreProbe.status !== 'resolved'` — a different situation, not a skew). ADVISORY
   * only, never changes `build`'s exit code; `producerName` lets `bin.ts` render the shared
   * `formatVersionSkewFact`. Widening the exit-code contract's `{0, 1, 2}` set for a skew is a
   * deliberately separate, out-of-scope decision.
   */
  versionSkew?: (ManifestVersionSkew & { producerName: string }) | undefined
}

/**
 * R1/R2/R3/R6/R7/R9/R10/R16/R23/R24-R26: the consumer-invocable build. Ingests `seed`
 * (R21-R23's refusal classes), reads `overrides` and `source` if given, validates the UNION
 * of both halves' emitted names against the manifest (R16) BEFORE either is composed,
 * composes the theming half and the DTCG-reader half over the token source into the SAME
 * `tokens.presets` layer (R10), merges the two exactly as Nave's own `withThemingLayer`
 * merges its two halves (string-appends the theming CSS onto the composed `tokens.css`),
 * and writes every artifact in ONE phase, last (R7/R23).
 */
export async function build(options: TokensBuildOptions): Promise<TokensBuildResult> {
  const sourcePath = options.source ?? path.join(PACKAGE_ROOT, 'tokens.json')
  if (!existsSync(sourcePath)) {
    throw new UsageError(`no token source found at "${sourcePath}"`)
  }

  const overrides = await readOverrides(options.overrides)
  const manifest = await readManifest()

  // R19-R23: a refused seed throws before anything else here has read a file or composed a
  // result; an accepted one is converted once, and the string as given reaches the record (R20).
  const primary = parseSeed(options.seed)

  // R16: validate the union (see this file's own header) before either half is composed, so
  // a source-completeness gap surfaces as this named list, not an internal lookup failure.
  // `sourcePath` is the caller's own `--source` (or its default); see this file's header, R9.
  const sourceContent = await readFile(sourcePath, 'utf8')
  const sourceNames = namesFromSource('json', sourceContent, { path: sourcePath })
  const emittedNames = new Set([...sourceNames, ...shippedThemingPropertyNames()])
  const missing = validateAgainstManifest(manifest, emittedNames)
  if (missing.length > 0) throw new MissingContractTokensError(missing)

  // Same check `validate` runs. Run BEFORE any artifact is written — not merely before
  // `writeOutputs`'s own call — so a malformed manifest (an unchecked `readManifest` cast
  // whose `producer` field a later check dereferences) fails loud here, pre-write, keeping
  // R23 rather than degrading a write that already succeeded into a reported failure.
  // Advisory only when it succeeds: never affects what follows.
  const { skew } = await detectVersionSkew(manifest)

  const theming = composeConsumerBuild({
    seedInputs: { primary },
    seeds: {
      danger: SHIPPED_SEEDS.danger,
      declaredTintHue: SHIPPED_SEEDS.declaredTintHue,
      primary: primary.value,
    },
    overrides,
    outDir: options.outDir,
  })

  const dtcgOutputs = await composeDtcgOutputs(sourcePath, options.outDir)

  const cssDestination = path.join(options.outDir, 'tokens.css')
  const collidingNames = detectCollidingNames(dtcgOutputs, cssDestination, theming.css)
  // Thrown here, before `merged`/`allFiles` are built and before
  // `writeOutputs` runs, so R23 holds — a collision refusal leaves nothing on disk.
  refuseOnCollision(collidingNames)

  const merged: OutputFile[] = dtcgOutputs.map((file) =>
    file.destination === cssDestination
      ? { ...file, content: `${file.content}\n${theming.css}` }
      : file,
  )
  const allFiles = [...merged, ...theming.files]

  await writeOutputs(allFiles)

  return {
    resolvedSeed: formatOklch(theming.primaryRecord.usedSeed),
    seedNormalization: theming.primaryRecord.normalization,
    files: allFiles
      .map((file) => path.relative(options.outDir, file.destination))
      .toSorted((a, b) => a.localeCompare(b)),
    collidingNames,
    versionSkew: skew === undefined ? undefined : { ...skew, producerName: manifest.producer.name },
  }
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

export interface TokensValidateOptions {
  // A `.css` artifact or a DTCG `.json` source (R15).
  source: string
}

export interface TokensValidateResult {
  /**
   * R4: `0` when nothing is missing and
   * every check ran. `1` on a merits failure (a missing name, an unrecognised format, a real
   * skew, or an unresolvable installed `@navecss/core`). `2` when its `package.json` could
   * not be read or parsed.
   */
  exitCode: 0 | 1 | 2
  /**
  The validator's rendered report, one line per array member.
   */
  output: string[]
}

/**
 * R1 (runs with no prior `build`)/R12/R14/R15-R18: validates `source` against the shipped
 * core-contract manifest, reading it from THIS package's own `dist/` (R14's third clause,
 * never a consumer's output directory). The four core-version resolution
 * outcomes are never collapsed — "not installed" and "unreadable by the mandated route" used
 * to share one `undefined`, silently skipping the skew check against an older core.
 */
export async function validate(options: TokensValidateOptions): Promise<TokensValidateResult> {
  const kind = detectSourceKind(options.source)
  if (!kind) {
    throw new UsageError(
      `"${options.source}" is neither a .css nor a .json file: validate reads the extension and never guesses the format.`,
    )
  }
  if (!existsSync(options.source)) {
    throw new UsageError(`no file found at "${options.source}"`)
  }

  const manifest = await readManifest()
  // `options.source` is the caller's own argument; see this file's header, R9.
  const content = await readFile(options.source, 'utf8')
  const notDeclared = computeMissing(manifest, kind, content, { path: options.source })
  // A name the theming half emits unconditionally was never "missing" in
  // R4/AC-token-build-04's sense — only the genuinely-missing subset drives the exit code.
  const { missing, supplied } = splitMissingBySupply(kind, notDeclared)

  const { probe: coreProbe, skew: versionSkew } = await detectVersionSkew(manifest)
  const formatRefusal = checkManifestFormatSupport(manifest)

  const output = formatValidateReport(manifest, missing, versionSkew, { ...coreProbe, supplied })

  let exitCode: 0 | 1 | 2
  if (formatRefusal !== undefined) exitCode = 1
  else if (coreProbe.status === 'unreadable') exitCode = 2
  else if (versionSkew !== undefined || missing.length > 0 || coreProbe.status === 'unresolvable') {
    exitCode = 1
  } else exitCode = 0

  return { exitCode, output }
}
