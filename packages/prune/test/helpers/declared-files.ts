import type { Message } from 'postcss'

import path from 'node:path'

const PLUGIN = 'postcss-nave-prune'

/**
 * The names a brace glob such as `{layout,page}.{js,jsx}` stands for, or `undefined` for a glob
 * that is not one.
 */
function namesOf(glob: string): string[] | undefined {
  const groups = glob.matchAll(/\{([^}]*)\}/g).toArray()
  if (groups.length === 0 || glob.includes('*')) return undefined
  let names = [glob]
  for (const [group, alternatives] of groups) {
    names = names.flatMap((name) =>
      alternatives!.split(',').map((one) => name.replace(group, () => one)),
    )
  }
  return names
}

/**
 * Whether a `dir-dependency` message stands for `file`, read the way a bundler reads a directory
 * with a glob: `**` then `/*` any file below, `*` a file directly in it, braces the names they
 * list directly in it. A different reading from the package's own, so the two can disagree.
 */
function isStoodFor(message: Message, file: string, areGlobsIgnored: boolean): boolean {
  const relative = path.relative(message.dir as string, file)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false
  if (areGlobsIgnored) return true
  const isDirect = !relative.includes(path.sep)
  const glob = message.glob as string
  if (glob === '**/*') return true
  if (glob === '*') return isDirect
  return isDirect && (namesOf(glob)?.includes(relative) ?? false)
}

/**
 * The files among `candidates` the messages declare to the bundler: named by a `dependency`
 * message, or inside a directory a `dir-dependency` message names with a glob that matches it.
 */
export function declaredFiles(
  messages: readonly Message[],
  candidates: readonly string[],
  areGlobsIgnored = false,
): string[] {
  const ours = messages.filter((message) => message.plugin === PLUGIN)
  const named = new Set(
    ours
      .filter((message) => message.type === 'dependency')
      .map((message) => message.file as string),
  )
  const directories = ours.filter((message) => message.type === 'dir-dependency')
  return candidates
    .filter(
      (file) =>
        named.has(file) ||
        directories.some((message) => isStoodFor(message, file, areGlobsIgnored)),
    )
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * The files among `candidates` the messages declare in both ways at once.
 */
export function declaredTwice(
  messages: readonly Message[],
  candidates: readonly string[],
  areGlobsIgnored = false,
): string[] {
  const named = new Set(
    messages
      .filter((message) => message.plugin === PLUGIN && message.type === 'dependency')
      .map((message) => message.file as string),
  )
  const asDirectoryOnly = declaredFiles(
    messages.filter((message) => message.type !== 'dependency'),
    candidates,
    areGlobsIgnored,
  )
  return asDirectoryOnly.filter((file) => named.has(file))
}
