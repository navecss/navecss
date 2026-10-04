/**
 * `navecss-core expand` run in this process, so what it prints and the exit code it answers are
 * observed through the same modules the bin calls (`expand-args.ts`, `expand-pass.ts`,
 * `expand-watch.ts`, `expand-command.ts`). `expand-command.test.ts` runs the shipped bin as a
 * script would; this file is the same behaviour without the child process.
 */
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseExpandArgs } from '../src/expand-args.ts'
import { runExpand } from '../src/expand-command.ts'
import { watchFiles } from '../src/expand-watch.ts'

const project = { dir: '' }
let out: string[] = []
let err: string[] = []

beforeEach(() => {
  project.dir = mkdtempSync(path.join(tmpdir(), 'nave-expand-inproc-'))
  out = []
  err = []
  vi.spyOn(console, 'log').mockImplementation((text: unknown) => out.push(String(text)))
  vi.spyOn(console, 'error').mockImplementation((text: unknown) => err.push(String(text)))
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(project.dir, { force: true, recursive: true })
})

function file(name: string): string {
  return path.join(project.dir, name)
}

function write(name: string, text: string): string {
  mkdirSync(path.dirname(file(name)), { recursive: true })
  writeFileSync(file(name), text)
  return file(name)
}

describe('parseExpandArgs', () => {
  it('reads pairs matched by order, --extend and --watch', () => {
    const parsed = parseExpandArgs([
      '--source=a.css',
      '--out=oa.css',
      '--source=b.css',
      '--out=ob.css',
      '--extend=m.mjs',
      '--watch',
    ])

    expect(parsed).toEqual({
      kind: 'job',
      job: {
        extend: 'm.mjs',
        pairs: [
          { source: 'a.css', out: 'oa.css' },
          { source: 'b.css', out: 'ob.css' },
        ],
        watch: true,
      },
    })
  })

  it('an --out that is a hard link to a --source is a usage error', () => {
    const source = write('src/a.css', '.a {}\n')
    linkSync(source, file('alias.css'))

    const parsed = parseExpandArgs([`--source=${source}`, `--out=${file('alias.css')}`])

    expect(parsed.kind === 'usageError' && parsed.message).toMatch(/overwrite its own input/)
  })

  it.each([
    [['--out=a'], /at least one --source/],
    [['--source=a'], /--out/],
    [['--source=a', '--source=b', '--out=c'], /one --out for each --source/],
    [['--source=', '--out=a'], /empty/],
    [['--source=a', '--out=a'], /overwrite its own input/],
    [['--source=a', '--source=b', '--out=c', '--out=c'], /same --out/],
    [['--source=a', '--out=b', '--extend=x', '--extend=y'], /one --extend/],
    [['--source=a', '--out=b', 'stray'], /positional argument: stray/],
    [['--source=a', '--out=b', '--nope'], /^expand: /],
  ])('%j is a usage error', (args, message) => {
    const parsed = parseExpandArgs(args)

    expect(parsed.kind).toBe('usageError')
    expect(parsed.kind === 'usageError' && parsed.message).toMatch(message)
  })
})

describe('runExpand', () => {
  it('expands, writes and says so', async () => {
    const source = write('src/app.css', '.a { @nave flex; }\n')

    const status = await runExpand([`--source=${source}`, `--out=${file('out/app.css')}`])

    expect(status).toBe(0)
    expect(readFileSync(file('out/app.css'), 'utf8')).toContain('display: flex')
    expect(out).toEqual([`Expanded ${source} to ${file('out/app.css')}.`])
  })

  it('prints usage for --help and for a usage error', async () => {
    expect(await runExpand(['--help'])).toBe(0)
    expect(out.join('\n')).toMatch(/navecss-core expand/)

    expect(await runExpand(['--source=a'])).toBe(2)
    expect(err.join('\n')).toMatch(/Usage/)
  })

  it('reports every problem of every file and writes nothing', async () => {
    const a = write('a.css', '.a { @nave nope; }\n')
    const b = write('b.css', "@import '@navecss/core';\n")

    const status = await runExpand([
      `--source=${a}`,
      `--out=${file('oa')}`,
      `--source=${b}`,
      `--out=${file('ob')}`,
    ])

    expect(status).toBe(1)
    expect(existsSync(file('oa'))).toBe(false)
    expect(existsSync(file('ob'))).toBe(false)
    expect(err.join('\n')).toContain(`${a}:1:12: @nave: unknown atom "nope"`)
    expect(err.join('\n')).toContain(`${b}:1:1: @import "@navecss/core" is a bare module specifier`)
  })

  it('answers 2 and names a source that cannot be read', async () => {
    const status = await runExpand([`--source=${file('missing.css')}`, `--out=${file('o')}`])

    expect(status).toBe(2)
    expect(err.join('\n')).toContain(`Could not read ${file('missing.css')}.`)
  })

  it('answers 2 when an output cannot be written', async () => {
    const source = write('a.css', '.a { @nave flex; }\n')
    write('blocker', 'a file')

    const status = await runExpand([`--source=${source}`, `--out=${file('blocker/o.css')}`])

    expect(status).toBe(2)
    expect(err.join('\n')).toContain('Could not write the output')
  })

  it('reads atoms of its own from --extend, and answers 2 for a module that does not load', async () => {
    const source = write('a.css', '.a { @nave brand; }\n')
    const atoms = write(
      'atoms.mjs',
      "export default { brand: { declarations: { color: 'teal' } } }\n",
    )

    expect(
      await runExpand([`--source=${source}`, `--out=${file('o.css')}`, `--extend=${atoms}`]),
    ).toBe(0)
    expect(readFileSync(file('o.css'), 'utf8')).toContain('color: teal')

    write('bad.mjs', 'export default 3\n')
    expect(
      await runExpand([
        `--source=${source}`,
        `--out=${file('o2.css')}`,
        `--extend=${file('bad.mjs')}`,
      ]),
    ).toBe(2)
    expect(
      await runExpand([`--source=${source}`, `--out=${file('o3.css')}`, '--extend=nope.mjs']),
    ).toBe(2)
  })

  it('reports an atom registered without declarations as a problem of that stylesheet', async () => {
    const source = write('a.css', '.a { @nave bad; }\n')
    const atoms = write(
      'atoms.mjs',
      "export default { bad: { pseudos: { ':hover': { color: 'red' } } } }\n",
    )

    const status = await runExpand([
      `--source=${source}`,
      `--out=${file('o.css')}`,
      `--extend=${atoms}`,
    ])

    expect(status).toBe(1)
    expect(err.join('\n')).toMatch(/declarations object/)
  })

  it('--watch answers 2 when a source sits under a directory that does not exist', async () => {
    const status = await runExpand([
      `--source=${file('no/such/dir/a.css')}`,
      `--out=${file('o.css')}`,
      '--watch',
    ])

    expect(status).toBe(2)
    expect(err.join('\n')).toMatch(/Could not watch/)
  })
})

describe('watchFiles', () => {
  it('calls back once after a change to a watched file settles, and stops when closed', async () => {
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)

    writeFileSync(watched, 'two')
    await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 15_000 })
    close()
    const calls = changed.mock.calls.length
    writeFileSync(watched, 'three')
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(changed.mock.calls.length).toBe(calls)
  }, 30_000)

  it('throws, and leaves no watcher behind, for a directory that does not exist', () => {
    expect(() => watchFiles([file('nope/a.css')], vi.fn())).toThrow()
  })
})
