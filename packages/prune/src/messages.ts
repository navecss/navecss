/**
 * The messages the plugin gives the bundler so it runs the plugin again when what the plugin read
 * changes: a `dependency` for each file, a `dir-dependency` for each directory files were selected
 * from. Never a directory as a `dependency`, and nothing outside the root Next.js infers, for
 * either bundler (Turbopack panics on a file outside it, and Next.js 16.2.0 on webpack crashed on
 * the next build).
 */
import type { Message } from 'postcss'

import type { SelectedDirectory } from './entries.ts'

import { isInside } from './source-files.ts'

const PLUGIN = 'postcss-nave-prune'

/**
 * The messages for the files read and the directories selected from.
 */
export function dependencyMessages(input: {
  readonly directories: readonly Pick<SelectedDirectory, 'glob' | 'path'>[]
  readonly files: Iterable<string>
  readonly parent: string | undefined
  /**
   * The root no declared path may leave.
   */
  readonly root: string
}): Message[] {
  const { root, parent, files, directories } = input
  const messages: Message[] = []
  for (const file of files) {
    if (isInside(root, file)) messages.push({ type: 'dependency', plugin: PLUGIN, file, parent })
  }
  for (const directory of directories) {
    if (!isInside(root, directory.path)) continue
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
