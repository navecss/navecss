import type { LocatedProblem } from '@navecss/core/collect'

/**
 * What the plugin leaves under `<project>/<distDir>/cache/` for the build's own check to read:
 * its problems, the atoms it emitted, a digest of everything it read and of the options.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { Handoff } from './handoff.ts'

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
   * Whether the emitted set is the `keepFor` lists alone: nothing was read, so the build reads
   * no use of an atom.
   */
  readonly readsNoUse: boolean
}

/**
 * Where the record of a project lives, under its `distDir`'s `cache` directory.
 */
export function recordPath(handoff: Pick<Handoff, 'dir' | 'distDir'>): string {
  return path.join(handoff.dir, handoff.distDir, 'cache', 'navecss-prune.json')
}

/**
 * Writes the record, creating the cache directory.
 */
export function writeRecord(handoff: Handoff, record: PruneRecord): void {
  const file = recordPath(handoff)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(record, undefined, 2))
}

/**
 * The record a plugin run left, or `undefined` when none did.
 */
export function readRecord(handoff: Pick<Handoff, 'dir' | 'distDir'>): PruneRecord | undefined {
  try {
    return JSON.parse(readFileSync(recordPath(handoff), 'utf8')) as PruneRecord
  } catch {
    return undefined
  }
}
