import { describe, expect, it } from 'vitest'

import {
  capturePrinted,
  makeProject,
  PAGE_WITH_PROP,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const DEV = 'phase-development-server'

/**
 * A stylesheet whose `display: flex` on line 3, column 3 overrides the block of `hideDesktopUp`.
 */
const ORDER = {
  css: '.card {\n  @nave hideDesktopUp;\n  display: flex;\n}\n',
  file: 'app/globals.css',
}

/**
 * The same, with an unknown atom beside it on line 6, column 3.
 */
const BOTH = {
  css: '.card {\n  @nave hideDesktopUp;\n  display: flex;\n}\n.other {\n  @nave interactve;\n}\n',
  file: 'app/globals.css',
}

describe('in the development server an order warning is printed by the plugin and is never a problem', () => {
  it.each(['error', 'warn', 'ignore'] as const)(
    'under onUnknown %j it records no problem and prints the warning once, placed in its stylesheet',
    async (onUnknown) => {
      const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
      const printed = capturePrinted()

      await runAtomic(project, [ORDER], { options: { onUnknown }, phase: DEV })

      expect(recordOf(project).directiveProblems).toEqual([])
      const lines = printed().filter((line) => line.includes('comes after "hideDesktopUp"'))
      expect(lines).toHaveLength(1)
      expect(lines[0]!.startsWith('app/globals.css:3:3: @nave: display: flex comes after')).toBe(
        true,
      )
    },
  )

  it('records the unknown atom and only it, and prints the order warning, under "error"', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = capturePrinted()

    await runAtomic(project, [BOTH], { options: { onUnknown: 'error' }, phase: DEV })

    const problems = recordOf(project).directiveProblems
    expect(problems.map((problem) => [problem.line, problem.column])).toEqual([[6, 3]])
    expect(problems[0]!.text).toContain('interactve')
    expect(printed().filter((line) => line.includes('comes after "hideDesktopUp"'))).toHaveLength(1)
  })

  it('prints a problem beside it exactly as before under "warn"', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = capturePrinted()

    await runAtomic(project, [BOTH], { options: { onUnknown: 'warn' }, phase: DEV })

    expect(recordOf(project).directiveProblems).toEqual([])
    expect(printed().filter((line) => line.includes('interactve'))).toHaveLength(1)
    expect(printed().filter((line) => line.includes('comes after "hideDesktopUp"'))).toHaveLength(1)
  })
})

describe('an order warning is framed where core frames it', () => {
  it('puts each atom-pair warning at the later atom, not at the start of the directive', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = capturePrinted()

    await runAtomic(
      project,
      [{ css: '.card {\n  @nave hideDesktopUp flex grid;\n}\n', file: 'app/globals.css' }],
      { options: { onUnknown: 'warn' }, phase: DEV },
    )

    const lines = printed().filter((line) => line.includes(' comes after '))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^app\/globals\.css:2:23: @nave: "flex" comes after "hideDesktopUp"/)
    expect(lines[1]).toMatch(/^app\/globals\.css:2:28: @nave: "grid" comes after "hideDesktopUp"/)
  })

  it('prints an order warning once when the wrapper left no options behind', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = capturePrinted()

    await runAtomic(project, [ORDER], { options: false })

    const lines = printed().filter((line) => line.includes('comes after "hideDesktopUp"'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/:3:3: @nave: display: flex comes after "hideDesktopUp"/)
  })
})
