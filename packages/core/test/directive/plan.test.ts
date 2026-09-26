import { describe, expect, it } from 'vitest'

import type { PlanContext } from '../../src/directive/plan.ts'

import { plan } from '../../src/directive/plan.ts'

const STYLE_RULE: PlanContext = {
  isStyleRuleParent: true,
  isInsideKeyframes: false,
  isFollowingNestedNode: false,
}

describe('AC-directive-core-03 — plan() takes the authored prelude and three facts', () => {
  it('resolves the known name, flags the unknown one, and reports its prelude offset', () => {
    const result = plan('flex /* c */ interactve', STYLE_RULE)

    expect(result.declarations).toEqual([{ prop: 'display', value: 'flex' }])
    expect(result.wrapInAmpersand).toBe(false)
    expect(result.diagnostics).toEqual([{ code: 'unknown-atom', name: 'interactve', offset: 13, endOffset: 23 }])
  })

  it('sets the wrap flag from isFollowingNestedNode alone', () => {
    const result = plan('flex', { ...STYLE_RULE, isFollowingNestedNode: true })

    expect(result.declarations).toEqual([{ prop: 'display', value: 'flex' }])
    expect(result.wrapInAmpersand).toBe(true)
  })

  it('short-circuits to bad-parent with no declarations when the parent is not a style rule', () => {
    const result = plan('flex', { ...STYLE_RULE, isStyleRuleParent: false })

    expect(result.declarations).toEqual([])
    expect(result.diagnostics).toEqual([{ code: 'bad-parent', offset: 0, endOffset: 4 }])
  })

  it('short-circuits to in-keyframes with no declarations when inside @keyframes', () => {
    const result = plan('flex', { ...STYLE_RULE, isInsideKeyframes: true })

    expect(result.declarations).toEqual([])
    expect(result.diagnostics).toEqual([{ code: 'in-keyframes', offset: 0, endOffset: 4 }])
  })

  it('reports no-atom for an empty prelude', () => {
    const result = plan('', STYLE_RULE)

    expect(result.declarations).toEqual([])
    expect(result.diagnostics).toEqual([{ code: 'no-atom', offset: 0, endOffset: 0 }])
  })

  it('expands both names either side of a comment, per the PostCSS raws.params fallback shape', () => {
    const result = plan('flex /* c */ block', STYLE_RULE)

    expect(result.declarations).toEqual([
      { prop: 'display', value: 'flex' },
      { prop: 'display', value: 'block' },
    ])
    expect(result.diagnostics).toEqual([])
  })
})
