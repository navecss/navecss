/**
 * What the walk of the import graph holds, and the steps of it that stand alone: queueing a file,
 * and the tests of an import against the packages and the modules `cxModules` lists.
 */
import type { AstNode, ModuleOutcome } from '@navecss/core/collect'

import { isImportedCxHandedOut } from '@navecss/core/collect'

import type { Edge } from './edges.ts'
import type { FileFacts, Graph, GraphOptions } from './graph-types.ts'
import type { PackageInfo } from './packages.ts'
import type { Resolution, Resolver } from './resolve.ts'

import { isCoreFile } from './core-edges.ts'
import { unboundCxProblem } from './graph-parts.ts'
import { isDependencyPath, isMarkdownFile, isSourceFile, isStylesheetFile } from './source-files.ts'

/**
 * A file to read, and whether the build's own mode reaches it, so its problems count.
 */
export interface Queued {
  readonly file: string
  readonly isInMode: boolean
}

export interface Walk {
  readonly options: GraphOptions
  readonly resolver: Resolver
  readonly packageOf: (file: string) => PackageInfo
  readonly isCxFile: (file: string) => boolean
  readonly declaredFiles: ReadonlySet<string>
  readonly declaredEntries: ReadonlySet<string>
  readonly queue: Queued[]
  /**
   * What reading each file the build's mode reaches found.
   */
  readonly outcomes: ModuleOutcome[]
  /**
   * Every file met, and whether the build's mode reached it.
   */
  readonly seen: Map<string, boolean>
  readonly graph: Graph
}

/**
 * Queues a file the graph has not met, or met only outside the build's mode and now meets in it:
 * that file is read again, so its problems count.
 */
export function enqueue(walk: Walk, file: string, isInMode: boolean): void {
  const met = walk.seen.get(file)
  if (met === true || (met === false && !isInMode)) return
  walk.seen.set(file, isInMode)
  if (isMarkdownFile(file)) walk.graph.markdown.add(file)
  else if (isSourceFile(file)) walk.queue.push({ file, isInMode })
  else if (isStylesheetFile(file)) walk.graph.stylesheets.add(file)
}

/**
 * Whether an unresolved import in this file is a problem: always in application code, and in a
 * package only when the package is one that can reach `cx`.
 */
export function isCheckedImport(walk: Walk, file: string): boolean {
  return !isDependencyPath(file) || walk.packageOf(file).isNaveAware
}

/**
 * Whether the specifier, written in the file, names a module `cxModules` lists.
 */
export function isNamingDeclared(walk: Walk, edge: Edge, files: readonly string[]): boolean {
  // A `#` specifier means the file the importer's own scope maps it to, so only that file counts.
  if (!edge.specifier.startsWith('#') && walk.declaredEntries.has(edge.specifier)) return true
  return files.some((resolved) => walk.declaredFiles.has(resolved))
}

/**
 * Records that `importer` imports `file` in `edges`.
 */
function recordEdge(edges: Map<string, Set<string>>, importer: string, file: string): void {
  const reached = edges.get(importer) ?? new Set<string>()
  reached.add(file)
  edges.set(importer, reached)
}

/**
 * Queues the files an edge resolves to, but core's own: in the build's mode when the importer is
 * and a set of that mode found the file.
 */
export function enqueueResolved(walk: Walk, facts: FileFacts, resolution: Resolution): void {
  for (const resolved of resolution.files) {
    const isInMode = facts.isInMode && resolution.filesInMode.includes(resolved)
    if (isCoreFile(walk.packageOf, resolved)) continue
    enqueue(walk, resolved, isInMode)
    recordEdge(walk.graph.edges, facts.file, resolved)
    if (isInMode) recordEdge(walk.graph.inModeEdges, facts.file, resolved)
  }
}

/**
 * Whether the file is in a package `keepFor` stands in for, whose problems are judged by who takes
 * the `cx` it gives out rather than recorded.
 */
export function isStoodInFor(walk: Walk, facts: FileFacts): boolean {
  return facts.pkg !== undefined && Object.hasOwn(walk.options.keepFor, facts.pkg)
}

/**
 * Records an import of core's `cx` the reader does not bind. In a package that `keepFor` stands in
 * for, the calls made through it are the package's own, so it is recorded only when the package
 * hands it out, which no listing clears: the judgement then holds it as an error.
 */
export function recordUnboundCx(
  walk: Walk,
  facts: FileFacts,
  found: { readonly edge: Edge; readonly program: AstNode },
): void {
  const { edge, program } = found
  const isStoodIn = isStoodInFor(walk, facts)
  if (isStoodIn && !isImportedCxHandedOut(program, edge.offset)) return
  const into = isStoodIn ? facts.suppressed : facts.problems
  into.push({
    file: facts.rel,
    pkg: facts.pkg,
    ...unboundCxProblem(facts.code, edge, facts.place(edge.offset)),
    ...(isStoodIn && { moduleId: facts.file, isUnboundHandOut: true }),
  })
}
