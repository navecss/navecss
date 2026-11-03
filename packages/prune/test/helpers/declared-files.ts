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
 * Whether `file` lies anywhere below `directory`.
 */
function isBelow(directory: string, file: string): boolean {
  const relative = path.relative(directory, file)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Whether a `dir-dependency` message names a directory that holds `file` at any depth.
 */
function isHeld(messages: readonly Message[], file: string): boolean {
  return ours(messages, 'dir-dependency').some((message) => isBelow(message.dir as string, file))
}

/**
 * The files among `candidates` the messages declare to the bundler. A `dependency` message names
 * a file; on webpack a `dir-dependency` message declares every file below its directory too,
 * since Next.js hands webpack the directory without its glob.
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
 * `dependency` message and held by a declared directory.
 */
export function declaredTwice(
  messages: readonly Message[],
  candidates: readonly string[],
): string[] {
  const named = new Set(ours(messages, 'dependency').map((message) => message.file as string))
  return candidates.filter((file) => named.has(file) && isHeld(messages, file))
}
