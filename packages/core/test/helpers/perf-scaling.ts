/**
 * Shared scaling assertion for a test that wants to rule out quadratic (or worse) behaviour
 * without pinning a wall-clock budget. A fixed millisecond budget passes on a fast, idle laptop
 * and reds on a shared, coverage-instrumented CI runner purely from being slower, not from any
 * regression in the code under test — the ratio between two sizes of the same subject is stable
 * across machines in a way an absolute number never is.
 */
import { expect } from 'vitest'

export interface ScalingMeasurement {
  /**
   * The smaller of the two sizes measured.
   */
  n: number
  /**
   * Median elapsed time, in milliseconds, across 3 runs at `n`.
   */
  nMs: number
  /**
   * Median elapsed time, in milliseconds, across 3 runs at `4 * n`.
   */
  fourNMs: number
  /**
   * `fourNMs / nMs`: ~4 for a linear subject, ~16 for a quadratic one.
   */
  ratio: number
}

/**
 * The middle sample of a trio, which shrugs off one slow or fast outlier run.
 */
function median(samples: readonly number[]): number {
  const sorted = samples.toSorted((a, b) => a - b)
  return sorted[1]!
}

const RATIO_BUDGET = 8

/**
 * One pass: one throwaway warm-up run at `n`, then 3 measured runs at each of `n` and `4 * n` (median taken of each trio).
 */
async function measureOnce(
  timeAt: (size: number) => number | Promise<number>,
  n: number,
): Promise<ScalingMeasurement> {
  await timeAt(n)

  const nSamples: number[] = []
  for (let i = 0; i < 3; i++) nSamples.push(await timeAt(n))

  const fourNSamples: number[] = []
  for (let i = 0; i < 3; i++) fourNSamples.push(await timeAt(4 * n))

  const nMs = median(nSamples)
  const fourNMs = median(fourNSamples)
  return { n, nMs, fourNMs, ratio: fourNMs / nMs }
}

const MAX_ATTEMPTS = 3

/**
 * Times `timeAt(n)` and `timeAt(4 * n)` (see `measureOnce`) and asserts the two medians' ratio
 * stays below 8 — comfortably above the ~4 a linear subject produces, comfortably below the ~16
 * a quadratic one does. `timeAt` builds and measures its own input at the given size and returns
 * the elapsed milliseconds; keep the size small enough that the `4 * n` run finishes in well
 * under a second locally, since this function runs it 3 times.
 *
 * Up to two retries (a fresh full pass each, warm-up included) run before failing: a lone
 * scheduler stall on a shared machine — several unrelated processes' work landing on the same
 * run — can push one pass's ratio over budget the same way a real quadratic regression does, but
 * a regression reproduces on every pass, where a stall does not. This is stated slack for noise,
 * not for the regression itself: the subject under test never runs a hot loop or does I/O of its
 * own between passes that could explain a repeated high ratio on its own terms.
 */
export async function assertScalesLinearly(
  timeAt: (size: number) => number | Promise<number>,
  n: number,
): Promise<ScalingMeasurement> {
  let last: ScalingMeasurement | undefined
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await measureOnce(timeAt, n)
    if (last.ratio < RATIO_BUDGET) return last
  }
  expect(last!.ratio).toBeLessThan(RATIO_BUDGET)
  return last!
}
