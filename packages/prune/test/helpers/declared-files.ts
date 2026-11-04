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
 * Whether a `dir-dependency` message names a directory that holds `file` at any depth.
 */
export function isHeld(messages: readonly Message[], file: string): boolean {
  return ours(messages, 'dir-dependency').some((message) => isBelow(message.dir as string, file))
}

/**
 * The files among `candidates` the messages declare to the bundler. A `dependency` message names
 * a file; on webpack a `dir-dependency` message declares every file below its directory that
 * webpack reads, none of whose path segments below it begins with a dot, too, since Next.js hands
 * webpack the directory without its glob. Elsewhere only the named files count: this helper does
 * not model Turbopack's reading of a directory's glob, because the package gives Turbopack every
 * file by name.
 */
export function declaredFiles(
  messages: readonly Message[],
  candidates: readonly string[],
  isWebpack = false,
): string[] {
  const named = new Set(ours(messages, 'dependency').map((message) => message.file as string))
  return candidates
    .filter((file) => named.has(file) || (isWebpack && isHeld(messages, file)))
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
): string[] {
  const named = new Set(ours(messages, 'dependency').map((message) => message.file as string))
  return candidates.filter((file) => named.has(file) && isHeld(messages, file))
}
