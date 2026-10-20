import { describe, expect, it } from 'vitest'

import { withModule } from './support/registry/css-rules.ts'
import {
  cssHeader,
  moduleShapeProblems,
  orderStatement,
  withASecondStatement,
  withOneLayerNameMoved,
  withTwoDeclarationsOnOneLine,
} from './support/registry/css-shape.ts'
import { cloneRegistry, loadRegistry } from './support/registry/load.ts'

const CONTROL_SUBPATH = 'dialog'

const problemsAfter = (rewrite: (css: string) => string): string[] => {
  const registry = cloneRegistry(loadRegistry())
  return moduleShapeProblems(withModule(registry, CONTROL_SUBPATH, rewrite))
}

describe('AC-base-ui-registry-08: every module opens with the header, then the order statement, and prints one declaration per line', () => {
  it('reads the order statement from the built stylesheet and the header from LICENSE', () => {
    expect(orderStatement()).toMatch(/^@layer [^;]+;$/)
    expect(cssHeader()).toMatch(
      /^\/\* SPDX-License-Identifier: MIT \*\/\n\/\* Copyright \(c\) \d{4} /,
    )
  })

  it('every module is the header, the order statement, then the components.consumer block, and nothing else', () => {
    expect(moduleShapeProblems(loadRegistry())).toEqual([])
  })

  it('reds a module whose order statement has one name moved (first appearance is the contract)', () => {
    const problems = problemsAfter(withOneLayerNameMoved)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain(`nave-${CONTROL_SUBPATH}.module.css`)
    expect(problems.join('\n')).toContain('order statement')
  })

  it('reds a module with two declarations on one line', () => {
    const problems = problemsAfter(withTwoDeclarationsOnOneLine)
    expect(problems.join('\n')).toContain('holds more than one declaration')
  })

  it('reds a module with a second block-less @layer statement', () => {
    const problems = problemsAfter(withASecondStatement)
    expect(problems.join('\n')).toContain('block-less @layer statements')
  })
})
