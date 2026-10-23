/**
 * AC-native-apply-order-21, -22 and -24 on `navecss-core expand`: the order warning goes to
 * standard error as `file:line:column: text`, once per file per pass (per pass under `--watch`),
 * and changes neither the exit status nor any output. `navecss-core check` reads built output and
 * prints nothing about order. The shipped bin is run, so `dist` must be built.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const watching = vi.hoisted(() => ({ onChange: undefined as undefined | (() => void) }))

vi.mock('../src/expand-watch.ts', () => ({
  watchFiles: (_files: string[], onChange: () => void) => {
    watching.onChange = onChange
    return vi.fn()
  },
}))

import { expandText } from '../src/directive/expand-text.ts'
import { runExpand } from '../src/expand-command.ts'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'bin.js')

const FIXTURE = '.c { @nave hideDesktopUp flex; }\n'
const MARKED = '.c { @nave /* nave-allow-override: display */ hideDesktopUp flex; }\n'
const WITH_PROBLEM = '.c { @nave hideDesktopUp flex; } .d { @nave nope; }\n'
const WARNING = expandText(FIXTURE).warnings[0]!.text

const project = { dir: '' }

beforeEach(() => {
  project.dir = mkdtempSync(path.join(tmpdir(), 'nave-expand-order-'))
  watching.onChange = undefined
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(project.dir, { force: true, recursive: true })
})

/**
 * Writes `text` to `name` in the project.
 */
function write(name: string, text: string): void {
  writeFileSync(path.join(project.dir, name), text, 'utf8')
}

/**
 * Reads `name` from the project.
 */
function read(name: string): string {
  return readFileSync(path.join(project.dir, name), 'utf8')
}

/**
 * Runs the shipped bin's `command` in the project.
 */
function bin(
  command: string,
  ...args: string[]
): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(process.execPath, [BIN, command, ...args], {
    cwd: project.dir,
    encoding: 'utf8',
    timeout: 20_000,
  })
  return { status: result.status, stderr: result.stderr, stdout: result.stdout }
}

describe('AC-native-apply-order-21: navecss-core expand', () => {
  it('exits 0, writes every --out, and prints the warning once on standard error', () => {
    write('a.css', FIXTURE)
    write('m.css', MARKED)

    const run = bin('expand', '--source=a.css', '--out=o.css', '--source=m.css', '--out=m-out.css')

    expect(run.status, run.stderr).toBe(0)
    expect(run.stderr.trim().split('\n')).toEqual([`a.css:1:26: ${WARNING}`])
    expect(run.stdout).not.toContain('nave-allow-override')
    expect(read('o.css')).toBe(read('m-out.css'))
  })

  it('prints nothing about order for a directive carrying its marker', () => {
    write('m.css', MARKED)

    const run = bin('expand', '--source=m.css', '--out=o.css')

    expect(run.status).toBe(0)
    expect(run.stderr).toBe('')
  })

  it('prints each file’s warning, in the order the files were given', () => {
    write('a.css', FIXTURE)
    write('b.css', `\n${FIXTURE}`)

    const run = bin(
      'expand',
      '--source=b.css',
      '--out=b-out.css',
      '--source=a.css',
      '--out=a-out.css',
    )

    expect(run.status, run.stderr).toBe(0)
    expect(run.stderr.trim().split('\n')).toEqual([
      `b.css:2:26: ${WARNING}`,
      `a.css:1:26: ${WARNING}`,
    ])
  })
})

describe('AC-native-apply-order-22: navecss-core expand with a problem', () => {
  it('exits 1 as it does without the warning, and writes nothing', () => {
    write('a.css', WITH_PROBLEM)
    write('p.css', '.d { @nave nope; }\n')

    const withWarning = bin('expand', '--source=a.css', '--out=o.css')
    const without = bin('expand', '--source=p.css', '--out=p-out.css')

    expect(withWarning.status).toBe(1)
    expect(without.status).toBe(1)
    expect(withWarning.stderr).toContain('unknown atom "nope"')
    expect(() => read('o.css')).toThrow()
  })
})

describe('AC-native-apply-order-21: navecss-core expand --watch', () => {
  it('prints the warning on each pass that reads the file, and the outputs are those of a run without it', async () => {
    const source = path.join(project.dir, 'a.css')
    const out = path.join(project.dir, 'o.css')
    const errors: string[] = []
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation((text: unknown) => {
      errors.push(String(text))
    })
    writeFileSync(source, FIXTURE)

    // Never settles while watching, so the loop is observed and not awaited.
    void runExpand([`--source=${source}`, `--out=${out}`, '--watch'])
    await vi.waitFor(() => expect(errors).toEqual([`${source}:1:26: ${WARNING}`]), {
      timeout: 5000,
    })
    const firstOutput = readFileSync(out, 'utf8')

    watching.onChange!()
    await vi.waitFor(() => expect(errors).toHaveLength(2), { timeout: 5000 })

    expect(errors[1]).toBe(errors[0])
    expect(readFileSync(out, 'utf8')).toBe(firstOutput)
    expect(firstOutput).toBe(expandText(MARKED, { onUnknown: 'error' }).css)
  }, 15_000)
})

describe('AC-native-apply-order-24: navecss-core check has nothing to check', () => {
  it('prints nothing about order on the built output of the fixture, and exits 0', () => {
    write('a.css', FIXTURE)
    expect(bin('expand', '--source=a.css', '--out=o.css').status).toBe(0)

    const run = bin('check', '--source=o.css')

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout + run.stderr).not.toMatch(/order|override|nave-allow/i)
  })
})
