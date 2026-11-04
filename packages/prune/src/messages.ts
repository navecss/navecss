/**
 * The messages the plugin gives the bundler so it runs the plugin again when what the plugin read
 * changes: a `dependency` for each file, a `dir-dependency` for each directory files were selected
 * from. Never a directory as a `dependency`, and nothing outside the root Next.js infers, for
 * either bundler (Turbopack panics on a file outside it, and Next.js 16.2.0 on webpack crashed on
 * the next build).
 *
 * On webpack a file is not also declared when a declared directory reaches it. Next.js hands
 * webpack a `dir-dependency` as the directory alone, without its glob, and webpack reads that
 * directory at every depth but skips each entry whose name begins with a dot, so the directory
 * covers each file below it with no dot-named segment on the way (`.postcssrc.json` and a file in
 * `.config/` are still named) and webpack follows a symbolic link it meets there, so a file it
 * reaches through a link into `node_modules/` is covered too; given both, webpack can fail to hash
 * the directory, which killed the warm build with "Cannot read properties of undefined (reading
 * 'length')". Turbopack reads the glob and is given every file and every directory.
 */
import type { Message } from 'postcss'

import path from 'node:path'

import type { SelectedDirectory } from './entries.ts'

import { isInside } from './source-files.ts'

const PLUGIN = 'postcss-nave-prune'

/**
 * Whether webpack's reading of `directory` reaches `file`: webpack reads a directory it is handed
 * at every depth, but skips each entry whose name begins with a dot.
 */
function isReachedByWebpack(directory: string, file: string): boolean {
  const relative = path.relative(directory, file)
  if (relative === '' || path.isAbsolute(relative)) return false
  return relative.split(path.sep).every((segment) => !segment.startsWith('.'))
}

/**
 * Whether the plugin follows the link at `link` that leads to `target`. Webpack follows every link
 * it meets, except one held inside a package directory it tracks whole (`node_modules/<name>/` or
 * `node_modules/@<scope>/<name>/`, a name not beginning with a dot). The plugin follows the links
 * whose real target lies below a `node_modules/` directory, such as a package pnpm installs under
 * `node_modules/.pnpm/` and links into `node_modules/`. A link to anywhere else, such as a workspace
 * package, is left alone: a file read there that no declared directory covers by its real path
 * stays named.
 */
function isFollowed(link: string, target: string): boolean {
  const targetSegments = target.split(path.sep)
  if (!targetSegments.slice(0, -1).includes('node_modules')) return false
  const holding = path.dirname(link).split(path.sep)
  const modules = holding.indexOf('node_modules')
  if (modules === -1) return true
  const [name, scoped] = holding.slice(modules + 1)
  if (name === undefined || name.startsWith('.')) return true
  return name.startsWith('@') && (scoped === undefined || scoped.startsWith('.'))
}

/**
 * Whether webpack's reading of `directory` reaches `file`, directly or through the links the
 * plugin follows: a link that reading reaches leads it into the link's real target, which it reads
 * the same way, and so on through the links it meets there. A target is read once, so links that
 * lead back to each other end the search.
 */
function isReachedThroughLinks(
  directory: string,
  file: string,
  links: Readonly<Record<string, string>>,
): boolean {
  const followed = Object.entries(links).filter(([link, target]) => isFollowed(link, target))
  const visited = new Set<string>()
  const pending = [directory]
  for (let reading = pending.pop(); reading !== undefined; reading = pending.pop()) {
    if (visited.has(reading)) continue
    visited.add(reading)
    if (isReachedByWebpack(reading, file)) return true
    for (const [link, target] of followed) {
      if (isReachedByWebpack(reading, link)) pending.push(target)
    }
  }
  return false
}

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
  /**
   * The links the run met, each link's path with the real path it leads to.
   */
  readonly links?: Readonly<Record<string, string>>
  readonly parent: string | undefined
  /**
   * The root no declared path may leave.
   */
  readonly root: string
}): Message[] {
  const { root, parent, files, directories, isWebpack = false, links = {} } = input
  const messages: Message[] = []
  // Only a directory that is declared can stand for a file: one outside the root gets no message.
  const declaredDirectories = directories.filter((directory) => isInside(root, directory.path))
  for (const file of files) {
    if (!isInside(root, file)) continue
    if (
      isWebpack &&
      declaredDirectories.some((directory) => isReachedThroughLinks(directory.path, file, links))
    ) {
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
