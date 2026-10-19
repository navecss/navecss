/**
 * The watching half of `navecss-core expand --watch`: calls `onChange` once after a burst of
 * changes to any of `files` settles. Watches each file's directory rather than the file, because
 * an editor that saves by writing a new file and renaming it over the old one leaves a watcher on
 * the file itself watching nothing.
 */
import { createHash } from 'node:crypto'
import { type FSWatcher, readFileSync, realpathSync, statSync, watch } from 'node:fs'
import path from 'node:path'

const SETTLE_MS = 40

/**
 * How often the files are also read for a change no file event reported. The operating system
 * does not report every change: on macOS the event stream starts a moment after `watch` returns,
 * so an edit made in that moment is never reported, and a busy machine can merge an edit's event
 * into one that names only the directory.
 */
const POLL_MS = 1000

/**
 * What a file is now, as far as a change to it goes: its inode, modification time and size, or
 * the empty string while it does not exist.
 */
function stampOf(file: string): string {
  try {
    const { ino, mtimeMs, size } = statSync(file)
    return `${String(ino)}:${String(mtimeMs)}:${String(size)}`
  } catch {
    return ''
  }
}

/**
 * A digest of a file's bytes, or the empty string while it does not exist.
 */
function digestOf(file: string): string {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex')
  } catch {
    return ''
  }
}

/**
 * Whether `file` was last modified in the second `ms` falls in, or later. On a filesystem that
 * keeps whole seconds, only such a file can take an edit of the same size without its time moving.
 */
function isModifiedSince(file: string, ms: number): boolean {
  try {
    return Math.floor(statSync(file).mtimeMs / 1000) >= Math.floor(ms / 1000)
  } catch {
    return false
  }
}

interface Seen {
  readonly isStampChanged: () => boolean
  readonly isContentChanged: (named: Iterable<string>) => boolean
  readonly record: () => void
}

/**
 * What each of `files` was at the last call back, so one edit calls back once, whether its file
 * event or a read of the files reports it first. The stamp is cheap and is what the poll reads.
 * A file event also compares the bytes of the file it names when the stamp has not moved: a
 * filesystem that keeps whole seconds gives two edits of one size in the same second the same
 * stamp. Bytes are read only for that, for a file whose stamp moved in a run, so the next event
 * has something to compare with, and at start for a file modified in the second the watch starts
 * (`startMs`), which could still take such an edit; never for a read that finds no change.
 */
function seenFiles(files: ReadonlySet<string>, startMs: number): Seen {
  const stamps = new Map<string, string>()
  const digests = new Map<string, string>()
  for (const file of files) {
    stamps.set(file, stampOf(file))
    if (isModifiedSince(file, startMs)) digests.set(file, digestOf(file))
  }
  return {
    isStampChanged: () => [...files].some((file) => stampOf(file) !== stamps.get(file)),
    isContentChanged: (named) => {
      let isChanged = false
      for (const file of named) {
        const before = digests.get(file)
        if (before === undefined || stampOf(file) !== stamps.get(file)) continue
        const digest = digestOf(file)
        if (digest !== before) isChanged = true
        digests.set(file, digest)
      }
      return isChanged
    },
    record: () => {
      for (const file of files) {
        const stamp = stampOf(file)
        if (stamp !== stamps.get(file)) digests.set(file, digestOf(file))
        stamps.set(file, stamp)
      }
    },
  }
}

/**
 * Starts watching, and returns the function that stops it. The watchers keep the process alive
 * until then.
 */
export function watchFiles(files: readonly string[], onChange: () => void): () => void {
  const wanted = new Set(files.map((file) => path.resolve(file)))
  const seen = seenFiles(wanted, Date.now())
  let timer: NodeJS.Timeout | undefined
  // The watched files the file events since the last settle named.
  const named = new Set<string>()
  const settle = (): void => {
    const files = [...named]
    named.clear()
    if (!seen.isStampChanged() && !seen.isContentChanged(files)) return
    seen.record()
    onChange()
  }
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(settle, SETTLE_MS)
  }
  // Each name an event can carry, with the watched file it stands for.
  const watchedNames = new Map([...wanted].map((file) => [file, file]))
  const directories = new Set([...wanted].map((file) => path.dirname(file)))
  // A file that is a symlink changes where it points: watch that file's directory too.
  for (const file of wanted) {
    try {
      const target = realpathSync(file)
      if (!watchedNames.has(target)) watchedNames.set(target, file)
      directories.add(path.dirname(target))
    } catch {
      // Not there yet: the lexical directory below sees it appear.
    }
  }
  const watchers: FSWatcher[] = []
  try {
    for (const directory of directories) {
      watchers.push(
        watch(directory, (_event, name) => {
          const file = name === null ? undefined : watchedNames.get(path.join(directory, name))
          if (name !== null && file === undefined) return
          const files = file === undefined ? wanted : [file]
          for (const each of files) named.add(each)
          schedule()
        }),
      )
    }
  } catch (error) {
    // Nothing stays half-watched: the caller reports the failure and the process can exit.
    for (const watcher of watchers) watcher.close()
    throw error
  }
  const poll = setInterval(() => {
    if (seen.isStampChanged()) schedule()
  }, POLL_MS)
  return () => {
    clearTimeout(timer)
    clearInterval(poll)
    for (const watcher of watchers) watcher.close()
  }
}
