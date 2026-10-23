/**
 * The failure lines the plugin prints and records name it the way the reader listed it in the
 * PostCSS config, `@navecss/prune/postcss`, because the hook quotes them inside a message that
 * stops the build. The name the plugin gives PostCSS stays what the bundler's messages carry.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  capturePrinted,
  makeProject,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const SHEET = { css: '.card {\n  @nave flex;\n}\n', file: 'app/globals.css' }
const INTERNAL_NAME = 'postcss-nave-prune'
const PUBLIC_NAME = '@navecss/prune/postcss'

describe('AC-nextjs-used-atoms-06: the failure lines name the plugin as the reader listed it', () => {
  it('a run that stops before trimming prints and records its failure under the listed name', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const printed = capturePrinted()

    await runSheets(project, [ATOMIC_SHEET], { options: { extend: './nope.mjs' } })

    const lines = printed().filter((line) => line.includes('stopped without trimming'))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).toContain(`Nave: ${PUBLIC_NAME} stopped without trimming: `)
      expect(line).not.toContain(INTERNAL_NAME)
    }
    const failures = recordOf(project).failures.filter((failure) =>
      failure.includes('stopped without trimming'),
    )
    expect(failures.length).toBeGreaterThan(0)
    for (const failure of failures) {
      expect(failure.startsWith(`${PUBLIC_NAME} stopped without trimming: `)).toBe(true)
    }
  })

  it('a stylesheet that expanded @nave without the extend atoms records its failure under the listed name', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    capturePrinted()

    await runSheets(project, [SHEET, ATOMIC_SHEET], { options: { extend: './nope.mjs' } })

    const failures = recordOf(project).failures.filter((failure) =>
      failure.includes('expanded @nave'),
    )
    expect(failures.length).toBeGreaterThan(0)
    for (const failure of failures) {
      expect(failure).toContain(
        `${PUBLIC_NAME} expanded @nave with Nave's own atoms only, because the extend option could not be used`,
      )
      expect(failure).not.toContain(INTERNAL_NAME)
    }
  })

  it('a run that throws outside the trim prints its failure under the listed name', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    mkdirSync(path.join(project.dir, '.next/cache'), { recursive: true })
    // A file where the stylesheets' records go: writing a stylesheet's record throws.
    writeFileSync(path.join(project.dir, '.next/cache/navecss-prune-sheets'), 'not a directory')
    const printed = capturePrinted()

    await runSheets(project, [SHEET], { options: {} })

    const lines = printed().filter((line) => line.includes('stopped without trimming'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`Nave: ${PUBLIC_NAME} stopped without trimming: `)
    expect(lines[0]).not.toContain(INTERNAL_NAME)
  })
})
