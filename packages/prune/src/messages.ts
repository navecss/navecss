/**
 * The messages the plugin gives the bundler so it runs the plugin again when what the plugin read
 * changes: a `dependency` for each file, a `dir-dependency` for each directory files were selected
 * from. Never a directory as a `dependency`, and nothing outside the bundler's root when it has one
 * (Turbopack panics on a file outside its root; webpack has no such limit).
 */
import type { Message } from 'postcss'

import type { SelectedDirectory } from './entries.ts'

import { isInside } from './source-files.ts'

const PLUGIN = 'postcss-nave-prune'

/**
 * Whether a path may be declared under `root`: any path when there is no root.
 */
function isWithin(root: string | undefined, file: string): boolean {
  return root === undefined || isInside(root, file)
}

/**
 * The messages for the files read and the directories selected from.
 */
export function dependencyMessages(input: {
  readonly directories: readonly SelectedDirectory[]
  readonly files: Iterable<string>
  readonly parent: string | undefined
  /**
   * The root no declared path may leave, or `undefined` for none.
   */
  readonly root: string | undefined
}): Message[] {
  const { root, parent, files, directories } = input
  const messages: Message[] = []
  for (const file of files) {
    if (isWithin(root, file)) messages.push({ type: 'dependency', plugin: PLUGIN, file, parent })
  }
  for (const directory of directories) {
    if (!isWithin(root, directory.path)) continue
    messages.push({
      type: 'dir-dependency',
      plugin: PLUGIN,
      dir: directory.path,
      glob: directory.glob,
      parent,
    })
  }
  return messages
}
