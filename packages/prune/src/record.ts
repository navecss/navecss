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
   * The id of the Next.js server process that wrote the record, absent when Next.js set none. The
   * development server prints only a record that carries its own.
   */
  readonly serverId?: string
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
   * The `@nave` lines that are not problems: an unknown atom under `onUnknown: 'warn'` and every
   * order warning, in path order. The hook prints them as warnings; they are never counted.
   */
  readonly directiveWarnings: readonly DirectiveProblem[]
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
   * Digest of the entries of each directory that a specifier could have matched in, named like the
   * specifier's path with a trailing `*`, keyed by a relative path: `components/card*` is the
   * entries of `components/` called `card` or `card.` and an extension. Creating a file beside
   * the one a specifier resolved to changes one.
   */
  readonly listings: Readonly<Record<string, string>>
  /**
   * Where each package the graph entered through `node_modules` was looked for, by the path of the
   * link (or directory) relative to the project, and the real path it led to, or an empty text
   * where nothing was. A link re-pointed at another version changes one.
   */
  readonly links: Readonly<Record<string, string>>
  /**
   * Every `.md` and `.mdx` file the graph met, sorted.
   */
  readonly markdown: readonly string[]
  /**
   * The packages under `node_modules` that call `cx.dynamic()` in a file a `pages/` entry
   * reaches, sorted: Pages Router server code sees `cx.dynamic()`'s map only for a package the
   * build bundles.
   */
  readonly pagesDynamicPackages: readonly string[]
  /**
   * The stylesheets the build can still hold, relative like `files`, sorted: the ones the code
   * imports and every one an `@import` or a `composes ... from` reaches from those. When the list
   * is complete, a stylesheet's own record counts only while its stylesheet is listed here.
   * Absent when the run stopped before reading the code.
   */
  readonly stylesheets?: readonly string[]
  /**
   * Whether `stylesheets` names every stylesheet the build can hold: the run met no Markdown or
   * MDX file and read every stylesheet it met as CSS. When it is not, or the run stopped before
   * reading the code, every stylesheet record that names a file on disk counts.
   */
  readonly isStylesheetListComplete?: boolean
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
  /**
   * What stopped the plugin before it finished, one sentence each, from the run over the atom
   * layer and from every stylesheet: a record holding one is incomplete.
   */
  readonly failures: readonly string[]
}

/**
 * What a run over the atom layer stores: the record without what is read from the stylesheets'
 * own records when it is read back.
 */
export type StoredRecord = Omit<PruneRecord, 'directiveWarnings' | 'readsNoUse'>

/**
 * What a stylesheet without the atom layer leaves: its `@nave` problems and warnings, and whether
 * it used the directive at all. One file each, so stylesheets processed at the same time never write the same
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
  /**
   * The `@nave` lines in it that are not problems.
   */
  readonly warnings: readonly DirectiveProblem[]
  /**
   * What stopped the plugin before it finished with this stylesheet.
   */
  readonly failures: readonly string[]
}

/**
 * A record as read from disk: one written before `failures` existed has none.
 */
type Stored<Shape extends { readonly failures: readonly string[] }> = Omit<Shape, 'failures'> & {
  readonly failures?: readonly string[]
}

/**
 * A stylesheet's record as read from disk: one written before `warnings` existed has none.
 */
type StoredSheet = Omit<Stored<SheetRecord>, 'warnings'> & {
  readonly warnings?: readonly DirectiveProblem[]
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
export function writeRecord(handoff: Handoff, record: StoredRecord): void {
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
 * Whether a stylesheet's record still counts: its stylesheet, if it was a file on disk, still is
 * one, and the build can still hold it. A record of a stylesheet that was never a file on disk has
 * nothing to be checked against, and counts.
 */
function isStillCounted(
  handoff: Pick<Handoff, 'dir'>,
  sheet: SheetRecord,
  stylesheets: ReadonlySet<string> | undefined,
): boolean {
  if (!sheet.isOnDisk) return true
  if (!existsSync(path.join(handoff.dir, sheet.file))) return false
  return stylesheets === undefined || stylesheets.has(sheet.file)
}

/**
 * The stylesheets' records that still count, given the stylesheets the build can hold (every one
 * that is on disk, when that is not known).
 */
function readSheetRecords(
  handoff: Pick<Handoff, 'dir' | 'distDir'>,
  stylesheets: ReadonlySet<string> | undefined,
): SheetRecord[] {
  const directory = sheetsDirectory(handoff)
  if (!existsSync(directory)) return []
  const sheets: SheetRecord[] = []
  for (const name of readdirSync(directory)) {
    try {
      const stored = JSON.parse(readFileSync(path.join(directory, name), 'utf8')) as StoredSheet
      // A record written before `failures` or `warnings` existed has none.
      const sheet = { ...stored, failures: stored.failures ?? [], warnings: stored.warnings ?? [] }
      if (isStillCounted(handoff, sheet, stylesheets)) sheets.push(sheet)
    } catch {
      // A file another run is writing: that run's own record will be read next time.
    }
  }
  return sheets
}

/**
 * Orders by file, then line, then column.
 */
function byPlace(a: DirectiveProblem, b: DirectiveProblem): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column
}

/**
 * The record a plugin run left, with the stylesheets' `@nave` problems and use of the directive
 * folded in, or `undefined` when no run left one.
 */
export function readRecord(handoff: Pick<Handoff, 'dir' | 'distDir'>): PruneRecord | undefined {
  let stored: Omit<Stored<StoredRecord>, 'links' | 'listings' | 'pagesDynamicPackages'> & {
    readonly links?: Readonly<Record<string, string>>
    readonly listings?: Readonly<Record<string, string>>
    readonly pagesDynamicPackages?: readonly string[]
  }
  try {
    stored = JSON.parse(readFileSync(recordPath(handoff), 'utf8')) as typeof stored
  } catch {
    return undefined
  }
  const listed =
    stored.isStylesheetListComplete === true && stored.stylesheets !== undefined
      ? new Set(stored.stylesheets)
      : undefined
  const sheets = readSheetRecords(handoff, listed)
  return {
    ...stored,
    directiveProblems: sheets.flatMap((sheet) => sheet.problems).toSorted(byPlace),
    directiveWarnings: sheets.flatMap((sheet) => sheet.warnings).toSorted(byPlace),
    links: stored.links ?? {},
    listings: stored.listings ?? {},
    pagesDynamicPackages: stored.pagesDynamicPackages ?? [],
    readsNoUse: stored.readsNoCode && sheets.every((sheet) => !sheet.hasDirective),
    failures: [...(stored.failures ?? []), ...sheets.flatMap((sheet) => sheet.failures)],
  }
}
