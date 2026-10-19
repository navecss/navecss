/**
 * `watchFiles`, the watching half of `navecss-core expand --watch`, with the file watcher replaced
 * by a stand-in the test fires: it watches the directory of each file, and of a symlink's target;
 * it listens for the names it was asked about and for an event that carries no name; a burst of
 * events becomes one call once it settles; a change no event reported is still seen, once the files
 * are read again; an edit an event reports is seen even where the file's time and size do not
 * move (a filesystem that keeps whole seconds); and closing it stops the calls and closes every
 * watcher. The operating system's
 * file events can arrive seconds late when the machine is busy, or not at all, so nothing here
 * waits on them; the real watcher end to end is covered by the `--watch` row of
 * `expand-command.test.ts` (AC-directive-core-42).
 */
import type * as Crypto from 'node:crypto'
import type * as Fs from 'node:fs'

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: string, name: string | null) => void

const standIns = vi.hoisted(() => ({
  // How many digests of a file's bytes the watcher has started.
  digests: 0,
  // Whether `statSync` keeps reporting what it first reported for a file once this is on, whatever
  // the file holds since, as a filesystem that keeps whole seconds does for two edits of one size
  // in the same second.
  isCoarse: false,
  kept: new Map<string, unknown>(),
  // The modification time `statSync` reports for every file, when set.
  mtimeMs: undefined as number | undefined,
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
    statSync: (file: string) => {
      const stats = actual.statSync(file)
      const kept = standIns.isCoarse ? (standIns.kept.get(file) ?? stats) : stats
      if (standIns.isCoarse) standIns.kept.set(file, kept)
      return standIns.mtimeMs === undefined ? kept : { ...kept, mtimeMs: standIns.mtimeMs }
    },
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

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>()
  return {
    ...actual,
    createHash: (algorithm: string) => {
      standIns.digests += 1
      return actual.createHash(algorithm)
    },
  }
})

import { watchFiles } from '../src/expand-watch.ts'

const project = { dir: '' }

beforeEach(() => {
  vi.useFakeTimers()
  standIns.digests = 0
  standIns.isCoarse = false
  standIns.kept.clear()
  standIns.mtimeMs = undefined
  // A clock well past every file the rows write, so no file counts as modified in the second the
  // watch starts unless a row says so.
  vi.setSystemTime(new Date('2100-01-01T00:00:00.500Z'))
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
 * Long enough for the files to be read again and the change to settle.
 */
const POLL_AND_SETTLE_MS = 2000

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

    writeFileSync(watched, 'two, longer')
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

    // The watched file changed too, so only the name in the event keeps this from calling back.
    writeFileSync(file('w/a.css'), 'two, longer')
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

    writeFileSync(file('w/a.css'), 'two, longer')
    // eslint-disable-next-line unicorn/no-null -- `null` is what `fs.watch` passes when it cannot say which file changed
    fire(file('w'), null)
    settle()

    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })

  it('calls back for a change no file event reported, once the files are read again', () => {
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)

    writeFileSync(watched, 'two, longer')
    vi.advanceTimersByTime(POLL_AND_SETTLE_MS)

    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })

  it('does not call back a second time for a change an event already reported', () => {
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)

    writeFileSync(watched, 'two, longer')
    fire(file('w'), 'a.css')
    settle()
    vi.advanceTimersByTime(POLL_AND_SETTLE_MS * 3)

    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })

  it('does not call back a second time for a change a read of the files already reported', () => {
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)

    writeFileSync(watched, 'two, longer')
    vi.advanceTimersByTime(POLL_AND_SETTLE_MS)
    expect(changed).toHaveBeenCalledTimes(1)
    // The file event for the same edit, arriving after the read already reported it.
    fire(file('w'), 'a.css')
    settle()

    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })

  it('calls back for a second edit of one size whose time and size stay the same', () => {
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)
    writeFileSync(watched, 'two, longer')
    fire(file('w'), 'a.css')
    settle()
    expect(changed).toHaveBeenCalledTimes(1)

    standIns.isCoarse = true
    writeFileSync(watched, 'three, long')
    fire(file('w'), 'a.css')
    settle()

    expect(changed).toHaveBeenCalledTimes(2)
    close()
  })

  it('does not call back for such an edit from a read of the files alone', () => {
    standIns.isCoarse = true
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)

    writeFileSync(watched, 'two')
    vi.advanceTimersByTime(POLL_AND_SETTLE_MS * 3)

    expect(changed).not.toHaveBeenCalled()
    close()
  })

  it('does not call back for an event with no edit behind it when the time and size stay the same', () => {
    standIns.isCoarse = true
    const changed = vi.fn()
    const close = watchFiles([write('w/a.css', 'one')], changed)

    fire(file('w'), 'a.css')
    settle()

    expect(changed).not.toHaveBeenCalled()
    close()
  })

  it('reads the bytes of no file modified before the start window when it starts, nor on a read of the files that finds no change', () => {
    const close = watchFiles([write('w/a.css', 'one'), write('w/b.css', 'one')], vi.fn())
    expect(standIns.digests).toBe(0)

    vi.advanceTimersByTime(POLL_AND_SETTLE_MS * 3)

    expect(standIns.digests).toBe(0)
    close()
  })

  it('reads the bytes of only a file whose time and size moved, when a read of the files sees it', () => {
    const watched = write('w/a.css', 'one')
    const close = watchFiles([watched, write('w/b.css', 'one')], vi.fn())

    writeFileSync(watched, 'two, longer')
    vi.advanceTimersByTime(POLL_AND_SETTLE_MS)

    expect(standIns.digests).toBe(1)
    close()
  })

  it('reads the bytes of only the file an event names, once per event, when its time and size stay the same', () => {
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched, write('w/b.css', 'one')], changed)
    writeFileSync(watched, 'two, longer')
    fire(file('w'), 'a.css')
    settle()
    standIns.isCoarse = true
    const before = standIns.digests

    fire(file('w'), 'a.css')
    settle()
    fire(file('w'), 'a.css')
    settle()

    expect(standIns.digests - before).toBe(2)
    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })

  it('calls back for an edit of one size in the second the watch started, before any time moved', () => {
    standIns.mtimeMs = Date.now()
    standIns.isCoarse = true
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)

    writeFileSync(watched, 'two')
    fire(file('w'), 'a.css')
    settle()

    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })

  // A filesystem that keeps two-second times rounds down to an even second, and one whose clock
  // runs a little behind this machine's records an earlier second: the edit is still seen when
  // the file's time is up to two seconds before the second the watch starts.
  it.each([
    ['in the first millisecond of the start second', '00:00:00.999', '00:00:00.000'],
    ['in the start second', '00:00:01.200', '00:00:01.000'],
    ['one second before the start second', '00:00:01.200', '00:00:00.000'],
    ['two seconds before the start second', '00:00:02.200', '00:00:00.000'],
  ])(
    'calls back for an edit of one size when the file was last modified %s, before any time moved',
    (_name, clock, modified) => {
      vi.setSystemTime(new Date(`2100-01-01T${clock}Z`))
      standIns.mtimeMs = Date.parse(`2100-01-01T${modified}Z`)
      standIns.isCoarse = true
      const watched = write('w/a.css', 'one')
      const changed = vi.fn()
      const close = watchFiles([watched], changed)

      writeFileSync(watched, 'two')
      fire(file('w'), 'a.css')
      settle()

      expect(changed).toHaveBeenCalledTimes(1)
      close()
    },
  )

  it.each([
    ['three seconds', 3000],
    ['a minute', 60_000],
  ])(
    'reads the bytes of no file at start that was last modified %s or more before it starts',
    (_name, before) => {
      standIns.mtimeMs = Date.now() - before
      const close = watchFiles([write('w/a.css', 'one'), write('w/b.css', 'one')], vi.fn())

      expect(standIns.digests).toBe(0)
      close()
    },
  )

  it('reads the files again no more after it is closed', () => {
    const watched = write('w/a.css', 'one')
    const changed = vi.fn()
    const close = watchFiles([watched], changed)

    close()
    writeFileSync(watched, 'two, longer')
    vi.advanceTimersByTime(POLL_AND_SETTLE_MS * 3)

    expect(changed).not.toHaveBeenCalled()
  })

  it('watches a symlinked source through its target', () => {
    write('real/a.css', 'one')
    mkdirSync(file('src'))
    symlinkSync(file('real/a.css'), file('src/a.css'))
    const changed = vi.fn()
    const close = watchFiles([file('src/a.css')], changed)

    expect(watchedDirectories()).toEqual([file('real'), file('src')])
    writeFileSync(file('real/a.css'), 'two, longer')
    fire(file('real'), 'a.css')
    settle()

    expect(changed).toHaveBeenCalledTimes(1)
    close()
  })
})
