#!/usr/bin/env node
/**
 * R1 (this package's token-build requirements): `bin: navecss-tokens`, a thin argv wrapper
 * parsing into the SAME options object `facade.ts`'s `build`/`validate` accept — no pipeline
 * logic here, only argv parsing, the subcommand dispatch, R4's exit-code mapping, and
 * R17/R18/R35's stdout/stderr shape. `@navecss/cli` may wrap `build`/`validate` later as
 * pure UX; it must never own the pipeline, and neither does this file.
 *
 * R4: the exit-code SET is `{0, 1, 2}` and nothing else ever sets `process.exitCode`.
 * `0` — built, `validate` found nothing missing, or `--help`/`-h` printed usage. A `build`
 *   whose installed `@navecss/core` is skewed against the manifest's recorded producer
 *   version is STILL `0` — the skew is printed to stderr as an advisory alongside the R35
 *   stdout line, never as a merits failure; widening `build`'s exit-code behaviour for a
 *   skew is a deliberately separate, out-of-scope decision.
 * `1` — the thing failed on its merits: a seed the pipeline accepted but the composed
 *   result could not satisfy the contract (`MissingContractTokensError`), a name declared by
 *   both the token source and the generated theming layer in one run (`TokenCollisionRefusal`),
 *   two paths in the token source resolving to the same emitted name
 *   after name computation (`DuplicateTokenNameRefusal`), or `validate`
 *   found a missing name, a version skew, an unrecognised manifest format, or an installed
 *   `@navecss/core` present but whose version could not be determined via R14's mandated route.
 * `2` — usage or configuration error: an unknown subcommand, a missing required flag, an
 *   unparsable seed (`SeedIngestRefusal` — `R4`'s own worked example), an
 *   unreadable/malformed/wrongly-shaped override file, a
 *   `validate` source with the wrong extension or malformed JSON, or an installed
 *   `@navecss/core` whose `package.json` could not be read. `UsageError` covers all of
 *   these in one type.
 *
 * R3: no config-file discovery of any kind is implemented anywhere in this file or in
 * `facade.ts` — every input this entry point reads is named by a flag on the invoking
 * command, or defaulted from a fixed location inside this package's own installed
 * directory (`facade.ts`'s `PACKAGE_ROOT`), never discovered by searching the caller's
 * working directory or its ancestors.
 */
import { parseArgs } from 'node:util'

import {
  build,
  DuplicateTokenNameRefusal,
  formatVersionSkewFact,
  MissingContractTokensError,
  SeedIngestRefusal,
  TokenCollisionRefusal,
  type TokensBuildOptions,
  type TokensBuildResult,
  type TokensValidateOptions,
  UsageError,
  validate,
} from './facade.ts'

/**
 * R35's one qualifier, naming which of `normalizeSeed`'s three ways the primary seed was
 * moved to fit sRGB, or the empty string when it was not moved at all.
 */
function normalizationQualifier(seedNormalization: TokensBuildResult['seedNormalization']): string {
  switch (seedNormalization) {
    case 'chroma-reduced': {
      return ' (chroma reduced to fit sRGB)'
    }
    case 'mapped-to-black': {
      return ' (mapped to black to fit sRGB)'
    }
    case 'mapped-to-white': {
      return ' (mapped to white to fit sRGB)'
    }
    default: {
      return ''
    }
  }
}

const USAGE =
  'Usage:\n' +
  '  navecss-tokens build --seed=<colour> --out=<dir> [--source=<file>] [--overrides=<file>]\n' +
  '  navecss-tokens validate --source=<file>'

/**
 * R3: the `build` subcommand's argv surface is exactly R3's four inputs plus `--out`; no
 * other flag exists (`node:util`'s `parseArgs` runs in `strict` mode, which refuses any
 * flag not declared below on its own).
 */
function parseBuildArgs(args: string[]): TokensBuildOptions {
  let values: { out?: string; overrides?: string; seed?: string; source?: string }
  try {
    ;({ values } = parseArgs({
      args,
      options: {
        out: { type: 'string' },
        overrides: { type: 'string' },
        seed: { type: 'string' },
        source: { type: 'string' },
      },
      strict: true,
    }))
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
  if (!values.seed) throw new UsageError(`build requires --seed=<colour>.\n${USAGE}`)
  if (!values.out) throw new UsageError(`build requires --out=<dir>.\n${USAGE}`)
  return {
    outDir: values.out,
    seed: values.seed,
    ...(values.source !== undefined && { source: values.source }),
    ...(values.overrides !== undefined && { overrides: values.overrides }),
  }
}

/**
 * R15/AC-token-build-15: `validate`'s own single input, its source, named `--source`
 * exactly as `build`'s token-source-in flag is — one flag name for the same conceptual
 * input across both subcommands.
 */
function parseValidateArgs(args: string[]): TokensValidateOptions {
  let values: { source?: string }
  try {
    ;({ values } = parseArgs({ args, options: { source: { type: 'string' } }, strict: true }))
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
  if (!values.source) throw new UsageError(`validate requires --source=<file>.\n${USAGE}`)
  return { source: values.source }
}

/**
 * `--help`/`-h` is the single most likely first invocation of a
 * brand-new binary, and it used to be indistinguishable from a mistake — the top-level path
 * reported "unknown subcommand", and `node:util`'s `parseArgs` (`strict: true`) rejected it
 * under `build`/`validate` with "Unknown option", printing no usage at all. Checked before
 * any subcommand dispatch or argv parsing runs, so it never reaches either failure path.
 */
function isHelpRequest(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h')
}

/**
 * Dispatches on the subcommand and returns the exit code its own outcome maps to; a thrown
 * error (a refusal, a usage problem) is mapped to its exit code by the `try`/`catch` below.
 */
async function main(): Promise<number> {
  const [subcommand, ...rest] = process.argv.slice(2)

  if (subcommand === '--help' || subcommand === '-h') {
    console.log(USAGE)
    return 0
  }

  if (subcommand === 'build') {
    if (isHelpRequest(rest)) {
      console.log(USAGE)
      return 0
    }
    const result = await build(parseBuildArgs(rest))
    // R35: one line, naming the seed as resolved and the files written, nothing more. When
    // gamut normalisation moved the seed to fit sRGB, the same line says how.
    console.log(
      `Built from seed ${result.resolvedSeed}${normalizationQualifier(result.seedNormalization)}: ${result.files.join(', ')}`,
    )
    // An ADVISORY only — printed alongside the R35 line above, to stderr, never replacing it,
    // and never changing the exit-code contract's `{0, 1, 2}` set (still exactly `0` here in
    // every case, skew or no skew; widening `build`'s exit-code behaviour for a skew is a
    // deliberately separate, out-of-scope decision).
    if (result.versionSkew) {
      const { producerName, ...skew } = result.versionSkew
      console.error(
        `Version skew: ${formatVersionSkewFact(producerName, skew)}. The generated file may ` +
          `not carry every custom-property name the installed ${producerName} actually renders.`,
      )
    }
    return 0
  }

  if (subcommand === 'validate') {
    if (isHelpRequest(rest)) {
      console.log(USAGE)
      return 0
    }
    const result = await validate(parseValidateArgs(rest))
    // R17/R18: the validator's own rendered report, one line per array member.
    for (const line of result.output) console.log(line)
    return result.exitCode
  }

  throw new UsageError(`unknown subcommand "${subcommand ?? ''}".\n${USAGE}`)
}

try {
  process.exitCode = await main()
} catch (error) {
  if (error instanceof UsageError || error instanceof SeedIngestRefusal) {
    console.error(error.message)
    process.exitCode = 2
  } else if (
    error instanceof MissingContractTokensError ||
    error instanceof TokenCollisionRefusal ||
    error instanceof DuplicateTokenNameRefusal
  ) {
    console.error(error.message)
    process.exitCode = 1
  } else {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
