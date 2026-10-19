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

interface Seen {
  readonly isStampChanged: () => boolean
  readonly isContentChanged: () => boolean
  readonly record: () => void
}

/**
 * What each of `files` was at the last call back, so one edit calls back once, whether its file
 * event or a read of the files reports it first. The stamp is cheap and is what the poll reads.
 * A file event also compares the bytes when the stamp has not moved: a filesystem that keeps whole
 * seconds gives two edits of one size in the same second the same stamp.
 */
function seenFiles(files: ReadonlySet<string>): Seen {
  const stamps = new Map<string, string>()
  const digests = new Map<string, string>()
  const record = (): void => {
    for (const file of files) {
      stamps.set(file, stampOf(file))
      digests.set(file, digestOf(file))
    }
  }
  record()
  return {
    isStampChanged: () => [...files].some((file) => stampOf(file) !== stamps.get(file)),
    isContentChanged: () => [...files].some((file) => digestOf(file) !== digests.get(file)),
    record,
  }
}

/**
 * Starts watching, and returns the function that stops it. The watchers keep the process alive
 * until then.
 */
export function watchFiles(files: readonly string[], onChange: () => void): () => void {
  const wanted = new Set(files.map((file) => path.resolve(file)))
  const seen = seenFiles(wanted)
  let timer: NodeJS.Timeout | undefined
  let isEventPending = false
  const settle = (): void => {
    const isEvent = isEventPending
    isEventPending = false
    if (!seen.isStampChanged() && !(isEvent && seen.isContentChanged())) return
    seen.record()
    onChange()
  }
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(settle, SETTLE_MS)
  }
  const watchedNames = new Set(wanted)
  const directories = new Set([...wanted].map((file) => path.dirname(file)))
  // A file that is a symlink changes where it points: watch that file's directory too.
  for (const file of wanted) {
    try {
      const target = realpathSync(file)
      watchedNames.add(target)
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
          if (name !== null && !watchedNames.has(path.join(directory, name))) return
          isEventPending = true
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
