/**
 * AC-native-apply-order-54: what the order check does per pair, counted rather than timed. A ratio
 * to a control moves with the machine and with the coverage the package always runs under; a count
 * does not. It sees the two ways a pair loop gets dearer that a ratio cannot tell from noise: work
 * redone for every pair instead of once per value (the regular expressions run per pair), and a
 * lookup in the list of parts inside the loop.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as checkModule from '../../src/directive/order-check.ts'
import type * as compareModule from '../../src/directive/order-compare.ts'
import type * as unitsModule from '../../src/directive/order-units.ts'
import type * as selectorModule from '../../src/selector-utils.ts'

const calls = vi.hoisted(() => ({ check: 0, compare: 0, split: 0, units: 0 }))

vi.mock('../../src/directive/order-compare.ts', async (importOriginal) => {
  const original = await importOriginal<typeof compareModule>()
  return {
    ...original,
    compare: (...args: Parameters<typeof original.compare>) => {
      calls.compare++
      return original.compare(...args)
    },
  }
})

vi.mock('../../src/directive/order-check.ts', async (importOriginal) => {
  const original = await importOriginal<typeof checkModule>()
  return {
    ...original,
    checkOrder: (...args: Parameters<typeof original.checkOrder>) => {
      calls.check++
      return original.checkOrder(...args)
    },
  }
})

vi.mock('../../src/directive/order-units.ts', async (importOriginal) => {
  const original = await importOriginal<typeof unitsModule>()
  return {
    ...original,
    unitsOfBlock: (...args: Parameters<typeof original.unitsOfBlock>) => {
      calls.units++
      return original.unitsOfBlock(...args)
    },
  }
})

vi.mock('../../src/selector-utils.ts', async (importOriginal) => {
  const original = await importOriginal<typeof selectorModule>()
  return {
    ...original,
    splitTopLevel: (...args: Parameters<typeof original.splitTopLevel>) => {
      calls.split++
      return original.splitTopLevel(...args)
    },
  }
})

const { expandText } = await import('../../src/directive/expand-text.ts')

/**
 * What expanding one directive of `size` atoms, each with blocks that are compared with the others,
 * asks of the check.
 */
function counted(size: number): { compare: number; indexOf: number; patterns: number } {
  const indexOf = vi.spyOn(Array.prototype, 'indexOf')
  const exec = vi.spyOn(RegExp.prototype, 'exec')
  calls.compare = 0
  expandText(`.x { @nave ${'hideDesktopUp '.repeat(size)}; }`)
  const seen = {
    compare: calls.compare,
    indexOf: indexOf.mock.calls.length,
    patterns: exec.mock.calls.length,
  }
  indexOf.mockRestore()
  exec.mockRestore()
  return seen
}

describe('AC-native-apply-order-54 — the check counted, not timed', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([100, 200])('compares the blocks of %i atoms pair by pair, once each', (size) => {
    expect(counted(size).compare).toBeLessThanOrEqual((size * size) / 2)
  })

  // Measured at 4 to 5 regular expressions per pair, where the check that read every condition
  // and value again for each pair measured 18.
  it.each([100, 200])('runs a bounded number of patterns per pair (%i atoms)', (size) => {
    const { compare, patterns } = counted(size)

    expect(patterns).toBeLessThan(compare * 8)
  })

  it.each([100, 200])(
    'looks nothing up in the list of parts inside the pair loop (%i atoms)',
    (size) => {
      expect(counted(size).indexOf).toBeLessThan(size)
    },
  )
})

/**
 * What expanding `css` asks of the parts of the check that a rule with nothing to compare must not
 * reach, and how often a box prototype is asked for its `valueOf`.
 */
function reached(css: string): { check: number; split: number; units: number; valueOf: number } {
  const valueOf = vi.spyOn(String.prototype, 'valueOf')
  Object.assign(calls, { check: 0, split: 0, units: 0 })
  expandText(css)
  const seen = {
    check: calls.check,
    split: calls.split,
    units: calls.units,
    valueOf: valueOf.mock.calls.length,
  }
  valueOf.mockRestore()
  return seen
}

const RULES = 20

describe('AC-native-apply-order-54 — a rule with nothing to compare costs nothing to compare', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not enter the order check for a rule whose atoms have no block', () => {
    expect(reached('.a { @nave flex; }\n'.repeat(RULES)).check).toBe(0)
    expect(reached('.a { @nave hideDesktopUp; }\n'.repeat(RULES)).check).toBe(RULES)
  })

  it('does not read the selector list of a rule that wraps no run', () => {
    expect(reached('.a, .b { @nave flex; }\n'.repeat(RULES)).split).toBe(0)
    expect(reached('.a, .b { &:hover { color: red } @nave flex; }\n'.repeat(RULES)).split).toBe(
      RULES,
    )
  })

  it('builds the units of a block only when something comes after it', () => {
    expect(reached('.a { @nave hideDesktopUp; }\n'.repeat(RULES)).units).toBe(0)
    expect(reached('.a { @nave hideDesktopUp; color: red; }\n'.repeat(RULES)).units).toBe(RULES)
  })

  it('asks no box prototype for its valueOf to read the atoms of a rule', () => {
    expect(reached('.a { @nave flex hideDesktopUp; }\n'.repeat(RULES)).valueOf).toBe(0)
  })
})
