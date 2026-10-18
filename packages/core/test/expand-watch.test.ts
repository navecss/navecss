/**
 * `watchFiles`, the watching half of `navecss-core expand --watch`, with the file watcher replaced
 * by a stand-in the test fires: it watches the directory of each file, and of a symlink's target;
 * it listens for the names it was asked about and for an event that carries no name; a burst of
 * events becomes one call once it settles; and closing it stops the calls and closes every watcher.
 * The operating system's file events can arrive seconds late when the machine is busy, so nothing
 * here waits on them; the real watcher end to end is covered by the `--watch` row of
 * `expand-command.test.ts` (AC-directive-core-42).
 */
import type * as Fs from 'node:fs'

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: string, name: string | null) => void

const standIns = vi.hoisted(() => ({
  opened: [] as {
    close: ReturnType<typeof vi.fn>
    closed: boolean
    directory: string
    listener: Listener
  }[],
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>()
  return {
    ...actual,
    watch: (directory: string, listener: Listener) => {
      const standIn = { close: vi.fn(), closed: false, directory, listener }
      standIn.close.mockImplementation(() => {
        standIn.closed = true
      })
      standIns.opened.push(standIn)
      return standIn
    },
  }
})

import { watchFiles } from '../src/expand-watch.ts'

const project = { dir: '' }

beforeEach(() => {
  vi.useFakeTimers()
  standIns.opened.length = 0
  const made = mkdtempSync(path.join(tmpdir(), 'nave-expand-watch-files-'))
  project.dir = realpathSync(made)
})

afterEach(() => {
  vi.useRealTimers()
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

function watchedDirectories(): string[] {
  return standIns.opened.map((standIn) => standIn.directory).toSorted((a, b) => a.localeCompare(b))
}

/*
 * Delivers an event the way the operating system would: to every open watcher of that directory.
 */
function fire(directory: string, name: string | null): void {
  for (const standIn of standIns.opened) {
    if (standIn.directory === directory && !standIn.closed) standIn.listener('change', name)
  }
}

/*
 * Longer than the settle wait, shorter than anything a test could mistake for a second burst.
 */
function settle(): void {
  vi.advanceTimersByTime(100)
}

describe('watchFiles', () => {
  it('watches the directory of each file, once per directory', () => {
    const close = watchFiles(
      [write('a/one.css', ''), write('a/two.css', ''), write('b/three.css', '')],
      vi.fn(),
    )

    expect(watchedDirectories()).toEqual([file('a'), file('b')])
    close()
  })

  it('calls back once after a change to a watched file settles, and stops when closed', () => {
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)

    fire(file('w'), 'a.css')
    fire(file('w'), 'a.css')
    fire(file('w'), 'a.css')
    expect(changed).not.toHaveBeenCalled()
    settle()
    expect(changed).toHaveBeenCalledTimes(1)

    fire(file('w'), 'a.css')
    close()
    settle()
    fire(file('w'), 'a.css')
    settle()

    expect(changed).toHaveBeenCalledTimes(1)
    expect(standIns.opened).toHaveLength(1)
    for (const standIn of standIns.opened) expect(standIn.close).toHaveBeenCalledTimes(1)
  })

  it('closes every watcher it opened', () => {
    const close = watchFiles([write('a/one.css', ''), write('b/two.css', '')], vi.fn())

    close()

    expect(standIns.opened).toHaveLength(2)
    for (const standIn of standIns.opened) expect(standIn.close).toHaveBeenCalledTimes(1)
  })

  it('does not call back for another file in a watched directory', () => {
    const changed = vi.fn()
    const close = watchFiles([write('w/a.css', 'one')], changed)

    fire(file('w'), 'other.css')
    settle()
    expect(changed).not.toHaveBeenCalled()

    fire(file('w'), 'a.css')
    settle()
    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })

  it('calls back for an event that names no file', () => {
    const changed = vi.fn()
    const close = watchFiles([write('w/a.css', 'one')], changed)

    // eslint-disable-next-line unicorn/no-null -- `null` is what `fs.watch` passes when it cannot say which file changed
    fire(file('w'), null)
    settle()

    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })

  it('watches a symlinked source through its target', () => {
    write('real/a.css', 'one')
    mkdirSync(file('src'))
    symlinkSync(file('real/a.css'), file('src/a.css'))
    const changed = vi.fn()
    const close = watchFiles([file('src/a.css')], changed)

    expect(watchedDirectories()).toEqual([file('real'), file('src')])
    fire(file('real'), 'a.css')
    settle()

    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })
})
