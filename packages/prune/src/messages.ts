/**
 * The messages the plugin gives the bundler so it runs the plugin again when what the plugin read
 * changes: a `dependency` for each file, a `dir-dependency` for each directory files were selected
 * from. Never a directory as a `dependency`, and nothing outside the root Next.js infers, for
 * either bundler (Turbopack panics on a file outside it, and Next.js 16.2.0 on webpack crashed on
 * the next build).
 */
import type { Message } from 'postcss'

import path from 'node:path'

import type { SelectedDirectory } from './entries.ts'

import { isInside } from './source-files.ts'

const PLUGIN = 'postcss-nave-prune'

/**
 * What each glob token stands for in a regular expression: any directories, any run inside one
 * name, and a brace group with its alternatives.
 */
const TOKENS: Record<string, string> = {
  '**/': '(?:.*/)?',
  '*': '[^/]*',
  '{': '(?:',
  '}': ')',
  ',': '|',
}

/**
 * A pattern for the globs the package gives a directory: a single star, a double star and the
 * root conventions in braces.
 */
function patternOf(glob: string): RegExp {
  const source = glob
    .replaceAll(/[$()+.?[\\\]^|]/g, String.raw`\$&`)
    .replaceAll(/\*\*\/|\*|[{},]/g, (token) => TOKENS[token]!)
  return new RegExp(`^${source}$`)
}

/**
 * Whether the declared directory stands for `file`: the glob matches it, or the bundler ignores
 * globs and the file is anywhere below the directory.
 */
function isMatchedBy(
  directory: Pick<SelectedDirectory, 'glob' | 'path'>,
  file: string,
  areGlobsIgnored: boolean,
): boolean {
  if (!isInside(directory.path, file)) return false
  if (areGlobsIgnored) return true
  const relative = path.relative(directory.path, file).split(path.sep).join('/')
  return patternOf(directory.glob).test(relative)
}

/**
 * The messages for the files read and the directories selected from. A file a declared directory
 * already stands for is not declared again: webpack, given both, can fail to hash the directory.
 */
export function dependencyMessages(input: {
  /**
   * Whether the bundler takes a directory without its glob. webpack does: Next.js hands it
   * `addContextDependency(dir)`, which covers every file below the directory. Turbopack reads
   * the glob.
   */
  readonly areGlobsIgnored?: boolean
  readonly directories: readonly Pick<SelectedDirectory, 'glob' | 'path'>[]
  readonly files: Iterable<string>
  readonly parent: string | undefined
  /**
   * The root no declared path may leave.
   */
  readonly root: string
}): Message[] {
  const { root, parent, files, directories, areGlobsIgnored = false } = input
  const messages: Message[] = []
  // Only a directory that is declared can stand for a file: one outside the root gets no message.
  const declaredDirectories = directories.filter((directory) => isInside(root, directory.path))
  for (const file of files) {
    if (!isInside(root, file)) continue
    if (declaredDirectories.some((directory) => isMatchedBy(directory, file, areGlobsIgnored)))
      continue
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
