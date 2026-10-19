/**
 * A path-valued `extend` module is a file the plugin reads, so it is declared to the bundler like
 * every other: by the run over the atom layer, which also records its digest, and by every
 * stylesheet run that expands `@nave` with it. Editing it then runs those stylesheets again.
 */
import type { Message } from 'postcss'

import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import {
  capturePrinted,
  makeProject,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const ATOMS = `export default ${JSON.stringify({ brandBox: { declarations: { color: 'red' } } })}\n`
const SHEET = { file: 'app/globals.css', css: '.card {\n  @nave brandBox;\n}\n' }

/**
 * The files the `dependency` messages name, relative to the project directory.
 */
function declared(project: Project, messages: readonly Message[]): string[] {
  return messages
    .filter((message) => message.type === 'dependency')
    .map((message) => path.relative(project.dir, message.file as string))
}

describe('a path-valued extend module', () => {
  it('is declared by a stylesheet run that expands @nave with it', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'"), 'atoms.mjs': ATOMS })
    const [sheet] = await runSheets(project, [SHEET], { options: { extend: './atoms.mjs' } })
    expect(sheet!.css).toContain('color: red')
    expect(declared(project, sheet!.messages)).toEqual(['atoms.mjs'])
  })

  it('is declared by the run over the atom layer, and its digest is in the record', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'"), 'atoms.mjs': ATOMS })
    const [, layer] = await runSheets(project, [SHEET, ATOMIC_SHEET], {
      options: { extend: './atoms.mjs' },
    })
    expect(declared(project, layer!.messages)).toContain('atoms.mjs')
    expect(Object.keys(recordOf(project).files)).toContain('atoms.mjs')
  })

  it('control: an extend given as an object declares no file of its own', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const [sheet] = await runSheets(project, [SHEET], {
      options: { extend: { brandBox: { declarations: { color: 'red' } } } },
    })
    expect(sheet!.css).toContain('color: red')
    expect(declared(project, sheet!.messages)).toEqual([])
  })

  it('is not declared when it names no file', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    capturePrinted()
    const [sheet, layer] = await runSheets(project, [SHEET, ATOMIC_SHEET], {
      options: { extend: './nope.mjs' },
    })
    expect(declared(project, sheet!.messages)).toEqual([])
    expect(declared(project, layer!.messages)).not.toContain('nope.mjs')
  })
})
