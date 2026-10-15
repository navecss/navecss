import type { LocatedProblem } from '@navecss/core/collect'

/**
 * What the plugin leaves under `<project>/<distDir>/cache/` for the build's own check to read:
 * its problems, the atoms it emitted, a digest of everything it read and of the options.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { Handoff } from './handoff.ts'

import { digestOf } from './digest.ts'

export interface DirectiveProblem {
  /**
   * Relative to the directory holding `next.config`, forward slashes.
   */
  readonly file: string
  readonly line: number
  readonly column: number
  /**
   * The text core's PostCSS plugin throws for the same directive, without its position prefix.
   */
  readonly text: string
}

export interface PruneRecord {
  readonly version: 1
  /**
   * A digest of the options the plugin trimmed with.
   */
  readonly optionsDigest: string
  /**
   * The atoms emitted, sorted, closed under the one pair where one restores what the other hides.
   */
  readonly atoms: readonly string[]
  /**
   * What the reader could not read, placed in the authored file; paths relative to the directory
   * holding `next.config` (a dependency by its real path), forward slashes.
   */
  readonly problems: readonly LocatedProblem[]
  readonly directiveProblems: readonly DirectiveProblem[]
  /**
   * Configuration problems found on the PostCSS entry (options that belong to `withNave()`).
   */
  readonly entryProblems: readonly string[]
  /**
   * Content digest of every file read, keyed by the same relative path.
   */
  readonly files: Readonly<Record<string, string>>
  /**
   * Listing digest of every directory files were selected from, keyed by a relative path with a
   * trailing `/`.
   */
  readonly directories: Readonly<Record<string, string>>
  /**
   * Every `.md` and `.mdx` file the graph met, sorted.
   */
  readonly markdown: readonly string[]
  /**
   * Whether core's PostCSS plugin ran in the same pipeline.
   */
  readonly hasCorePlugin: boolean
  /**
   * Whether the graph named no atom and `keep` is empty. With no `@nave` directive in any
   * stylesheet either, the emitted set is the `keepFor` lists alone (`readsNoUse`).
   */
  readonly readsNoCode: boolean
  /**
   * Whether the emitted set is the `keepFor` lists alone: nothing was read, so the build reads
   * no use of an atom. Derived when the record is read, from `readsNoCode` and the stylesheets.
   */
  readonly readsNoUse: boolean
}

/**
 * What a stylesheet without the atom layer leaves: its `@nave` problems, and whether it used the
 * directive at all. One file each, so stylesheets processed at the same time never write the same
 * file.
 */
export interface SheetRecord {
  /**
   * The stylesheet, relative to the directory holding `next.config`.
   */
  readonly file: string
  /**
   * Whether the stylesheet was a file on disk when the record was written: a record of one that
   * has since been deleted is dropped.
   */
  readonly isOnDisk: boolean
  readonly hasDirective: boolean
  readonly problems: readonly DirectiveProblem[]
}

/**
 * Where the record of a project lives, under its `distDir`'s `cache` directory.
 */
function recordPath(handoff: Pick<Handoff, 'dir' | 'distDir'>): string {
  return path.join(handoff.dir, handoff.distDir, 'cache', 'navecss-prune.json')
}

/**
 * The directory the stylesheets' own records live in.
 */
function sheetsDirectory(handoff: Pick<Handoff, 'dir' | 'distDir'>): string {
  return path.join(handoff.dir, handoff.distDir, 'cache', 'navecss-prune-sheets')
}

/**
 * Writes the record, creating the cache directory.
 */
export function writeRecord(handoff: Handoff, record: Omit<PruneRecord, 'readsNoUse'>): void {
  const file = recordPath(handoff)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(record, undefined, 2))
}

/**
 * Writes what a stylesheet without the atom layer found.
 */
export function writeSheetRecord(handoff: Handoff, sheet: SheetRecord): void {
  const directory = sheetsDirectory(handoff)
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, `${digestOf(sheet.file)}.json`), JSON.stringify(sheet))
}

/**
 * The stylesheets' records that still name a stylesheet that exists.
 */
function readSheetRecords(handoff: Pick<Handoff, 'dir' | 'distDir'>): SheetRecord[] {
  const directory = sheetsDirectory(handoff)
  if (!existsSync(directory)) return []
  const sheets: SheetRecord[] = []
  for (const name of readdirSync(directory)) {
    try {
      const sheet = JSON.parse(readFileSync(path.join(directory, name), 'utf8')) as SheetRecord
      if (!sheet.isOnDisk || existsSync(path.join(handoff.dir, sheet.file))) sheets.push(sheet)
    } catch {
      // A file another run is writing: that run's own record will be read next time.
    }
  }
  return sheets
}

/**
 * The record a plugin run left, with the stylesheets' `@nave` problems and use of the directive
 * folded in, or `undefined` when no run left one.
 */
export function readRecord(handoff: Pick<Handoff, 'dir' | 'distDir'>): PruneRecord | undefined {
  let stored: Omit<PruneRecord, 'readsNoUse'>
  try {
    stored = JSON.parse(readFileSync(recordPath(handoff), 'utf8')) as typeof stored
  } catch {
    return undefined
  }
  const sheets = readSheetRecords(handoff)
  const directiveProblems = sheets
    .flatMap((sheet) => sheet.problems)
    .toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
  return {
    ...stored,
    directiveProblems,
    readsNoUse: stored.readsNoCode && sheets.every((sheet) => !sheet.hasDirective),
  }
}
