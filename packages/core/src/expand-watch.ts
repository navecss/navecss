/**
 * The watching half of `navecss-core expand --watch`: calls `onChange` once after a burst of
 * changes to any of `files` settles. Watches each file's directory rather than the file, because
 * an editor that saves by writing a new file and renaming it over the old one leaves a watcher on
 * the file itself watching nothing.
 */
import { watch } from 'node:fs'
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
  const directories = new Set([...wanted].map((file) => path.dirname(file)))
  for (const directory of directories) {
    watch(directory, (_event, name) => {
      if (name === null || wanted.has(path.join(directory, name))) schedule()
    })
  }
}
