/**
 * The watching half of `navecss-core expand --watch`: calls `onChange` once after a burst of
 * changes to any of `files` settles. Watches each file's directory rather than the file, because
 * an editor that saves by writing a new file and renaming it over the old one leaves a watcher on
 * the file itself watching nothing.
 */
import { type FSWatcher, realpathSync, watch } from 'node:fs'
import path from 'node:path'

const SETTLE_MS = 40

/**
 * Starts watching, and returns the function that stops it. The watchers keep the process alive
 * until then.
 */
export function watchFiles(files: readonly string[], onChange: () => void): () => void {
  const wanted = new Set(files.map((file) => path.resolve(file)))
  let timer: NodeJS.Timeout | undefined
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(onChange, SETTLE_MS)
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
          if (name === null || watchedNames.has(path.join(directory, name))) schedule()
        }),
      )
    }
  } catch (error) {
    // Nothing stays half-watched: the caller reports the failure and the process can exit.
    for (const watcher of watchers) watcher.close()
    throw error
  }
  return () => {
    clearTimeout(timer)
    for (const watcher of watchers) watcher.close()
  }
}
