/**
 * Trimming the atom layer of the stylesheet that holds it: the graph is read, the record written,
 * and only then is the layer replaced with the atoms the code uses. A run that cannot finish
 * leaves the layer whole, says so, and writes the failure where the build's own check reads it.
 */
import type { LocatedProblem } from '@navecss/core/collect'
import type { Message, Result, Root } from 'postcss'

import { inspectAtomicLayer, pruneAtomicLayer } from '@navecss/core/collect'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

import type { ExtendMap } from './extend.ts'
import type { Graph } from './graph-types.ts'
import type { Handoff } from './handoff.ts'
import type { DirectiveProblem, PruneRecord } from './record.ts'
import type { Mode } from './resolve.ts'

import { configFilesIn } from './config-files.ts'
import { digestOf } from './digest.ts'
import { readGraph } from './graph.ts'
import { dependencyMessages } from './messages.ts'
import { printEachRun } from './print.ts'
import { writeRecord } from './record.ts'
import { relativeTo } from './source-files.ts'
import { emittedAtoms } from './used.ts'

const PLUGIN = 'postcss-nave-prune'
const CORE_PLUGIN = 'postcss-nave'

type StoredRecord = Omit<PruneRecord, 'readsNoUse'>

/**
 * One run over the stylesheet that holds the atom layer.
 */
export interface LayerRun {
  readonly root: Root
  readonly result: Result
  readonly handoff: Handoff
  readonly entryOptions: object
  /**
   * The consumer's own atoms, read once for the run.
   */
  readonly extend: ExtendMap | undefined
  /**
   * The `@nave` problems of this stylesheet, recorded under `'error'`.
   */
  readonly directiveProblems: readonly DirectiveProblem[]
  /**
   * Why the layer cannot be trimmed, found before trimming started.
   */
  readonly blocked: string | undefined
}

/**
 * Whether core's own PostCSS plugin runs in the same pipeline.
 */
export function hasCorePlugin(result: Result): boolean {
  return result.processor.plugins.some((plugin) => {
    return 'postcssPlugin' in plugin && plugin.postcssPlugin === CORE_PLUGIN
  })
}

/**
 * The problems a PostCSS entry's own options are: any option belongs to `withNave()`.
 */
function entryProblemsOf(entryOptions: object): string[] {
  const keys = Object.keys(entryOptions)
  if (keys.length === 0) return []
  return [
    `The PostCSS entry for ${PLUGIN} takes no options, but it was given ${keys.join(', ')}. Set options in withNave() in next.config instead.`,
  ]
}

/**
 * The digest of a file's text, or of nothing when it cannot be read.
 */
function digestFileSafely(file: string): string {
  try {
    return digestOf(readFileSync(file))
  } catch {
    return digestOf('')
  }
}

/**
 * The files the plugin read: the graph's and the config files.
 */
function filesRead(handoff: Handoff, graphFiles: Map<string, string>): Map<string, string> {
  const files = new Map(graphFiles)
  for (const file of configFilesIn(handoff.dir)) files.set(file, digestFileSafely(file))
  return files
}

/**
 * Orders problems by file, then line, then column.
 */
function byPlace(a: LocatedProblem, b: LocatedProblem): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column
}

/**
 * The fields every record of a run holds, finished or not.
 */
function runFields(
  run: LayerRun,
): Omit<
  StoredRecord,
  'atoms' | 'directories' | 'failures' | 'files' | 'markdown' | 'problems' | 'readsNoCode'
> {
  return {
    version: 1,
    optionsDigest: digestOf(JSON.stringify(run.handoff.options)),
    directiveProblems: run.directiveProblems,
    entryProblems: entryProblemsOf(run.entryOptions),
    hasCorePlugin: hasCorePlugin(run.result),
  }
}

/**
 * The record of a run that read the graph.
 */
function recordOfRun(
  run: LayerRun,
  graph: Graph,
  files: Map<string, string>,
  atoms: readonly string[],
): StoredRecord {
  const { options, dir } = run.handoff
  return {
    ...runFields(run),
    atoms,
    problems: graph.problems.toSorted(byPlace),
    files: Object.fromEntries(
      [...files]
        .map(([file, digest]): [string, string] => [relativeTo(dir, file), digest])
        .toSorted(([a], [b]) => a.localeCompare(b)),
    ),
    directories: Object.fromEntries(
      graph.directories.map((directory) => [
        `${relativeTo(dir, directory.path) || '.'}/`,
        digestOf(directory.names.join('\n')),
      ]),
    ),
    markdown: [...graph.markdown]
      .map((file) => relativeTo(dir, file))
      .toSorted((a, b) => a.localeCompare(b)),
    readsNoCode: graph.atoms.size === 0 && (options.keep ?? []).length === 0,
    failures: [],
  }
}

/**
 * The record of a run that stopped before trimming: the layer ships whole, with every atom it
 * holds.
 */
function recordOfStoppedRun(run: LayerRun, failure: string): StoredRecord {
  const { atoms } = inspectAtomicLayer(run.root.toString())
  return {
    ...runFields(run),
    atoms: [...atoms].toSorted((a, b) => a.localeCompare(b)),
    problems: [],
    files: {},
    directories: {},
    markdown: [],
    readsNoCode: false,
    failures: [failure],
  }
}

/**
 * Replaces the stylesheet's content with `css`.
 */
function replaceContent(root: Root, css: string, from: string | undefined): void {
  const parsed = postcss.parse(css, { from })
  root.removeAll()
  root.append(parsed.nodes)
}

/**
 * The mode of the build running the plugin: Next.js sets `NODE_ENV` to `development` under
 * `next dev` and to `production` under `next build`.
 */
function modeOfRun(): Mode {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by Next.js in the process that runs the plugin, not a build input
  return process.env.NODE_ENV === 'development' ? 'development' : 'production'
}

/**
 * Reads the graph, writes the record, then trims the layer and declares what was read.
 */
function trim(run: LayerRun): void {
  const { handoff, root, result } = run
  const { options, dir } = handoff
  const keep = options.keep ?? []
  const keepFor = options.keepFor ?? {}
  const graph = readGraph({
    dir,
    keep,
    keepFor,
    cxModules: options.cxModules ?? [],
    ownAtoms: new Set(Object.keys(run.extend ?? {})),
    mode: modeOfRun(),
  })
  const atoms = emittedAtoms(graph, { keep, keepFor })
  const files = filesRead(handoff, graph.files)
  const messages: Message[] = dependencyMessages({
    root: handoff.root,
    parent: result.opts.from,
    files: files.keys(),
    directories: graph.directories,
  })
  const trimmed = pruneAtomicLayer(root.toString(), new Set(atoms))
  // The record goes first: the layer is trimmed only once the build's check can read the run.
  writeRecord(handoff, recordOfRun(run, graph, files, atoms))
  replaceContent(root, trimmed, result.opts.from)
  result.messages.push(...messages)
}

/**
 * Says the layer ships whole and why, and records the failure when the record can be written.
 */
function stopWithoutTrimming(run: LayerRun, reason: string): void {
  const failure = `${PLUGIN} stopped without trimming: ${reason}`
  printEachRun(`Nave: ${failure}`)
  try {
    writeRecord(run.handoff, recordOfStoppedRun(run, failure))
  } catch {
    // The record cannot be written either: the line printed above is all this run can leave.
  }
}

/**
 * Trims the atom layer of the stylesheet to what the code uses and records the run; when the run
 * cannot finish, the layer is left whole and the failure is recorded.
 */
export function trimAtomicLayer(run: LayerRun): void {
  if (run.blocked !== undefined) {
    stopWithoutTrimming(run, run.blocked)
    return
  }
  try {
    trim(run)
  } catch (error) {
    stopWithoutTrimming(run, String(error))
  }
}
