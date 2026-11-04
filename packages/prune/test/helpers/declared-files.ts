import type { Message } from 'postcss'

import path from 'node:path'

const PLUGIN = 'postcss-nave-prune'

/**
 * The messages of the plugin of one type.
 */
function ours(messages: readonly Message[], type: string): Message[] {
  return messages.filter((message) => message.plugin === PLUGIN && message.type === type)
}

/**
 * Whether webpack's reading of `directory` reaches `file`: webpack reads a directory it is handed
 * at every depth, but skips each entry whose name begins with a dot.
 */
function isBelow(directory: string, file: string): boolean {
  const relative = path.relative(directory, file)
  if (relative === '' || path.isAbsolute(relative)) return false
  return relative.split(path.sep).every((segment) => !segment.startsWith('.'))
}

/**
 * Whether the plugin follows the link at `link` that leads to `target`: its real target lies below
 * a `node_modules/` directory, and the directory holding the link is not inside a package
 * directory (`node_modules/<name>/` or `node_modules/@<scope>/<name>/`, a name not beginning with
 * a dot), which webpack tracks whole.
 */
function isFollowed(link: string, target: string): boolean {
  if (!target.split(path.sep).slice(0, -1).includes('node_modules')) return false
  const holding = path.dirname(link).split(path.sep)
  const modules = holding.indexOf('node_modules')
  if (modules === -1) return true
  const [name, scoped] = holding.slice(modules + 1)
  if (name === undefined || name.startsWith('.')) return true
  return name.startsWith('@') && (scoped === undefined || scoped.startsWith('.'))
}

/**
 * Whether webpack's reading of `directory` reaches `file` directly, or through the links the
 * plugin follows, and the links met in their targets in turn.
 */
function isReachedThrough(
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
    if (isBelow(reading, file)) return true
    for (const [link, target] of followed) {
      if (isBelow(reading, link)) pending.push(target)
    }
  }
  return false
}

/**
 * The record's links as absolute paths: each link's path with the real path it leads to, the way
 * the plugin hands them to the messages. A link whose target is empty led nowhere.
 */
export function absoluteLinks(
  dir: string,
  recorded: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(recorded)
      .filter(([, target]) => target !== '')
      .map(([link, target]) => [path.resolve(dir, link), path.resolve(dir, target)]),
  )
}

/**
 * Whether a `dir-dependency` message names a directory whose reading by webpack reaches `file`,
 * through the `links` the plugin follows when it is given them.
 */
export function isHeld(
  messages: readonly Message[],
  file: string,
  links: Readonly<Record<string, string>> = {},
): boolean {
  return ours(messages, 'dir-dependency').some((message) =>
    isReachedThrough(message.dir as string, file, links),
  )
}

/**
 * The files among `candidates` the messages declare to the bundler. A `dependency` message names
 * a file; on webpack a `dir-dependency` message declares every file below its directory that
 * webpack reads, none of whose path segments below it begins with a dot, directly or through the
 * links given that the plugin follows, too, since Next.js hands webpack the directory without its glob. Elsewhere only the named files count: this helper does
 * not model Turbopack's reading of a directory's glob, because the package gives Turbopack every
 * file by name.
 */
export function declaredFiles(
  messages: readonly Message[],
  candidates: readonly string[],
  isWebpack = false,
  links: Readonly<Record<string, string>> = {},
): string[] {
  const named = new Set(ours(messages, 'dependency').map((message) => message.file as string))
  return candidates
    .filter((file) => named.has(file) || (isWebpack && isHeld(messages, file, links)))
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * The files among `candidates` the messages declare in both ways at once: named by a
 * `dependency` message and held, at any depth and whatever its glob, by a declared directory.
 * That is the pairing webpack cannot hash; it says nothing about a glob Turbopack would read.
 */
export function declaredTwice(
  messages: readonly Message[],
  candidates: readonly string[],
  links: Readonly<Record<string, string>> = {},
): string[] {
  const named = new Set(ours(messages, 'dependency').map((message) => message.file as string))
  return candidates.filter((file) => named.has(file) && isHeld(messages, file, links))
}
