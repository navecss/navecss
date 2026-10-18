/**
 * When the plugin cannot finish, it says what happened, keeps the stylesheet's `@nave` expanded,
 * and leaves the failure where the build's own check reads, so a run that stopped is never read
 * as a clean one.
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { atomsIn } from './helpers/layer.ts'
import {
  capturePrinted,
  makeProject,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, freshPrunePlugin, runSheets } from './helpers/plugin-run.ts'
import { ATOMIC_CSS, recordOf } from './helpers/project.ts'

registerIsolation()

const SHEET = { css: '.card {\n  @nave flex;\n}\n', file: 'app/globals.css' }

describe('an extend module that cannot be found', () => {
  it('is a failure in the record, and the stylesheet still has its @nave expanded', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const printed = capturePrinted()
    const [sheet] = await runSheets(project, [SHEET, ATOMIC_SHEET], {
      options: { extend: './nope.mjs' },
    })
    expect(sheet!.css).not.toContain('@nave')
    expect(sheet!.css).toContain('display: flex')
    const { failures } = recordOf(project)
    expect(failures.length).toBeGreaterThan(0)
    for (const failure of failures) expect(failure).toContain('nope.mjs')
    expect(printed().some((line) => line.includes('nope.mjs'))).toBe(true)
  })
})

describe('a hand-off variable that does not hold what withNave() sets', () => {
  it.each(['1', 'true', '{not json'])(
    '%s: @nave is expanded and the failure is printed on every run',
    async (text) => {
      const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
      const printed = capturePrinted()
      const create = await freshPrunePlugin()
      const processor = postcss([create()])
      const from = path.join(project.dir, SHEET.file)
      const previous = process.env[HANDOFF_VARIABLE]
      process.env[HANDOFF_VARIABLE] = text
      try {
        const first = await processor.process(SHEET.css, { from })
        const second = await processor.process(SHEET.css, { from })
        expect(first.css).not.toContain('@nave')
        expect(second.css).toContain('display: flex')
      } finally {
        if (previous === undefined) delete process.env[HANDOFF_VARIABLE]
        else process.env[HANDOFF_VARIABLE] = previous
      }
      const failureLines = printed().filter((line) => line.includes(HANDOFF_VARIABLE))
      expect(failureLines).toHaveLength(2)
    },
  )
})

describe('a record that cannot be written', () => {
  it('leaves the layer whole and the printed line says it stopped without trimming', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    mkdirSync(path.join(project.dir, '.next/cache/navecss-prune.json'), { recursive: true })
    const printed = capturePrinted()
    const [result] = await runSheets(project, [ATOMIC_SHEET], { options: {} })
    const lines = printed()
    expect(lines.some((line) => line.includes('stopped without trimming'))).toBe(true)
    expect(atomsIn(result!.css)).toEqual(atomsIn(ATOMIC_CSS))
  })
})
