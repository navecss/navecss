/**
 * AC-native-apply-order-15: two conjunctions of conditional group rules are reported as
 * possibly overlapping unless they are provably disjoint on a `width`/`height` range.
 */
import { describe, expect, it } from 'vitest'

import { type ConditionRule, conditionsMayOverlap } from '../../src/directive/condition-overlap.ts'

const media = (prelude: string): ConditionRule => ({ name: 'media', prelude })
const PHONE_ONLY = [media('(width < 37.5em)')]

describe('AC-native-apply-order-15 - conditions that cannot hold together', () => {
  it.each([
    '(width >= 37.5em)',
    '(min-width: 37.5em)',
    '(37.5em <= width)',
    '(width >= 40em) and (width < 50em)',
    '(37.5em <= width < 50em)',
    '(width > 37.5em)',
    '(width = 40em)',
    '(WIDTH >= 37.5EM)',
    '(width>=37.5em)',
    '  (  width  >=  37.5em  )  ',
  ])('(width < 37.5em) against %s is disjoint', (prelude) => {
    expect(conditionsMayOverlap(PHONE_ONLY, [media(prelude)])).toBe(false)
  })

  it('is symmetric', () => {
    expect(conditionsMayOverlap([media('(width >= 37.5em)')], PHONE_ONLY)).toBe(false)
  })

  it.each([
    ['(width <= 37.5em)', '(width >= 37.5em)'],
    ['(width < 37.5em)', '(width >= 30em)'],
    ['(width < 37.5em)', '(width >= 600px)'],
    ['(width < 37.5em)', '(width >= 37.5rem)'],
    ['(width < 37.5rem)', '(width >= 37.5em)'],
    ['(width < 600px)', '(width >= 37.5em)'],
    ['(width < 37.5em)', '(height >= 40em)'],
    ['(width < 37.5em)', '(width >= 40em), print'],
    ['(width < 37.5em)', '(width >= 40em) or (orientation: landscape)'],
    ['(width < 37.5em)', 'not all and (width < 37.5em)'],
    ['(width < 37.5em)', 'screen and (width >= 40em)'],
    ['(width < 37.5em)', '(orientation: landscape)'],
    ['(width < 37.5em)', '(width >= 40em) and (orientation: landscape)'],
    ['(width < 37.5em)', '(width >= )'],
    ['(width < 37.5em)', 'garbage ((('],
    ['(width < 37.5em)', ''],
    ['(30em <= width <= 37.5em)', '(width >= 37.5em)'],
    ['(width = 37.5em)', '(width >= 37.5em)'],
  ])('%s against %s may overlap', (first, second) => {
    expect(conditionsMayOverlap([media(first)], [media(second)])).toBe(true)
  })

  it('splits a width at exactly one point only when one side is strict', () => {
    expect(conditionsMayOverlap([media('(width <= 37.5em)')], [media('(width > 37.5em)')])).toBe(
      false,
    )
    expect(conditionsMayOverlap([media('(width < 37.5em)')], [media('(width > 30em)')])).toBe(true)
  })

  it('proves a double range disjoint from a bound at its strict end', () => {
    expect(
      conditionsMayOverlap([media('(30em < width < 37.5em)')], [media('(width >= 37.5em)')]),
    ).toBe(false)
    expect(
      conditionsMayOverlap([media('(30em < width < 37.5em)')], [media('(width >= 30em)')]),
    ).toBe(true)
  })

  it('treats an empty conjunction as no condition', () => {
    expect(conditionsMayOverlap([], PHONE_ONLY)).toBe(true)
    expect(conditionsMayOverlap(PHONE_ONLY, [])).toBe(true)
    expect(conditionsMayOverlap([], [])).toBe(true)
  })

  it('never proves a container or supports rule disjoint', () => {
    expect(
      conditionsMayOverlap(PHONE_ONLY, [{ name: 'container', prelude: '(width >= 40em)' }]),
    ).toBe(true)
    expect(
      conditionsMayOverlap(PHONE_ONLY, [{ name: 'supports', prelude: '(display: grid)' }]),
    ).toBe(true)
    expect(
      conditionsMayOverlap(
        [{ name: 'container', prelude: '(width < 20em)' }],
        [{ name: 'container', prelude: '(width >= 40em)' }],
      ),
    ).toBe(true)
  })

  it('still proves the media rules disjoint when a container rule sits beside them', () => {
    expect(
      conditionsMayOverlap(
        [media('(width < 37.5em)'), { name: 'container', prelude: '(width >= 40em)' }],
        [media('(width >= 37.5em)')],
      ),
    ).toBe(false)
  })

  it('reads a conjunction of nested media rules as one intersection', () => {
    const nested = [media('(width >= 40em)'), media('(width < 50em)')]
    expect(conditionsMayOverlap(nested, PHONE_ONLY)).toBe(false)
    expect(conditionsMayOverlap(nested, [media('(width >= 45em)')])).toBe(true)
    expect(conditionsMayOverlap(nested, [media('(width >= 50em)')])).toBe(false)
  })

  it('is disjoint when any one axis is empty, whatever the other axis holds', () => {
    expect(
      conditionsMayOverlap(
        [media('(width < 37.5em) and (height >= 20em)')],
        [media('(width >= 40em) and (height >= 10em)')],
      ),
    ).toBe(false)
  })

  it('does not call two different axes disjoint', () => {
    expect(conditionsMayOverlap([media('(width < 37.5em)')], [media('(height >= 37.5em)')])).toBe(
      true,
    )
  })

  it('does not prove a bound disjoint when another range on the axis mixes units', () => {
    expect(
      conditionsMayOverlap(
        [media('(width < 37.5em)'), media('(width > 10px)')],
        [media('(width >= 40em)')],
      ),
    ).toBe(true)
  })

  it('leaves a unitless zero bound unproven', () => {
    expect(conditionsMayOverlap([media('(width < 37.5em)')], [media('(width >= 0)')])).toBe(true)
  })
})
