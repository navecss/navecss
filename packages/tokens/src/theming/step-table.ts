/**
 * R2: the shared step table. One row per step number, fixed lightness, identical
 * across every scale and every seed. Normative (the lightness column); the `job`
 * strings are documentation only and are not consumed by the pipeline.
 *
 * 15 rows: 0, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950, 1000.
 */
export const STEP_TABLE: readonly { l: number; step: number }[] = [
  { step: 0, l: 1 },
  { step: 50, l: 0.985 },
  { step: 100, l: 0.965 },
  { step: 150, l: 0.94 },
  { step: 200, l: 0.905 },
  { step: 300, l: 0.835 },
  { step: 400, l: 0.72 },
  { step: 500, l: 0.59 },
  { step: 600, l: 0.47 },
  { step: 700, l: 0.37 },
  { step: 800, l: 0.27 },
  { step: 850, l: 0.225 },
  { step: 900, l: 0.18 },
  { step: 950, l: 0.12 },
  { step: 1000, l: 0 },
]

const STEP_LIGHTNESS: ReadonlyMap<number, number> = new Map(STEP_TABLE.map((r) => [r.step, r.l]))

/**
The step table's fixed lightness for a given step number. Throws on an undefined step (R2).
 */
export function stepLightness(step: number): number {
  const l = STEP_LIGHTNESS.get(step)
  if (l === undefined) {
    throw new Error(
      `Step ${step} is not defined in the shared step table. ` +
        `Valid steps: ${STEP_TABLE.map((r) => r.step).join(', ')}. Open an issue.`,
    )
  }
  return l
}
