/**
 * Shared scaling assertion for a test that wants to rule out quadratic (or worse) behaviour
 * without pinning a wall-clock budget. A fixed millisecond budget passes on a fast, idle laptop
 * and reds on a shared, coverage-instrumented CI runner purely from being slower, not from any
 * regression in the code under test — the ratio between two sizes of the same subject is stable
 * across machines in a way an absolute number never is.
 *
 * The rows time their subject in the process's CPU time (`cpuMillisecondsPerCall`, or
 * `cpuMillisecondsSince` for a subject that is async), not on the clock: the time the machine
 * spends on other processes in the middle of a run is not work the subject does, and a stall that
 * lands on one size and not the other moves the ratio as far as a regression would.
 */
import { expect } from 'vitest'

/**
 * The CPU time, in milliseconds, the process has used since `start`, a reading of
 * `process.cpuUsage()`: its user and system time, not the clock. The time the machine spends on
 * other processes, or with this one stopped, is not counted.
 */
export function cpuMillisecondsSince(start: NodeJS.CpuUsage): number {
  const used = process.cpuUsage(start)
  return (used.user + used.system) / 1000
}

/**
 * The least CPU time one batch of calls should use, in milliseconds, before it is timed. A call
 * that takes a few microseconds is close to what the CPU clock resolves, and one that takes a
 * millisecond or two carries the process's other threads (the compiler, the garbage collector)
 * as a large share of what it uses.
 */
const BATCH_MS = 20

/**
 * The CPU time, in milliseconds, one call of `work` takes, from a batch of calls that together use
 * at least `BATCH_MS`. A call that takes longer than that is timed alone.
 */
export function cpuMillisecondsPerCall(work: () => void): number {
  let calls = 1
  for (;;) {
    const start = process.cpuUsage()
    for (let call = 0; call < calls; call++) work()
    const used = cpuMillisecondsSince(start)
    if (used >= BATCH_MS) return used / calls
    calls = Math.ceil((calls * BATCH_MS * 1.1) / Math.max(used, 0.001))
  }
}

export interface ScalingMeasurement {
  /**
   * The smaller of the two sizes measured.
   */
  n: number
  /**
   * Least time, in milliseconds, across 3 runs at `n`.
   */
  nMs: number
  /**
   * Least time, in milliseconds, across 3 runs at `4 * n`.
   */
  fourNMs: number
  /**
   * `fourNMs / nMs`: ~4 for a linear subject, ~16 for a quadratic one.
   */
  ratio: number
}

/**
 * The least sample of a trio. Background load only ever adds time to a run, so the fastest run is
 * the one that says what the subject costs; a median lets two slowed runs of three through.
 */
function fastest(samples: readonly number[]): number {
  return Math.min(...samples)
}

const RATIO_BUDGET = 8

/**
 * One pass: one throwaway warm-up run at `n`, then 3 measured runs at each of `n` and `4 * n`, taken
 * in turn (the least taken of each trio). Taken in turn, so that whatever the machine is doing
 * reaches both sizes alike: three runs of one size and then three of the other can put the two
 * under different conditions, and the ratio then measures the machine.
 */
async function measureOnce(
  timeAt: (size: number) => number | Promise<number>,
  n: number,
): Promise<ScalingMeasurement> {
  await timeAt(n)

  const nSamples: number[] = []
  const fourNSamples: number[] = []
  for (let i = 0; i < 3; i++) {
    nSamples.push(await timeAt(n))
    fourNSamples.push(await timeAt(4 * n))
  }

  const nMs = fastest(nSamples)
  const fourNMs = fastest(fourNSamples)
  return { n, nMs, fourNMs, ratio: fourNMs / nMs }
}

const MAX_ATTEMPTS = 3

/**
 * Times `timeAt(n)` and `timeAt(4 * n)` (see `measureOnce`) and asserts the ratio of the two
 * fastest runs stays below 8, comfortably above the ~4 a linear subject produces and comfortably
 * below the ~16 a quadratic one does. `timeAt` builds and measures its own input at the given
 * size and returns the milliseconds the subject took (see `cpuMillisecondsSince`); keep the size
 * small enough that the `4 * n` run finishes in well under a second locally, since this function
 * runs it 3 times.
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
