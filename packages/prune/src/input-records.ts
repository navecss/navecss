/**
 * What the record keeps of the resolution inputs, and how to read it from the disk again: the
 * listing digests of the entries a specifier could have matched, and where each package was found
 * through `node_modules`.
 */
import { readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'

import type { ResolutionInputs, Stem } from './resolution-inputs.ts'

import { digestOf } from './digest.ts'
import { relativeTo } from './source-files.ts'

type Entries = readonly { isDirectory: () => boolean; name: string }[]

/**
 * A reader of directories that reads each once.
 */
export function directoryReader(): (directory: string) => Entries {
  const read = new Map<string, Entries>()
  return (directory) => {
    const known = read.get(directory)
    if (known) return known
    let entries: Entries = []
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      // A directory that cannot be read has no entries.
    }
    read.set(directory, entries)
    return entries
  }
}

/**
 * The digest of the entries of `directory` called `stem`, directories marked with a trailing `/`.
 */
function stemListing(entries: Entries, stem: string): string {
  const names = entries
    .filter((entry) => entry.name === stem || entry.name.startsWith(`${stem}.`))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .toSorted((a, b) => a.localeCompare(b))
  return digestOf(names.join('\n'))
}

/**
 * The key a stem's listing is recorded under: the stem's path relative to `dir` and a `*`.
 */
function listingKey(dir: string, stem: Stem): string {
  return `${relativeTo(dir, stem.directory) || '.'}/${stem.stem}*`
}

/**
 * The listing digest of the stem a key names, as the disk holds it now, reading directories with
 * `entriesOf`.
 */
export function listingNow(
  dir: string,
  key: string,
  entriesOf: (directory: string) => Entries,
): string {
  const entry = key.slice(0, -1)
  const directory = path.join(dir, path.posix.dirname(entry))
  return stemListing(entriesOf(directory), path.posix.basename(entry))
}

/**
 * What a recorded listing is called when it changed: its directory, with a trailing `/`.
 */
export function listingName(key: string): string {
  return `${path.posix.dirname(key.slice(0, -1))}/`
}

/**
 * Where the link at `link` leads, relative to `dir`, or an empty text when nothing is there.
 */
export function linkTarget(dir: string, link: string): string {
  try {
    return relativeTo(dir, realpathSync(link))
  } catch {
    return ''
  }
}

/**
 * Orders entries by key.
 */
function byKey([a]: [string, string], [b]: [string, string]): number {
  return a.localeCompare(b)
}

/**
 * The record's `listings` and `links` for the inputs a run noted, sorted by key.
 */
export function recordedInputs(
  dir: string,
  inputs: ResolutionInputs,
): {
  readonly links: Record<string, string>
  readonly listings: Record<string, string>
} {
  const entriesOf = directoryReader()
  return {
    listings: Object.fromEntries(
      inputs.stems
        .values()
        .map((stem): [string, string] => [
          listingKey(dir, stem),
          stemListing(entriesOf(stem.directory), stem.stem),
        ])
        .toArray()
        .toSorted(byKey),
    ),
    links: Object.fromEntries(
      inputs.links
        .values()
        .map((link): [string, string] => [relativeTo(dir, link), linkTarget(dir, link)])
        .toArray()
        .toSorted(byKey),
    ),
  }
}

/**
 * The directories the stems are in, once each, for the bundler to watch.
 */
export function stemDirectories(inputs: ResolutionInputs): { glob: string; path: string }[] {
  return [...new Set(inputs.stems.values().map((stem) => stem.directory))]
    .toSorted((a, b) => a.localeCompare(b))
    .map((directory) => ({ path: directory, glob: '*' }))
}
