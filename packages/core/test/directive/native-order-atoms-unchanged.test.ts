/**
 * Placing atoms in place changes where a body goes, never what a body is: `resolve()` returns for
 * every built-in atom what it returned before, the atomic layer's contract snapshot and `cx()` are
 * unchanged (their own tests pass untouched), and no atom is added or lost.
 */
import { describe, expect, it } from 'vitest'

import { atoms } from '../../src/atoms.ts'
import { resolve } from '../../src/directive/resolve.ts'
import { RESOLVED_AT_PREVIOUS_RELEASE } from '../fixtures/resolve-before-native-order.ts'

/**
 * Compares two names, for sorting.
 */
function byText(a: string, b: string): number {
  return a.localeCompare(b)
}

describe('AC-native-apply-order-09 — every atom body is what it was', () => {
  const { resolved } = resolve(Object.keys(atoms))

  it('resolves every built-in atom to the committed result', () => {
    expect(structuredClone(resolved)).toEqual(RESOLVED_AT_PREVIOUS_RELEASE)
  })

  it('holds one entry for each built-in atom', () => {
    expect(Object.keys(RESOLVED_AT_PREVIOUS_RELEASE).toSorted(byText)).toEqual(
      Object.keys(atoms).toSorted(byText),
    )
  })

  it('reds when one declaration of one atom changes (control)', () => {
    const scratch = structuredClone(resolved) as unknown as Record<
      string,
      { declarations: { prop: string; value: string }[] }
    >
    scratch.flex!.declarations[0]!.value = 'grid'

    expect(scratch).not.toEqual(RESOLVED_AT_PREVIOUS_RELEASE)
  })
})
