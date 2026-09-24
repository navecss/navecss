/**
 * `PerStepOverrides` (`Partial<Record<'danger' | 'neutral' |
 * 'primary', Record<number, number>>>`) is a SHAPE, and until this module existed nothing
 * checked it — `facade.ts` used to do `JSON.parse(raw) as PerStepOverrides`, a type
 * ASSERTION the compiler erases and the runtime never enforces, so `[1,2,3]` or
 * `{"ramp":"not an object"}` both parsed as valid JSON and were silently accepted, the build
 * reporting success while every override was ignored. Every rejection here is a `UsageError`
 * (R4): a malformed override file is a usage error, not a build-time failure on the
 * pipeline's merits.
 */
import { readFile } from 'node:fs/promises'

import type { PerStepOverrides } from './theming/pipeline.ts'

import { UsageError } from './errors.ts'
import { OVERRIDE_SCALE_NAMES } from './theming/pipeline.ts'

// Derived from `pipeline.ts`'s `OVERRIDE_SCALE_NAMES`, the one canonical
// home for R31's three scale names — this used to be a second, independent declaration of
// the same three strings.
const OVERRIDE_STEP_NAMES = new Set<string>(OVERRIDE_SCALE_NAMES)

/**
 * One word describing the JSON TYPE of `value`, for a usage-error message — never the value
 * itself, which may be arbitrarily large or (harmlessly) sensitive-looking.
 */
function describeJsonValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}

/**
Narrows `value` to a non-array, non-null object — the shape every level of `PerStepOverrides` requires.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
Checks `value` against `PerStepOverrides`'s real shape, throwing a `UsageError` naming `filePath` on any mismatch.
 */
function validatePerStepOverrides(value: unknown, filePath: string): PerStepOverrides {
  if (!isPlainObject(value)) {
    throw new UsageError(
      `the per-step override file at "${filePath}" must be a JSON object, got ${describeJsonValue(value)}.`,
    )
  }
  for (const [step, stepOverrides] of Object.entries(value)) {
    if (!OVERRIDE_STEP_NAMES.has(step)) {
      throw new UsageError(
        `the per-step override file at "${filePath}" names an unrecognised step "${step}" ` +
          `(expected one of: ${OVERRIDE_SCALE_NAMES.join(', ')}).`,
      )
    }
    if (!isPlainObject(stepOverrides)) {
      throw new UsageError(
        `the per-step override file at "${filePath}"'s "${step}" entry must be an object ` +
          `mapping step numbers to override amounts, got ${describeJsonValue(stepOverrides)}.`,
      )
    }
    for (const [rung, amount] of Object.entries(stepOverrides)) {
      if (!Number.isFinite(Number(rung))) {
        throw new UsageError(
          `the per-step override file at "${filePath}"'s "${step}" entry has a non-numeric ` +
            `step key "${rung}".`,
        )
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        throw new UsageError(
          `the per-step override file at "${filePath}"'s "${step}.${rung}" value must be a ` +
            `finite number, got ${describeJsonValue(amount)}.`,
        )
      }
    }
  }
  return value
}

/**
 * Reads and parses `filePath` as `PerStepOverrides` JSON, or returns `{}` when unnamed. An
 * unreadable path, malformed JSON, or a well-formed JSON value of the wrong SHAPE is a
 * `UsageError` (R4), not a build-time failure.
 */
export async function readOverrides(filePath: string | undefined): Promise<PerStepOverrides> {
  if (!filePath) return {}
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    throw new UsageError(
      `could not read the per-step override file at "${filePath}": ${(error as Error).message}`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new UsageError(
      `the per-step override file at "${filePath}" is not valid JSON: ${(error as Error).message}`,
    )
  }
  return validatePerStepOverrides(parsed, filePath)
}
