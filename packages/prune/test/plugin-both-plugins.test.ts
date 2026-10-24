import { navePlugin } from '@navecss/core/postcss'
import { describe, expect, it } from 'vitest'

import {
  capturePrinted,
  makeProject,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runAtomic, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const FILES = { 'app/page.tsx': pageCalling("'flex'") }

describe("AC-nextjs-used-atoms-26: the plugin finds core's plugin in the pipeline in either order", () => {
  it("AC-nextjs-used-atoms-26: core's plugin listed before the Nave plugin sets hasCorePlugin", async () => {
    const project = makeProject(FILES)
    await runAtomic(project, [], { before: [navePlugin()] })
    expect(recordOf(project).hasCorePlugin).toBe(true)
  })

  it("AC-nextjs-used-atoms-26: core's plugin listed after the Nave plugin sets hasCorePlugin", async () => {
    const project = makeProject(FILES)
    await runAtomic(project, [], { after: [navePlugin()] })
    expect(recordOf(project).hasCorePlugin).toBe(true)
  })

  it('AC-nextjs-used-atoms-26: with the Nave plugin alone hasCorePlugin is false', async () => {
    const project = makeProject(FILES)
    await runAtomic(project)
    expect(recordOf(project).hasCorePlugin).toBe(false)
  })

  it('AC-nextjs-used-atoms-26: with both plugins in dev one line names @navecss/core/postcss and repeated runs add none', async () => {
    const project = makeProject(FILES)
    const printed = capturePrinted()
    await runSheets(project, [ATOMIC_SHEET, ATOMIC_SHEET, ATOMIC_SHEET], {
      before: [navePlugin()],
      phase: 'phase-development-server',
    })
    const naming = printed().filter((line) => line.includes('@navecss/core/postcss'))
    expect(naming).toHaveLength(1)
  })

  it('AC-nextjs-used-atoms-26: with the Nave plugin alone no line names @navecss/core/postcss', async () => {
    const project = makeProject(FILES)
    const printed = capturePrinted()
    await runAtomic(project)
    expect(printed().filter((line) => line.includes('@navecss/core/postcss'))).toEqual([])
    // Control: the same project with both plugins does print it in dev.
    await runAtomic(project, [], { before: [navePlugin()], phase: 'phase-development-server' })
    expect(printed().filter((line) => line.includes('@navecss/core/postcss'))).toHaveLength(1)
  })
})
