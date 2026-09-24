/**
 * R19, R20, R21, R22, R23: seed-string ingest. Every form the accepted theming
 * specification's R5 accepts
 * (hex at four widths, rgb(), hsl(), oklch(), lab(), lch(), color() in `srgb` and
 * `display-p3`) is parsed here or in the two `seed-form-parsers*.ts` modules and converted to
 * OKLCH exactly once, at ingest, before anything downstream sees it (R19). lab(), lch() and
 * color(display-p3 …) go through the CIE XYZ route in `css-color-4.ts`, whose matrices are
 * transcribed from the specification's sample code and checked against the CSS Color 4 test
 * suite's published vectors (`test/theming/css-color-4-vectors.test.ts`). `parseSeed` returns
 * the seed AS GIVEN alongside its OKLCH (`SeedInput`, the build record's R20 shape);
 * `ingestSeed` returns the OKLCH alone.
 *
 * R21: four refusal classes, one error shape, one required content set (input verbatim, which
 * of R5's two acts refused it, a fix stated as an act on the file, a pointer to the accepted
 * list) — `seed-refusal.ts`. R22: the three per-class wording constraints. R23: a refusal is a
 * THROWN error and this module performs no filesystem/process/console I/O at all (checked by a
 * source-text guard in the test), so a refusal can never itself have produced or printed
 * anything; `composeConsumerBuildFromRawSeeds` ingests both colour seeds BEFORE calling
 * `composeConsumerBuild`, the same ordering discipline `facade.ts`'s `build` applies to R16's
 * manifest check (from an earlier review round: this sentence used to say it
 * mirrored `consumer-build.ts`'s own "validate before generate" ordering, and the commit that
 * moved the manifest check to `facade.build` deleted exactly that mechanism —
 * `consumer-build.ts`'s header now says in terms that it does NOT validate against the
 * manifest). R23's other two clauses (a non-zero exit code, and the refusal written to the error
 * channel) have no surface in this slice: there is no bin and no process boundary here, and
 * `composeConsumerBuild` writes no file at all (it returns its artifacts in memory), so the
 * on-disk half rests on ORDERING and not on an observed output directory. Both land with the
 * facade.
 */

import type { Oklch } from './color-math.ts'
import type { ConsumerBuildComposition, ConsumerBuildOptions } from './consumer-build.ts'
import type { HexWidth, SeedInput } from './seed-input.ts'

import { composeConsumerBuild } from './consumer-build.ts'
import { CSS_NAMED_COLOURS } from './css-named-colours.ts'
import { ingestColor, ingestLab, ingestLch } from './seed-form-parsers-css-color-4.ts'
import {
  ingestHex,
  ingestHsl,
  ingestOklch,
  ingestRgb,
  RECOGNISED_ALIASED_FUNCTIONS,
} from './seed-form-parsers.ts'
import {
  badChannelValue,
  CONTEXT_DEPENDENT_FIX,
  NAMED_COLOUR_FIX,
  SeedIngestRefusal,
  unrecognisedForm,
} from './seed-refusal.ts'

export { SeedIngestRefusal } from './seed-refusal.ts'

/**
 * True when `input` contains a reference that only resolves at browser time — `currentColor`,
 * `var()`, relative colour syntax, `light-dark()` or `env()` — wherever it sits in the string.
 */
function isContextDependentForm(input: string): boolean {
  // A reference resolves at browser time wherever it sits in the input, so these match
  // ANYWHERE and not only in the leading position: `rgb(var(--r) 0 0)` is as
  // context-dependent as `var(--brand)`. Anchoring them let a nested reference fall
  // through to the numeric parsers as NaN (caught in an earlier review round).
  if (/\bcurrentcolor\b/i.test(input)) return true
  if (/\bvar\(/i.test(input)) return true
  // Relative colour syntax: `<function>(from ...)`, in any accepted or unaccepted function.
  if (/\(\s*from\s+/i.test(input)) return true
  // `light-dark()` resolves against the active color-scheme, and `env()` against the user
  // agent's environment — both at browser time, neither at build time (same class as `var()`,
  // not R21's "unrecognised form": both names are recognised, just not build-time-resolvable).
  if (/\blight-dark\(/i.test(input)) return true
  if (/\benv\(/i.test(input)) return true
  return false
}

/**
 * The class-specific detail sentence naming which context-dependent mechanism `input` used.
 */
function contextDependentDetail(input: string): string {
  if (/\bcurrentcolor\b/i.test(input)) {
    return 'this seed refers to `currentColor`, which resolves only where an element renders, not at build time.'
  }
  if (/\(\s*from\s+/i.test(input)) {
    return 'this seed uses relative colour syntax, which substitutes at browser time against a live declaration, not against a build-time input.'
  }
  if (/\blight-dark\(/i.test(input)) {
    return 'this seed calls `light-dark()`, which resolves against the active color-scheme at browser time, not at build time.'
  }
  if (/\benv\(/i.test(input)) {
    return "this seed calls `env()`, which resolves against the user agent's environment at browser time, not at build time."
  }
  return 'this seed refers to a custom property or another declaration, which resolves only at browser time, not at build time.'
}

/**
 * Hex-shaped input (leading `#`) that isn't one of the four accepted digit counts, or whose
 * digits aren't hex at all. Hex IS one of R5's accepted forms, so this is a `channel-value`
 * refusal, never `form-acceptance` — mirroring the function forms' own bad-channel handling,
 * which the round-2 act fix reached but this hex branch did not.
 */
function badHexRefusal(raw: string, input: string): SeedIngestRefusal {
  const body = input.slice(1)
  if (/^[\dA-Fa-f]+$/.test(body)) {
    return badChannelValue(raw, 'hex', `it needs 3, 4, 6 or 8 digits and this has ${body.length}.`)
  }
  return badChannelValue(raw, 'hex', 'its digits could not be read as hexadecimal.')
}

/**
 * Dispatches a function-shaped input (`name(args)`) to its parser, returning the seed AS GIVEN
 * with its OKLCH, or throws `unrecognisedForm` for a function name not on R5's accepted list
 * at all (e.g. `hwb()`). `name` arrives lower-cased.
 */
function ingestFunctionForm(raw: string, name: string, args: string): SeedInput {
  if (name === 'lab') return { form: 'lab', raw, value: ingestLab(raw, args) }
  if (name === 'lch') return { form: 'lch', raw, value: ingestLch(raw, args) }
  if (name === 'color') {
    const { space, value } = ingestColor(raw, args)
    return { form: 'color', raw, space, value }
  }
  const recognised = RECOGNISED_ALIASED_FUNCTIONS[name]
  if (recognised === 'rgb') return { form: 'rgb', raw, value: ingestRgb(raw, args) }
  if (recognised === 'hsl') return { form: 'hsl', raw, value: ingestHsl(raw, args) }
  if (recognised === 'oklch') return { form: 'oklch', raw, value: ingestOklch(raw, args) }
  throw unrecognisedForm(raw)
}

/**
 * R19/R20/R21/R22/R23: parses a raw CSS colour string as a seed into the seed AS GIVEN plus the
 * OKLCH it converts to (before any gamut normalisation), or throws `SeedIngestRefusal` in one of
 * R21's four classes.
 */
export function parseSeed(raw: string): SeedInput {
  const input = raw.trim()

  // Context-dependent forms are checked FIRST: they can wear the syntax of an otherwise
  // recognised function (`oklch(from ...)`), so must be classified before form-name parsing
  // would otherwise attempt (and fail) to treat them as a literal.
  if (isContextDependentForm(input)) {
    throw new SeedIngestRefusal({
      act: 'form-acceptance',
      detail: contextDependentDetail(input),
      fix: CONTEXT_DEPENDENT_FIX,
      input: raw,
      refusalClass: 'context-dependent-form',
    })
  }

  const hexMatch = /^#([\dA-Fa-f]{3}|[\dA-Fa-f]{4}|[\dA-Fa-f]{6}|[\dA-Fa-f]{8})$/.exec(input)
  if (hexMatch) {
    const digits = hexMatch[1]!
    return {
      form: 'hex',
      raw,
      value: ingestHex(raw, digits),
      width: digits.length as HexWidth,
    }
  }
  if (input.startsWith('#')) throw badHexRefusal(raw, input)

  const fnMatch = /^([a-zA-Z-]+)\(([\s\S]*)\)$/.exec(input)
  if (fnMatch) return ingestFunctionForm(raw, fnMatch[1]!.toLowerCase(), fnMatch[2]!)

  if (/^[a-zA-Z]+$/.test(input) && CSS_NAMED_COLOURS.has(input.toLowerCase())) {
    throw new SeedIngestRefusal({
      act: 'form-acceptance',
      detail: `\`${input}\` is a valid CSS named colour, not accepted as a seed form at 0.1.0 (a scope limit, not a defect in the input).`,
      fix: NAMED_COLOUR_FIX,
      input: raw,
      refusalClass: 'named-colour',
    })
  }

  throw unrecognisedForm(raw)
}

/**
 * The OKLCH half of `parseSeed`, for callers that need the colour and not the record of what
 * was given.
 */
export function ingestSeed(raw: string): Oklch {
  return parseSeed(raw).value
}

interface RawConsumerSeeds {
  danger: string
  declaredTintHue: number
  primary: string
}

export interface RawConsumerBuildOptions extends Omit<
  ConsumerBuildOptions,
  'seedInputs' | 'seeds'
> {
  seeds: RawConsumerSeeds
}

/**
 * A pre-R1 building block: ingests the two colour seed fields (R21-R23's refusal classes)
 * BEFORE `composeConsumerBuild` ever runs, so a refusal never reaches the artifact-producing
 * step (R23) — the same ordering discipline `facade.ts`'s `build` applies to R16's manifest
 * check, which is where that check now lives (`consumer-build.ts` no
 * longer validates against the manifest at all, so this docblock no longer points there).
 *
 * NO PRODUCTION CALLER (raised in an earlier review round). This sentence used to
 * read "R1's eventual façade calls this or something shaped like it", in the future tense.
 * The façade exists: `facade.ts`'s `build` calls `parseSeed` and `composeConsumerBuild`
 * directly rather than going through this wrapper, so the only remaining exercisers are the
 * `AC-token-build-23` cases in `test/theming/seed-ingest.test.ts` (`AC-token-build-23` also
 * has a facade-level case, so this is a note about where evidence sits, not a coverage
 * hole). Whether the wrapper should survive that is a scope call, not a docblock's to make.
 * It is not exported from the package either way (R2's narrow-façade rule governs the PUBLIC
 * surface, not this internal step, exactly as `composeConsumerBuild` itself is already an
 * internal, unexported building block).
 */
export function composeConsumerBuildFromRawSeeds(
  options: RawConsumerBuildOptions,
): ConsumerBuildComposition {
  const primary = parseSeed(options.seeds.primary)
  const danger = parseSeed(options.seeds.danger)
  return composeConsumerBuild({
    ...options,
    seedInputs: { danger, primary },
    seeds: {
      danger: danger.value,
      declaredTintHue: options.seeds.declaredTintHue,
      primary: primary.value,
    },
  })
}
