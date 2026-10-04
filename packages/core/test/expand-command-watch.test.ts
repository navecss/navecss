/**
 * The loop behind `navecss-core expand --watch`, with the file watcher replaced by a stand-in that
 * hands the test its change callback: the first pass runs after the watchers are up, each change
 * runs the pass again, a change that arrives during a pass runs it once more afterwards, and a
 * problem does not stop the loop.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const watching = vi.hoisted(() => ({
  onChange: undefined as undefined | (() => void),
  files: [] as string[],
}))

vi.mock('../src/expand-watch.ts', () => ({
  watchFiles: (files: string[], onChange: () => void) => {
    watching.files = files
    watching.onChange = onChange
    return () => undefined
  },
}))

import { runExpand } from '../src/expand-command.ts'

let dir = ''
let errors: string[] = []

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nave-expand-watch-'))
  errors = []
  watching.onChange = undefined
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation((text: unknown) => errors.push(String(text)))
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { force: true, recursive: true })
})

describe('runExpand --watch', () => {
  it('watches the sources and the extend module, runs once, then once per change, and keeps on after a problem', async () => {
    const source = path.join(dir, 'a.css')
    const out = path.join(dir, 'o.css')
    const atoms = path.join(dir, 'atoms.mjs')
    writeFileSync(source, '.a { @nave flex; }\n')
    writeFileSync(atoms, 'export default {}\n')

    // Never settles while watching, so the loop is observed and not awaited.
    void runExpand([`--source=${source}`, `--out=${out}`, `--extend=${atoms}`, '--watch'])
    await vi.waitFor(() => expect(readFileSync(out, 'utf8')).toContain('display: flex'))
    expect(watching.files).toEqual([source, atoms])

    writeFileSync(source, '.a { @nave block; }\n')
    watching.onChange!()
    await vi.waitFor(() => expect(readFileSync(out, 'utf8')).toContain('display: block'))

    writeFileSync(source, '.a { @nave nope; }\n')
    watching.onChange!()
    await vi.waitFor(() => expect(errors.join('\n')).toContain('unknown atom "nope"'))
    expect(readFileSync(out, 'utf8')).toContain('display: block')

    // Two changes in a row: the second arrives during or after the first, and both are served.
    writeFileSync(source, '.a { @nave grid; }\n')
    watching.onChange!()
    watching.onChange!()
    await vi.waitFor(() => expect(readFileSync(out, 'utf8')).toContain('display: grid'))
  })
})
