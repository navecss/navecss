/**
 * Whether what the plugin read is still what is on disk: each file's content digest, each
 * selected directory's listing digest, the entries a specifier could have matched, where each
 * package was found through `node_modules`, and the options digest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { NaveOptions } from './options.ts'
import type { PruneRecord } from './record.ts'

import { digestOf } from './digest.ts'
import { findEntries } from './entries.ts'
import { directoryReader, linkTarget, listingName, listingNow } from './input-records.ts'
import { relativeTo } from './source-files.ts'
import { staleFile, staleOptions } from './texts.ts'

/**
 * Orders by code unit, so a directory (`app/`) comes before what is inside it (`app/page.tsx`).
 */
function byPath(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * The digest of a file's content, or of nothing when it cannot be read: the same stand-in the
 * plugin records for a file it could not open.
 */
function digestOfFile(file: string): string {
  try {
    return digestOf(readFileSync(file))
  } catch {
    return digestOf('')
  }
}

/**
 * The listing digest of each directory the entries are selected from now, by relative path with a
 * trailing slash.
 */
function listingsNow(dir: string): Map<string, string> {
  return new Map(
    findEntries(dir).directories.map((directory) => [
      `${relativeTo(dir, directory.path) || '.'}/`,
      digestOf(directory.names.join('\n')),
    ]),
  )
}

/**
 * The names of the entries, in path order.
 */
function inOrder(names: readonly string[]): string[] {
  return names.toSorted(byPath)
}

/**
 * The files and directories of the record that differ from the disk, in path order; when none
 * does, the directories whose entries a specifier could have matched, then the links through
 * `node_modules`, which the files that changed with them have already explained.
 */
function differences(dir: string, record: PruneRecord): string[] {
  const listings = listingsNow(dir)
  const changed = inOrder([
    ...Object.entries(record.files)
      .filter(([key, digest]) => digestOfFile(path.join(dir, key)) !== digest)
      .map(([key]) => key),
    ...Object.entries(record.directories)
      .filter(([key, digest]) => listings.get(key) !== digest)
      .map(([key]) => key),
  ])
  const entriesOf = directoryReader()
  const matched = inOrder(
    Object.entries(record.listings)
      .filter(([key, digest]) => listingNow(dir, key, entriesOf) !== digest)
      .map(([key]) => listingName(key)),
  )
  const linked = inOrder(
    Object.entries(record.links)
      .filter(([link, target]) => linkTarget(dir, path.join(dir, link)) !== target)
      .map(([link]) => link),
  )
  return [...changed, ...matched, ...linked]
}

/**
 * The message for the first thing that changed since the plugin ran, or `undefined` when nothing
 * did.
 * @param input What is checked.
 * @param input.dir The project directory.
 * @param input.cache The cache directory as the user would delete it.
 * @param input.record What the plugin recorded.
 * @param input.options The options `withNave()` was called with.
 */
export function staleMessage(input: {
  readonly cache: string
  readonly dir: string
  readonly options: NaveOptions
  readonly record: PruneRecord
}): string | undefined {
  const { dir, cache, record, options } = input
  const [first] = differences(dir, record)
  if (first !== undefined) return staleFile(first, cache)
  if (digestOf(JSON.stringify(options)) !== record.optionsDigest) return staleOptions(cache)
  return undefined
}
