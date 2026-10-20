import { describe, expect, it } from 'vitest'

import { type Declaration, plan, type PlanContext } from '../../src/directive/plan.ts'

const STYLE_RULE: PlanContext = {
  isStyleRuleParent: true,
  isInsideKeyframes: false,
}

/**
 * Every declaration of every atom a plan names, in order.
 */
function declarationsOf(result: ReturnType<typeof plan>): Declaration[] {
  return result.atoms.flatMap((atom) => atom.declarations)
}

describe('AC-directive-core-03 — plan() takes the authored prelude and two facts', () => {
  it('resolves the known name, flags the unknown one, and reports its prelude offset', () => {
    const result = plan('flex /* c */ interactve', STYLE_RULE)

    expect(declarationsOf(result)).toEqual([{ prop: 'display', value: 'flex' }])
    expect(result.diagnostics).toEqual([
      { code: 'unknown-atom', name: 'interactve', offset: 13, endOffset: 23 },
    ])
  })

  it('gives each occurrence of a repeated unknown name its own offset, not the first one twice', () => {
    const result = plan('flex flx grid flx', STYLE_RULE)

    expect(result.diagnostics).toEqual([
      { code: 'unknown-atom', name: 'flx', offset: 5, endOffset: 8 },
      { code: 'unknown-atom', name: 'flx', offset: 14, endOffset: 17 },
    ])
  })

  it('short-circuits to bad-parent with no declarations when the parent is not a style rule', () => {
    const result = plan('flex', { ...STYLE_RULE, isStyleRuleParent: false })

    expect(declarationsOf(result)).toEqual([])
    expect(result.diagnostics).toEqual([{ code: 'bad-parent', offset: 0, endOffset: 4 }])
  })

  it('short-circuits to in-keyframes with no declarations when inside @keyframes', () => {
    const result = plan('flex', { ...STYLE_RULE, isInsideKeyframes: true })

    expect(declarationsOf(result)).toEqual([])
    expect(result.diagnostics).toEqual([{ code: 'in-keyframes', offset: 0, endOffset: 4 }])
  })

  it('reports no-atom for an empty prelude', () => {
    const result = plan('', STYLE_RULE)

    expect(declarationsOf(result)).toEqual([])
    expect(result.diagnostics).toEqual([{ code: 'no-atom', offset: 0, endOffset: 0 }])
  })

  it('expands both names either side of a comment, per the PostCSS raws.params fallback shape', () => {
    const result = plan('flex /* c */ block', STYLE_RULE)

    expect(declarationsOf(result)).toEqual([
      { prop: 'display', value: 'flex' },
      { prop: 'display', value: 'block' },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('keeps each atom apart, in the order the prelude names them, with its own blocks', () => {
    const result = plan('focusRing flex hideDesktopUp', STYLE_RULE)

    expect(result.atoms.map((atom) => atom.name)).toEqual(['focusRing', 'flex', 'hideDesktopUp'])
    expect(result.atoms.map((atom) => atom.blocks.length)).toEqual([1, 0, 1])
    expect(result.atoms.map((atom) => atom.offset)).toEqual([0, 10, 15])
  })
})
