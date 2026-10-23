import { describe, expect, it } from 'vitest'

import {
  atomsInModule,
  changeAValue,
  controlTargets,
  dropANestedRule,
  ruleParityProblems,
  swapTwoAtoms,
} from './support/registry/css-parity.ts'
import {
  atomNames,
  itemAtoms,
  packageEntriesFor,
  withModule,
} from './support/registry/css-rules.ts'
import { cloneRegistry, loadRegistry } from './support/registry/load.ts'
import { styledSubpaths } from './support/registry/styled-subpaths.ts'

const CONTROL_SUBPATH = 'dialog'

const dialogModule = (): string => {
  const item = loadRegistry().items.get(`base-ui-${CONTROL_SUBPATH}`)
  const content = item?.files.find((file) => file.target.endsWith('.module.css'))?.content
  if (content === undefined) throw new Error('base-ui-dialog has no module')
  return content
}

describe('AC-base-ui-registry-07: each module is the package rules for its atoms, moved and renamed, and otherwise equal', () => {
  it('reads a non-empty set of atoms and of styled subpaths, and the package has rules for each item', () => {
    expect(styledSubpaths().length).toBeGreaterThan(0)
    expect(atomNames().length).toBeGreaterThan(0)
    for (const subpath of styledSubpaths()) {
      expect(packageEntriesFor(itemAtoms(subpath)).length, subpath).toBeGreaterThan(0)
    }
  })

  it('every module after the order statement equals the package list cut to its atoms, order included', () => {
    expect(ruleParityProblems(loadRegistry())).toEqual([])
  })

  it('reds when one value is changed, naming the module and the atom', () => {
    const registry = loadRegistry()
    const { plain } = controlTargets(dialogModule())
    expect(plain).toBeDefined()
    const problems = ruleParityProblems(
      withModule(cloneRegistry(registry), CONTROL_SUBPATH, (css) => changeAValue(css, plain ?? '')),
    )
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain(`nave-${CONTROL_SUBPATH}.module.css`)
    expect(problems.join('\n')).toContain(`atom ${plain}`)
  })

  it('reds when one nested state rule is dropped', () => {
    const registry = loadRegistry()
    const { nested } = controlTargets(dialogModule())
    expect(nested).toBeDefined()
    const problems = ruleParityProblems(
      withModule(cloneRegistry(registry), CONTROL_SUBPATH, (css) =>
        dropANestedRule(css, nested ?? ''),
      ),
    )
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain(`nave-${CONTROL_SUBPATH}.module.css`)
  })

  it("reds when two atoms' rules are swapped", () => {
    const registry = loadRegistry()
    const [first, second] = atomsInModule(dialogModule())
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    const problems = ruleParityProblems(
      withModule(cloneRegistry(registry), CONTROL_SUBPATH, (css) =>
        swapTwoAtoms(css, first ?? '', second ?? ''),
      ),
    )
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain(`nave-${CONTROL_SUBPATH}.module.css`)
  })
})
