import { describe, expect, it } from 'vitest'

import { atomsIn } from './helpers/layer.ts'
import {
  coreOutput,
  inProject,
  makeProject,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'

registerIsolation()

const GLOBALS = { css: '.card { @nave flex gap; }\n', file: 'app/globals.css' }

describe('AC-nextjs-used-atoms-01: the plugin expands @nave as core does and trims to what the code uses', () => {
  it('AC-nextjs-used-atoms-01: .card { @nave flex gap; } becomes the declarations core gives', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const [globals] = await runSheets(project, [GLOBALS])
    const expected = await coreOutput(GLOBALS.css, inProject(project, GLOBALS.file))
    expect(expected).toContain('display: flex')
    expect(globals!.css).toBe(expected)
  })

  it('AC-nextjs-used-atoms-01: with cx("grid") in the page the atomic layer names exactly grid', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const [globals, atomic] = await runSheets(project, [GLOBALS, ATOMIC_SHEET])
    expect(atomsIn(atomic!.css)).toEqual(['grid'])
    // Control: the directive in the same run was expanded, so the run reached the directive.
    expect(globals!.css).not.toContain('@nave')
  })

  it('AC-nextjs-used-atoms-01: an @nave use adds no atom to the layer', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const [, withDirective] = await runSheets(project, [GLOBALS, ATOMIC_SHEET])
    const [withoutDirective] = await runSheets(project, [ATOMIC_SHEET])
    expect(atomsIn(withDirective!.css)).toEqual(atomsIn(withoutDirective!.css))
    // Control: the layer is trimmed, so `flex` and `gap` could have been added and were not.
    expect(atomsIn(withoutDirective!.css)).toEqual(['grid'])
  })
})
