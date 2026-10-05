/**
 * The loop behind `navecss-core expand --watch`, with the file watcher replaced by a stand-in that
 * hands the test its change callback: the first pass runs after the watchers are up, each change
 * runs the pass again, a change that arrives during a pass runs it once more afterwards, and a
 * problem does not stop the loop.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const watching = vi.hoisted(() => ({
  onChange: undefined as undefined | (() => void),
  files: [] as string[],
  out: '',
  outExisted: undefined as boolean | undefined,
}))

vi.mock('../src/expand-watch.ts', async () => {
  const fs = await import('node:fs')
  return {
    watchFiles: (files: string[], onChange: () => void) => {
      watching.files = files
      watching.onChange = onChange
      watching.outExisted = fs.existsSync(watching.out)
      return vi.fn()
    },
  }
})

import { runExpand } from '../src/expand-command.ts'

const project = { dir: '' }
const errors: string[] = []
const logs: string[] = []

beforeEach(() => {
  project.dir = mkdtempSync(path.join(tmpdir(), 'nave-expand-watch-'))
  errors.length = 0
  logs.length = 0
  watching.onChange = undefined
  watching.out = ''
  watching.outExisted = undefined
  vi.spyOn(console, 'log').mockImplementation((text: unknown) => {
    logs.push(String(text))
  })
  vi.spyOn(console, 'error').mockImplementation((text: unknown) => {
    errors.push(String(text))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(project.dir, { force: true, recursive: true })
})

describe('runExpand --watch', () => {
  it('watches the sources and the extend module, runs once, then once per change, and keeps on after a problem', async () => {
    const source = path.join(project.dir, 'a.css')
    const out = path.join(project.dir, 'o.css')
    const atoms = path.join(project.dir, 'atoms.mjs')
    writeFileSync(source, '.a { @nave flex; }\n')
    writeFileSync(atoms, 'export default {}\n')

    // Never settles while watching, so the loop is observed and not awaited.
    void runExpand([`--source=${source}`, `--out=${out}`, `--extend=${atoms}`, '--watch'])
    await vi.waitFor(() => expect(readFileSync(out, 'utf8')).toContain('display: flex'), {
      timeout: 5000,
    })
    expect(watching.files).toEqual([source, atoms])

    writeFileSync(source, '.a { @nave block; }\n')
    watching.onChange!()
    await vi.waitFor(() => expect(readFileSync(out, 'utf8')).toContain('display: block'), {
      timeout: 5000,
    })

    writeFileSync(source, '.a { @nave nope; }\n')
    watching.onChange!()
    await vi.waitFor(() => expect(errors.join('\n')).toContain('unknown atom "nope"'), {
      timeout: 5000,
    })
    expect(readFileSync(out, 'utf8')).toContain('display: block')

    // Two changes in a row: the second arrives during or after the first, and both are served.
    writeFileSync(source, '.a { @nave grid; }\n')
    watching.onChange!()
    watching.onChange!()
    await vi.waitFor(() => expect(readFileSync(out, 'utf8')).toContain('display: grid'), {
      timeout: 5000,
    })
  }, 15_000)

  it('puts the watchers up before the first pass writes, so a save made during it is seen', async () => {
    const source = path.join(project.dir, 'a.css')
    watching.out = path.join(project.dir, 'o.css')
    writeFileSync(source, '.a { @nave flex; }\n')

    void runExpand([`--source=${source}`, `--out=${watching.out}`, '--watch'])
    await vi.waitFor(() => expect(existsSync(watching.out)).toBe(true), { timeout: 5000 })

    expect(watching.outExisted).toBe(false)
  }, 15_000)

  it('runs the pass once more for a change that arrives while a pass is running', async () => {
    const source = path.join(project.dir, 'a.css')
    watching.out = path.join(project.dir, 'o.css')
    writeFileSync(source, '.a { @nave flex; }\n')

    void runExpand([`--source=${source}`, `--out=${watching.out}`, '--watch'])
    // The first pass is in flight: it yields at its first await.
    watching.onChange!()

    await vi.waitFor(
      () => expect(logs.filter((line) => line.startsWith('Expanded'))).toHaveLength(2),
      { timeout: 5000 },
    )
  }, 15_000)
})
