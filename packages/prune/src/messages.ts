/**
 * The messages the plugin gives the bundler so it runs the plugin again when what the plugin read
 * changes: a `dependency` for each file, a `dir-dependency` for each directory files were selected
 * from. Never a directory as a `dependency`, and nothing outside the root Next.js infers, for
 * either bundler (Turbopack panics on a file outside it, and Next.js 16.2.0 on webpack crashed on
 * the next build).
 *
 * On webpack a file is not also declared when a declared directory holds it. Next.js hands webpack
 * a `dir-dependency` as the directory alone, without its glob, so the directory covers every file
 * below it; given both, webpack can fail to hash the directory, which killed the warm build with
 * "Cannot read properties of undefined (reading 'length')". Turbopack reads the glob and is given
 * every file and every directory.
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
  /**
   * Whether the bundler is webpack, which takes a directory without its glob.
   */
  readonly isWebpack?: boolean
  readonly parent: string | undefined
  /**
   * The root no declared path may leave.
   */
  readonly root: string
}): Message[] {
  const { root, parent, files, directories, isWebpack = false } = input
  const messages: Message[] = []
  // Only a directory that is declared can stand for a file: one outside the root gets no message.
  const declaredDirectories = directories.filter((directory) => isInside(root, directory.path))
  for (const file of files) {
    if (!isInside(root, file)) continue
    if (isWebpack && declaredDirectories.some((directory) => isInside(directory.path, file))) {
      continue
    }
    messages.push({ type: 'dependency', plugin: PLUGIN, file, parent })
  }
  for (const directory of declaredDirectories) {
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
