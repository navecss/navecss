/**
 * When the plugin cannot finish, it says what happened, keeps the stylesheet's `@nave` expanded,
 * and leaves the failure where the build's own check reads, so a run that stopped is never read
 * as a clean one.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const isRoot = process.getuid?.() === 0

describe('an extend module that cannot be found, over a whole run', () => {
  it('is said in one line per run, however many stylesheets the run holds', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const printed = capturePrinted()
    const modules = [0, 1, 2].map((index) => ({
      css: '.m {\n  color: red;\n}\n',
      file: `app/m${index}.module.css`,
    }))
    const run = { options: { extend: './nope.mjs' } }
    await runSheets(project, [ATOMIC_SHEET, ...modules], run)
    expect(printed().filter((line) => line.includes('nope.mjs'))).toHaveLength(1)
    // Control: a second run says it again.
    await runSheets(project, [ATOMIC_SHEET, ...modules], run)
    expect(printed().filter((line) => line.includes('nope.mjs'))).toHaveLength(2)
  })
})

describe('an extend map core refuses', () => {
  it('is a failure in the record even when no stylesheet holds @nave', async () => {
    const project = makeProject({
      'app/page.tsx': pageCalling("'grid'"),
      'atoms.mjs': `export default ${JSON.stringify({ brandBox: { declarations: { color: 'red;}body{color:blue' } } })}\n`,
    })
    capturePrinted()
    await runSheets(
      project,
      [ATOMIC_SHEET, { css: '.m {\n  color: red;\n}\n', file: 'app/m.module.css' }],
      {
        options: { extend: './atoms.mjs' },
      },
    )
    expect(recordOf(project).failures.length).toBeGreaterThan(0)
  })
})

describe.skipIf(isRoot)('a record that cannot be written over an earlier one', () => {
  it('ships the layer whole and says it stopped without trimming', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    await runSheets(project, [ATOMIC_SHEET], { options: {} })
    project.write({ 'app/page.tsx': pageCalling("'flex', 'grid'") })
    const record = path.join(project.dir, '.next/cache/navecss-prune.json')
    chmodSync(record, 0o444)
    try {
      const printed = capturePrinted()
      const [result] = await runSheets(project, [ATOMIC_SHEET], { options: {} })
      expect(atomsIn(result!.css)).toEqual(atomsIn(ATOMIC_CSS))
      expect(printed().some((line) => line.includes('stopped without trimming'))).toBe(true)
    } finally {
      chmodSync(record, 0o644)
    }
  })
})

describe('a record written before the failures field existed', () => {
  it('reads as one with no failure, for the run record and a stylesheet record', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    await runSheets(project, [ATOMIC_SHEET], { options: {} })
    const cache = path.join(project.dir, '.next/cache')
    const runRecord = path.join(cache, 'navecss-prune.json')
    const { failures: _dropped, ...older } = JSON.parse(readFileSync(runRecord, 'utf8')) as Record<
      string,
      unknown
    >
    writeFileSync(runRecord, JSON.stringify(older))
    writeFileSync(
      path.join(cache, 'navecss-prune-sheets', 'older.json'),
      JSON.stringify({ file: 'app/old.css', isOnDisk: false, hasDirective: false, problems: [] }),
    )
    expect(recordOf(project).failures).toEqual([])
  })
})
