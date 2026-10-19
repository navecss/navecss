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

describe('an order warning is printed by the plugin and is never a problem', () => {
  it.each(['error', 'warn', 'ignore'] as const)(
    'under onUnknown %j it records no problem and prints the warning once, placed in its stylesheet',
    async (onUnknown) => {
      const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
      const printed = capturePrinted()

      await runAtomic(project, [ORDER], { options: { onUnknown } })

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

    await runAtomic(project, [BOTH], { options: { onUnknown: 'error' } })

    const problems = recordOf(project).directiveProblems
    expect(problems.map((problem) => [problem.line, problem.column])).toEqual([[6, 3]])
    expect(problems[0]!.text).toContain('interactve')
    expect(printed().filter((line) => line.includes('comes after "hideDesktopUp"'))).toHaveLength(1)
  })

  it('prints a problem beside it exactly as before under "warn"', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = capturePrinted()

    await runAtomic(project, [BOTH], { options: { onUnknown: 'warn' } })

    expect(recordOf(project).directiveProblems).toEqual([])
    expect(printed().filter((line) => line.includes('interactve'))).toHaveLength(1)
    expect(printed().filter((line) => line.includes('comes after "hideDesktopUp"'))).toHaveLength(1)
  })
})
