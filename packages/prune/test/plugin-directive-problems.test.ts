import { describe, expect, it } from 'vitest'

import {
  capturePrinted,
  coreThrown,
  inProject,
  makeProject,
  PAGE_WITH_PROP,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runAtomic, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

/**
 * The stylesheet with an unknown atom on line 3, column 3.
 */
const GLOBALS = { css: '/* styles */\n.card {\n  @nave interactve;\n}\n', file: 'app/globals.css' }

describe('AC-nextjs-used-atoms-03: an @nave problem is recorded where application problems are', () => {
  it("AC-nextjs-used-atoms-03: the problem lands in the record with its stylesheet position and core's text", async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    await runAtomic(project, [GLOBALS])
    const record = recordOf(project)
    const thrown = await coreThrown(GLOBALS.css, inProject(project, GLOBALS.file))
    expect(thrown.text).toContain('interactve')
    expect(record.directiveProblems).toEqual([
      { file: 'app/globals.css', line: 3, column: 3, text: thrown.text },
    ])
  })

  it('AC-nextjs-used-atoms-03: the cx(variant) problem lands in the record at line 4 of the page', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    await runAtomic(project, [GLOBALS])
    const problems = recordOf(project).problems.filter((problem) => problem.file === 'app/page.tsx')
    expect(problems.map((problem) => problem.line)).toEqual([4])
    expect(problems[0]!.column).toBeGreaterThanOrEqual(1)
  })

  it('AC-nextjs-used-atoms-03: the plugin resolves for both stylesheets instead of throwing', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    await expect(runSheets(project, [GLOBALS, ATOMIC_SHEET])).resolves.toHaveLength(2)
    expect(recordOf(project).directiveProblems).toHaveLength(1)
    // Control: core's own plugin throws for the same stylesheet, so the plugin differs from it.
    await expect(coreThrown(GLOBALS.css, inProject(project, GLOBALS.file))).resolves.toBeDefined()
  })

  it('AC-nextjs-used-atoms-03: onUnknown "warn" records nothing for it and prints its line once', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const warn = capturePrinted()
    await runAtomic(project, [GLOBALS], { options: { onUnknown: 'warn' } })
    const thrown = await coreThrown(GLOBALS.css, inProject(project, GLOBALS.file))
    expect(recordOf(project).directiveProblems).toEqual([])
    const lines = warn().filter((line) => line.includes(thrown.text))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('app/globals.css')
    // Control: the default records it, so the stylesheet does hold the problem.
    const other = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    await runAtomic(other, [GLOBALS])
    expect(recordOf(other).directiveProblems).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-03: onUnknown "ignore" records nothing and prints nothing about it', async () => {
    const project = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    const printed = capturePrinted()
    await runAtomic(project, [GLOBALS], { options: { onUnknown: 'ignore' } })
    expect(recordOf(project).directiveProblems).toEqual([])
    expect(printed().filter((line) => line.includes('interactve'))).toEqual([])
    // Control: the default records the same stylesheet's problem.
    const other = makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
    await runAtomic(other, [GLOBALS], { options: { onUnknown: 'error' } })
    expect(recordOf(other).directiveProblems).toHaveLength(1)
  })
})
