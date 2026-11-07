/**
 * Who takes a `cx` that a dependency gives out, judged over the graph the walk read: core's
 * judgement of a package's re-exports of `cx` (the same one the Vite plugin runs) reads this
 * graph through the host below, so a package `keepFor` lists is an error exactly when a module of
 * the project takes one of its `cx` exports by a route the project can change.
 */
import type { LocatedProblem, ModuleHost, ModuleOutcome, TakesContext } from '@navecss/core/collect'

import { judgeReexports } from '@navecss/core/collect'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseSync } from 'oxc-parser'

import type { Graph, GraphOptions } from './graph-types.ts'
import type { PackageInfo } from './packages.ts'
import type { Resolver } from './resolve.ts'

import { languageOf } from './graph-parts.ts'
import { isDependencyPath, relativeTo } from './source-files.ts'

/**
 * The files that import each file the walk read in the build's mode, from the edges it recorded: a
 * file the mode does not bundle takes nothing in the build.
 */
function importersByFile(edges: Graph['inModeEdges']): Map<string, string[]> {
  const importers = new Map<string, string[]>()
  for (const [importer, reached] of edges) {
    for (const file of reached) importers.set(file, [...(importers.get(file) ?? []), importer])
  }
  return importers
}

/**
 * The text of a file, or `null` (what the host contract answers for a module with no text) when
 * it cannot be read.
 */
function textOf(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    // eslint-disable-next-line unicorn/no-null -- the module graph holds `null` for a module with no text
    return null
  }
}

/**
 * The files `source` resolves to from `importer`: those the build's mode finds, else those any
 * condition set finds.
 */
function resolved(
  resolver: Resolver,
  dir: string,
  input: { readonly importer: string | undefined; readonly source: string },
): readonly string[] {
  const found = resolver.resolve(
    input.importer ?? path.join(dir, 'next.config'),
    input.source,
    false,
  )
  return found.filesInMode.length > 0 ? found.filesInMode : found.files
}

/**
 * The module graph the walk read, as core's judgement asks it. An id is a file's absolute path.
 */
function hostOver(graph: Graph, resolver: Resolver, dir: string): ModuleHost {
  const importers = importersByFile(graph.inModeEdges)
  return {
    environment: { name: 'next' },
    getModuleInfo: (id) => ({
      code: textOf(id),
      importers: importers.get(id) ?? [],
      dynamicImporters: [],
    }),
    resolve: (source, importer) => {
      const file = resolved(resolver, dir, { source, importer }).at(0)
      // eslint-disable-next-line unicorn/no-null -- the host answers `null` for a specifier that resolves to nothing
      return Promise.resolve(file === undefined ? null : { id: file })
    },
    // One specifier can resolve to a file per condition set: every file the build's mode bundles.
    resolveAll: (source, importer) =>
      Promise.resolve(resolved(resolver, dir, { source, importer })),
    // The sources are authored: the language follows from the file, as it does for the walk.
    parseModule: (code, id) =>
      parseSync(id, code, {
        lang: languageOf(id),
        sourceType: 'unambiguous',
        preserveParens: false,
      }).program,
  }
}

/**
 * What the judgement needs of the project besides the graph.
 */
function contextFor(options: GraphOptions, packageOf: (file: string) => PackageInfo): TakesContext {
  const { dir, cxModules, keepFor } = options
  return {
    root: dir,
    rootName: 'the directory that holds next.config',
    options: { cxModules, keepFor },
    state: { declared: new Map() },
    packageOf: (id) => Promise.resolve(isDependencyPath(id) ? packageOf(id).name : undefined),
    labelOf: (id) => relativeTo(dir, id),
  }
}

/**
 * What the walk read and how it resolved it.
 */
interface Walked {
  readonly graph: Graph
  readonly options: GraphOptions
  readonly packageOf: (file: string) => PackageInfo
  readonly resolver: Resolver
}

/**
 * The problems the walk stands on: those of each file the build's mode reaches, with the
 * re-exports of `cx` that a listed package gives out judged by who takes them.
 * @param walk What the walk read and how it resolved it.
 * @param outcomes What reading each file found.
 * @returns The problems to report for the files.
 */
export async function judgedProblems(
  walk: Walked,
  outcomes: readonly ModuleOutcome[],
): Promise<LocatedProblem[]> {
  const { graph, options, packageOf, resolver } = walk
  const host = hostOver(graph, resolver, options.dir)
  const judged = await judgeReexports(host, contextFor(options, packageOf), outcomes)
  return judged.problems
}
