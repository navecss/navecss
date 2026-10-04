/**
 * The watching half of `navecss-core expand --watch`: calls `onChange` once after a burst of
 * changes to any of `files` settles. Watches each file's directory rather than the file, because
 * an editor that saves by writing a new file and renaming it over the old one leaves a watcher on
 * the file itself watching nothing.
 */
import { realpathSync, watch } from 'node:fs'
import path from 'node:path'

const SETTLE_MS = 40

/**
 * Starts watching; the watchers keep the process alive, so nothing is returned to stop them.
 */
export function watchFiles(files: readonly string[], onChange: () => void): void {
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
  for (const directory of directories) {
    watch(directory, (_event, name) => {
      if (name === null || watchedNames.has(path.join(directory, name))) schedule()
    })
  }
}
