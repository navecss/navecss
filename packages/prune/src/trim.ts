/**
 * Trimming the atom layer of the stylesheet that holds it: the graph is read, the record written,
 * and only then is the layer replaced with the atoms the code uses. A run that cannot finish
 * leaves the layer whole, says so, tells the bundler what it read before it stopped, and writes
 * the failure where the build's own check reads it.
 */
import type { LocatedProblem } from '@navecss/core/collect'
import type { Message, Result, Root } from 'postcss'

import { inspectAtomicLayer, pruneAtomicLayer } from '@navecss/core/collect'
import path from 'node:path'
import postcss from 'postcss'

import type { ExtendMap } from './extend.ts'
import type { Graph } from './graph-types.ts'
import type { Handoff } from './handoff.ts'
import type { DirectiveProblem, StoredRecord } from './record.ts'
import type { Mode } from './resolve.ts'

import { digestOf } from './digest.ts'
import { filesRead } from './files-read.ts'
import { emptyGraph } from './graph-parts.ts'
import { readGraph } from './graph.ts'
import { recordedInputs, stemDirectories } from './input-records.ts'
import { dependencyMessages } from './messages.ts'
import { serverIdOfRun } from './phase.ts'
import { printEachRun } from './print.ts'
import { writeRecord } from './record.ts'
import { declarationRoot } from './root.ts'
import { relativeTo } from './source-files.ts'
import { readStylesheets } from './stylesheets.ts'
import { LISTED_NAME } from './texts.ts'
import { emittedAtoms } from './used.ts'

const CORE_PLUGIN = 'postcss-nave'

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
    `The PostCSS entry for ${LISTED_NAME} takes no options, but it was given ${keys.join(', ')}. Set options in withNave() in next.config instead.`,
  ]
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
  | 'atoms'
  | 'directories'
  | 'failures'
  | 'files'
  | 'links'
  | 'listings'
  | 'markdown'
  | 'pagesDynamicPackages'
  | 'problems'
  | 'readsNoCode'
> {
  const serverId = serverIdOfRun()
  return {
    version: 1,
    ...(serverId !== undefined && { serverId }),
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
    ...recordedInputs(dir, graph.inputs),
    markdown: [...graph.markdown]
      .map((file) => relativeTo(dir, file))
      .toSorted((a, b) => a.localeCompare(b)),
    pagesDynamicPackages: [...graph.pagesDynamicPackages].toSorted((a, b) => a.localeCompare(b)),
    stylesheets: [...graph.stylesheets]
      .map((file) => relativeTo(dir, file))
      .toSorted((a, b) => a.localeCompare(b)),
    // A Markdown or MDX file can import a stylesheet the graph never reads, as can a stylesheet
    // that was not read as CSS: the list then may miss one that is in the build.
    isStylesheetListComplete: graph.markdown.size === 0 && graph.unreadStylesheets.size === 0,
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
    listings: {},
    links: {},
    markdown: [],
    pagesDynamicPackages: [],
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
 * The modes whose files count for problems. The mode comes from the phase Next.js calls a
 * function config with, which `withNave()` puts in the hand-off: the development server reads the
 * `development` condition, every other phase the `production` one. An object config is given no
 * phase, and `NODE_ENV` does not settle the question (`next build` keeps a `NODE_ENV` the user
 * set, and `--debug-prerender` sets it to `development`), so `development` there counts both
 * modes, and anything else production.
 */
function modesOfRun(handoff: Handoff): readonly Mode[] {
  if (handoff.phase !== undefined) {
    return [handoff.phase === 'phase-development-server' ? 'development' : 'production']
  }
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by Next.js in the process that runs the plugin, not a build input
  return process.env.NODE_ENV === 'development' ? ['development', 'production'] : ['production']
}

/**
 * The messages that declare to the bundler what the run read: the files, with the config files,
 * and the directories files were selected from.
 */
function declarations(run: LayerRun, files: Map<string, string>, graph: Graph): Message[] {
  return dependencyMessages({
    root: declarationRoot(run.handoff),
    parent: run.result.opts.from,
    files: files.keys(),
    directories: [...graph.directories, ...stemDirectories(graph.inputs)],
  })
}

/**
 * Reads the graph into `graph`, writes the record, then trims the layer and declares what was
 * read.
 */
function trim(run: LayerRun, graph: Graph): void {
  const { handoff, root, result } = run
  const { options, dir } = handoff
  const keep = options.keep ?? []
  const keepFor = options.keepFor ?? {}
  readGraph(
    {
      dir,
      keep,
      keepFor,
      cxModules: options.cxModules ?? [],
      ownAtoms: new Set(Object.keys(run.extend ?? {})),
      modes: modesOfRun(handoff),
    },
    graph,
  )
  const from = result.opts.from
  readStylesheets(graph, dir, from === undefined ? undefined : path.resolve(from))
  const atoms = emittedAtoms(graph, { keep, keepFor })
  const files = filesRead(handoff, graph)
  const messages = declarations(run, files, graph)
  const trimmed = pruneAtomicLayer(root.toString(), new Set(atoms))
  // The record goes first: the layer is trimmed only once the build's check can read the run.
  writeRecord(handoff, recordOfRun(run, graph, files, atoms))
  replaceContent(root, trimmed, result.opts.from)
  result.messages.push(...messages)
}

/**
 * Says the layer ships whole and why, declares what the run read before it stopped, so the
 * bundler runs it again once that changes, and records the failure when the record can be
 * written.
 */
function stopWithoutTrimming(run: LayerRun, reason: string, graph: Graph): void {
  const failure = `${LISTED_NAME} stopped without trimming: ${reason}`
  printEachRun(`Nave: ${failure}`)
  run.result.messages.push(...declarations(run, filesRead(run.handoff, graph), graph))
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
  const graph = emptyGraph()
  if (run.blocked !== undefined) {
    stopWithoutTrimming(run, run.blocked, graph)
    return
  }
  try {
    trim(run, graph)
  } catch (error) {
    stopWithoutTrimming(run, String(error), graph)
  }
}
