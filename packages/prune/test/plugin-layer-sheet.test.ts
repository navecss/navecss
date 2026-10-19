/**
 * The stylesheet that holds Nave's `@layer atomic` block is a stylesheet like any other: a
 * `@nave` problem in it is recorded, as when `postcss-import` inlines core's sheets into the
 * application's own.
 */
import { describe, expect, it } from 'vitest'

import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runSheets } from './helpers/plugin-run.ts'
import { ATOMIC_CSS, recordOf } from './helpers/project.ts'

registerIsolation()

describe('the stylesheet holding the atom layer records its own @nave problems', () => {
  it('a @nave problem beside the layer is a directive problem of that stylesheet', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const css = `${ATOMIC_CSS}\n.card {\n  @nave interactve;\n}\n`
    await runSheets(project, [{ css, file: 'app/globals.css' }])
    const record = recordOf(project)
    // Control: the run trimmed the layer, so the stylesheet was read as the one holding it.
    expect(record.atoms).toContain('grid')
    expect(record.directiveProblems.map((problem) => problem.file)).toEqual(['app/globals.css'])
  })
})
