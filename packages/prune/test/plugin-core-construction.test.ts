/**
 * Core's PostCSS plugin is made at most once per stylesheet: the one instance validates the
 * consumer's own atoms and expands `@nave`, so a map is not validated twice.
 */
import type * as Core from '@navecss/core/postcss'

import { describe, expect, it, vi } from 'vitest'

import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'

const made = vi.hoisted(() => ({ count: 0 }))

vi.mock('@navecss/core/postcss', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>()
  return {
    ...actual,
    navePlugin: (...args: Parameters<typeof actual.navePlugin>) => {
      made.count += 1
      return actual.navePlugin(...args)
    },
  }
})

registerIsolation()

describe("core's plugin is made at most once per stylesheet", () => {
  it('a stylesheet using @nave with an extend map and one without it make one plugin each', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const sheets = [
      { css: '.card {\n  @nave brandBox;\n}\n', file: 'app/card.css' },
      { css: '.m {\n  color: red;\n}\n', file: 'app/m.module.css' },
    ]
    const options = { extend: { brandBox: { declarations: { color: 'red' } } } }
    made.count = 0
    const [card] = await runSheets(project, sheets, { options })
    // Control: the directive was expanded with the consumer's atom.
    expect(card!.css).toContain('color: red')
    expect(made.count).toBe(2)
  })

  it('a stylesheet with no @nave and no extend map makes none', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    made.count = 0
    await runSheets(project, [ATOMIC_SHEET], { options: {} })
    expect(made.count).toBe(0)
  })
})
