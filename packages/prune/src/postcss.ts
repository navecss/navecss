/**
 * The Nave PostCSS plugin for Next.js. It expands `@nave` in every stylesheet. In the stylesheet
 * that holds Nave's `@layer atomic` block (core's own `atomic.css`) it reads the import graph from
 * Next.js's entries, keeps the atoms the code uses, and tells the bundler every file and directory
 * it read. It never throws: a problem in the code it reads goes into the record under
 * `<distDir>/cache` for the build's own check to report.
 */
import type { LocatedProblem } from '@navecss/core/collect'
import type { Plugin, Result, Root } from 'postcss'

import { inspectAtomicLayer, pruneAtomicLayer } from '@navecss/core/collect'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'

import type { Graph } from './graph.ts'
import type { Handoff } from './handoff.ts'
import type { NaveOptions } from './options.ts'
import type { DirectiveProblem, PruneRecord } from './record.ts'

import { configFilesIn } from './config-files.ts'
import { digestOf } from './digest.ts'
import { expandDirectives } from './directive.ts'
import { readGraph } from './graph.ts'
import { readHandoff } from './handoff.ts'
import { dependencyMessages } from './messages.ts'
import { printOnce } from './print.ts'
import { writeRecord, writeSheetRecord } from './record.ts'
import { relativeTo } from './source-files.ts'
import { emittedAtoms } from './used.ts'

const PLUGIN = 'postcss-nave-prune'
const CORE_PLUGIN = 'postcss-nave'

/**
 * The names of the consumer's own atoms: the keys of `extend`, read from the module when it is a
 * path.
 */
async function ownAtomsOf(options: NaveOptions, dir: string): Promise<Set<string>> {
  const { extend } = options
  if (typeof extend === 'object') return new Set(Object.keys(extend))
  if (typeof extend !== 'string') return new Set()
  try {
    const file = pathToFileURL(new URL(extend, pathToFileURL(`${dir}/`)).pathname).href
    const loaded = (await import(file)) as { default?: Record<string, unknown> }
    return new Set(Object.keys(loaded.default ?? {}))
  } catch {
    return new Set()
  }
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
 * Whether core's own PostCSS plugin runs in the same pipeline.
 */
function hasCorePlugin(result: Result): boolean {
  return result.processor.plugins.some((plugin) => {
    return 'postcssPlugin' in plugin && plugin.postcssPlugin === CORE_PLUGIN
  })
}

/**
 * The stylesheet's path relative to the directory holding `next.config`.
 */
function sheetPath(handoff: Handoff, result: Result): string {
  const from = result.opts.from
  return from === undefined ? '<stylesheet>' : relativeTo(handoff.dir, from)
}

/**
 * Expands `@nave` and returns what the stylesheet found: problems to record under `'error'`,
 * printed lines under `'warn'`.
 */
async function expand(
  root: Root,
  result: Result,
  handoff: Handoff,
): Promise<{ hasDirective: boolean; problems: DirectiveProblem[] }> {
  const { options } = handoff
  const expansion = await expandDirectives(root, {
    dir: handoff.dir,
    from: result.opts.from,
    options,
  })
  const file = sheetPath(handoff, result)
  const problems: DirectiveProblem[] = []
  for (const finding of expansion.findings) {
    if (options.onUnknown === 'warn') {
      printOnce(
        `directive:${file}:${finding.line}:${finding.column}:${finding.text}`,
        `${file}:${finding.line}:${finding.column}: ${finding.text}`,
      )
    } else problems.push({ file, ...finding })
  }
  return { hasDirective: expansion.hasDirective, problems }
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
 * The files the plugin read: the graph's and the config files.
 */
function filesRead(handoff: Handoff, graphFiles: Map<string, string>): Map<string, string> {
  const files = new Map(graphFiles)
  for (const file of configFilesIn(handoff.dir)) files.set(file, digestFileSafely(file))
  return files
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
 * Orders problems by file, then line, then column.
 */
function byPlace(a: LocatedProblem, b: LocatedProblem): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column
}

/**
 * The record of one run over the atom layer.
 */
function recordOfRun(input: {
  readonly atoms: readonly string[]
  readonly entryOptions: object
  readonly files: Map<string, string>
  readonly graph: Graph
  readonly handoff: Handoff
  readonly result: Result
}): Omit<PruneRecord, 'readsNoUse'> {
  const { handoff, graph, files, atoms, result, entryOptions } = input
  const { options, dir } = handoff
  return {
    version: 1,
    optionsDigest: digestOf(JSON.stringify(options)),
    atoms,
    problems: graph.problems.toSorted(byPlace),
    directiveProblems: [],
    entryProblems: entryProblemsOf(entryOptions),
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
    hasCorePlugin: hasCorePlugin(result),
    readsNoCode: graph.atoms.size === 0 && (options.keep ?? []).length === 0,
  }
}

/**
 * Trims the atom layer of the stylesheet to what the code uses and records the run.
 */
async function trimAtomicLayer(
  root: Root,
  result: Result,
  handoff: Handoff,
  entryOptions: object,
): Promise<void> {
  const { options, dir } = handoff
  const keep = options.keep ?? []
  const keepFor = options.keepFor ?? {}
  const graph = readGraph({
    dir,
    keep,
    keepFor,
    cxModules: options.cxModules ?? [],
    ownAtoms: await ownAtomsOf(options, dir),
  })
  const atoms = emittedAtoms(graph, { keep, keepFor })
  replaceContent(root, pruneAtomicLayer(root.toString(), new Set(atoms)), result.opts.from)
  const files = filesRead(handoff, graph.files)
  result.messages.push(
    ...dependencyMessages({
      root: handoff.root,
      parent: result.opts.from,
      files: files.keys(),
      directories: graph.directories,
    }),
  )
  writeRecord(handoff, recordOfRun({ handoff, graph, files, atoms, result, entryOptions }))
}

/**
 * Says, once, that the plugin is listed and the wrapper is not.
 */
function sayWrapperIsMissing(): void {
  printOnce(
    'no-wrapper',
    'Nave: @navecss/prune/postcss is in the PostCSS config but withNave() is not wrapped around next.config, so every atom ships. Wrap next.config in withNave() from @navecss/prune to ship only the atoms the build reads.',
  )
}

/**
 * Says, once, that both Nave plugins are listed.
 */
function sayBothPluginsAreListed(): void {
  printOnce(
    'both-plugins',
    'Nave: both @navecss/prune/postcss and @navecss/core/postcss are in the PostCSS config. Remove @navecss/core/postcss: @navecss/prune/postcss expands @nave as well.',
  )
}

/**
 * One stylesheet through the plugin.
 */
async function run(root: Root, result: Result, entryOptions: object): Promise<void> {
  const handoff = readHandoff()
  if (!handoff) {
    sayWrapperIsMissing()
    await expandDirectives(root, {
      dir: process.cwd(),
      from: result.opts.from,
      options: { onUnknown: 'warn' },
    })
    return
  }
  const isCore = hasCorePlugin(result)
  if (isCore) sayBothPluginsAreListed()
  const expansion = await expand(root, result, handoff)
  if (!inspectAtomicLayer(root.toString()).hasLayer) {
    writeSheetRecord(handoff, {
      file: sheetPath(handoff, result),
      isOnDisk: result.opts.from !== undefined && existsSync(result.opts.from),
      hasDirective: expansion.hasDirective,
      problems: expansion.problems,
    })
    return
  }
  await trimAtomicLayer(root, result, handoff, entryOptions)
}

/**
 * The Nave PostCSS plugin for Next.js. List it with `{}` in the PostCSS config; every option
 * belongs to `withNave()`.
 * @param entryOptions What the PostCSS entry was given: nothing.
 * @returns The PostCSS plugin.
 */
export function prunePlugin(entryOptions: object = {}): Plugin {
  return {
    postcssPlugin: PLUGIN,
    async Once(root, { result }) {
      try {
        await run(root, result, entryOptions)
      } catch (error) {
        printOnce(
          `failed:${String(error)}`,
          `Nave: ${PLUGIN} stopped without trimming: ${String(error)}`,
        )
      }
    },
  }
}
prunePlugin.postcss = true

export default prunePlugin
