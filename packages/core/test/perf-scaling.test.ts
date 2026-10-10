/**
 * The scaling helper the growth rows share: it reds a subject that grows with the square of its
 * size, passes one that grows with its size, and measures each size by its fastest run, since
 * background load only ever adds time. The subjects return scripted times, so no row here
 * depends on the machine's speed.
 */
import { describe, expect, it } from 'vitest'

import { assertScalesLinearly } from './helpers/perf-scaling.ts'

describe('assertScalesLinearly', () => {
  it('passes a subject whose time grows with its size', async () => {
    const measured = await assertScalesLinearly((size) => size / 100, 100)

    expect(measured.ratio).toBe(4)
  })

  it('reds a subject whose time grows with the square of its size', async () => {
    await expect(assertScalesLinearly((size) => (size * size) / 1000, 100)).rejects.toThrow()
  })

  it('takes the fastest of the three runs at each size: load adds time, never removes it', async () => {
    // One pass makes 7 calls: a warm-up, 3 at n, 3 at 4n. Two runs at 4n are slowed by load.
    const script = [10, 30, 10, 12, 40, 200, 200]
    let call = 0
    const measured = await assertScalesLinearly(() => script[call++ % script.length]!, 100)

    expect(measured).toEqual({ n: 100, nMs: 10, fourNMs: 40, ratio: 4 })
  })
})
