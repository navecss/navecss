/**
 * The import graph from Next.js's entries: every file reached is parsed, read for the atoms it
 * names and the calls it cannot read, and followed to the files it imports. Nothing here throws
 * for a problem in the code it reads; each becomes a problem in the result.
 */
import type { ModuleReading } from '@navecss/core/collect'

import { CX_SOURCE, readModule } from '@navecss/core/collect'
import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { parseSync } from 'oxc-parser'

import type { Edge } from './edges.ts'
import type { FileFacts, Graph, GraphOptions } from './graph-types.ts'
import type { PackageInfo } from './packages.ts'
import type { Resolution, Resolver } from './resolve.ts'

import {
  CORE_PACKAGE,
  createCxFileTest,
  declaredModules,
  isCoreFile,
  isUnboundCxEdge,
} from './core-edges.ts'
import { digestOf } from './digest.ts'
import { edgesOf } from './edges.ts'
import { findEntries } from './entries.ts'
import {
  emptyGraph,
  isFatalParseError,
  languageOf,
  listedAtomsFor,
  unboundCxProblem,
  unreadProblem,
  unresolvedProblem,
} from './graph-parts.ts'
import { placerFor } from './lines.ts'
import { createPackageReader, packageNameOfSpecifier } from './packages.ts'
import { addPagesDynamicPackages } from './pages-reach.ts'
import { createResolver } from './resolve.ts'
import {
  isDependencyPath,
  isMarkdownFile,
  isSourceFile,
  isStylesheetFile,
  relativeTo,
} from './source-files.ts'

/**
 * A file to read, and whether the build's own mode reaches it, so its problems count.
 */
interface Queued {
  readonly file: string
  readonly isInMode: boolean
}

interface Walk {
  readonly options: GraphOptions
  readonly resolver: Resolver
  readonly packageOf: (file: string) => PackageInfo
  readonly isCxFile: (file: string) => boolean
  readonly declaredFiles: ReadonlySet<string>
  readonly declaredEntries: ReadonlySet<string>
  readonly queue: Queued[]
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
function enqueue(walk: Walk, file: string, isInMode: boolean): void {
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
function isCheckedImport(walk: Walk, file: string): boolean {
  return !isDependencyPath(file) || walk.packageOf(file).isNaveAware
}

/**
 * Whether the specifier, written in the file, names a module `cxModules` lists.
 */
function isNamingDeclared(walk: Walk, edge: Edge, files: readonly string[]): boolean {
  // A `#` specifier means the file the importer's own scope maps it to, so only that file counts.
  if (!edge.specifier.startsWith('#') && walk.declaredEntries.has(edge.specifier)) return true
  return files.some((resolved) => walk.declaredFiles.has(resolved))
}

/**
 * Queues the files an edge resolves to, but core's own: in the build's mode when the importer is
 * and a set of that mode found the file.
 */
function enqueueResolved(walk: Walk, facts: FileFacts, resolution: Resolution): void {
  for (const resolved of resolution.files) {
    const isInMode = facts.isInMode && resolution.filesInMode.includes(resolved)
    if (isCoreFile(walk.packageOf, resolved)) continue
    enqueue(walk, resolved, isInMode)
    const reached = walk.graph.edges.get(facts.file) ?? new Set<string>()
    reached.add(resolved)
    walk.graph.edges.set(facts.file, reached)
  }
}

/**
 * Resolves each edge of a file: queues what it reaches, records the unresolved ones that are
 * problems, and returns the specifiers that name a listed module.
 */
function followEdges(walk: Walk, facts: FileFacts, edges: readonly Edge[]): Set<string> {
  const declared = new Set<string>()
  for (const edge of edges) {
    const resolution = walk.resolver.resolve(facts.file, edge.specifier, edge.isRequire)
    if (resolution.isBuiltin || isBuiltin(edge.specifier)) continue
    if (isUnboundCxEdge(walk, facts.file, edge, resolution.files)) {
      recordUnboundCx(walk, facts, edge)
      continue
    }
    enqueueResolved(walk, facts, resolution)
    if (isNamingDeclared(walk, edge, resolution.files)) declared.add(edge.specifier)
    if (
      resolution.files.length === 0 &&
      !resolution.isConfigCause &&
      isCheckedImport(walk, facts.file)
    ) {
      const found = unresolvedProblem(facts.code, edge, facts.place(edge.offset))
      facts.problems.push({
        kind: 'unreadable',
        offset: edge.offset,
        file: facts.rel,
        pkg: facts.pkg,
        ...found,
      })
    }
  }
  return declared
}

/**
 * Whether the file is in a package `keepFor` stands in for, whose problems are not recorded.
 */
function isStoodInFor(walk: Walk, facts: FileFacts): boolean {
  return facts.pkg !== undefined && Object.hasOwn(walk.options.keepFor, facts.pkg)
}

/**
 * Records an import of core's `cx` the reader does not bind.
 */
function recordUnboundCx(walk: Walk, facts: FileFacts, edge: Edge): void {
  if (isStoodInFor(walk, facts)) return
  facts.problems.push({
    file: facts.rel,
    pkg: facts.pkg,
    ...unboundCxProblem(facts.code, edge, facts.place(edge.offset)),
  })
}

/**
 * Records what reading a module found.
 */
function record(walk: Walk, facts: FileFacts, reading: ModuleReading): void {
  const { graph, options } = walk
  for (const atom of [...reading.atoms, ...reading.classes]) graph.atoms.add(atom)
  if (reading.dynamicCalls.length > 0) graph.dynamicFiles.add(facts.file)
  if (!isStoodInFor(walk, facts)) {
    for (const problem of reading.problems) {
      facts.problems.push({
        ...problem,
        file: facts.rel,
        pkg: facts.pkg,
        ...facts.place(problem.offset),
      })
    }
  }
  // An empty `keepFor` list stands in for the calls the build cannot read and not for a
  // `cx.dynamic()` call, which needs the atoms it can take in the list.
  if (listedAtomsFor(options, facts.pkg).length > 0) return
  for (const call of reading.dynamicCalls) {
    facts.problems.push({
      kind: 'dynamic',
      offset: 0,
      construct: call.construct,
      text: '',
      file: facts.rel,
      pkg: facts.pkg,
      ...facts.place(call.offset),
    })
  }
}

/**
 * Parses one file, follows its edges and reads it.
 */
function read(walk: Walk, facts: FileFacts): void {
  const { file, code } = facts
  const parsed = parseSync(file, code, {
    lang: languageOf(file),
    sourceType: 'unambiguous',
    preserveParens: false,
  })
  if (parsed.errors.some((error) => isFatalParseError(error))) {
    facts.problems.push(unreadProblem(facts.rel, facts.pkg))
    return
  }
  const program = parsed.program as unknown as Parameters<typeof readModule>[1]
  const declared = followEdges(walk, facts, edgesOf(program))
  const reading = readModule(code, program, {
    cxSources: new Set([CX_SOURCE, ...declared]),
    declaredSources: declared,
    isDeclared: walk.declaredFiles.has(file),
    ownAtoms: walk.options.ownAtoms,
    isDependency: isDependencyPath(file),
  })
  record(walk, facts, reading)
}

/**
 * The package a file belongs to, for a file under `node_modules`.
 */
function packageNameOf(walk: Walk, file: string): string | undefined {
  return isDependencyPath(file) ? walk.packageOf(file).name : undefined
}

/**
 * Reads one source file of the graph. A file that cannot be opened, or whose reading throws, is a
 * problem in that file, and the walk goes on.
 */
function visit(walk: Walk, { file, isInMode }: Queued): void {
  const { options, graph } = walk
  const rel = relativeTo(options.dir, file)
  const problems = isInMode ? graph.problems : []
  let code: string
  try {
    code = readFileSync(file, 'utf8')
  } catch (error) {
    // Declared all the same, so the bundler runs the plugin again once the file can be read.
    graph.files.set(file, digestOf(''))
    const reason = `opening it failed (${(error as NodeJS.ErrnoException).code ?? String(error)}).`
    problems.push(unreadProblem(rel, packageNameOf(walk, file), reason))
    return
  }
  graph.files.set(file, digestOf(code))
  const pkg = packageNameOf(walk, file)
  const facts: FileFacts = { code, file, rel, pkg, place: placerFor(code), isInMode, problems }
  try {
    read(walk, facts)
  } catch (error) {
    problems.push(unreadProblem(rel, pkg, `reading it threw ${String(error)}`))
  }
}

/**
 * Reads the graph of the project in `options.dir` into `graph`, which holds what was read so far
 * if reading stops.
 */
export function readGraph(options: GraphOptions, graph: Graph = emptyGraph()): Graph {
  const entries = findEntries(options.dir)
  graph.directories.push(...entries.directories)
  const resolver = createResolver(options.dir, options.modes, graph.inputs)
  graph.problems.push(...resolver.configProblems)
  const declared = declaredModules(options.dir, options.cxModules, resolver)
  const naveNames = new Set([
    CORE_PACKAGE,
    ...options.cxModules
      .filter((entry) => !entry.startsWith('.'))
      .map((entry) => packageNameOfSpecifier(entry)),
  ])
  const walk: Walk = {
    options,
    resolver,
    packageOf: createPackageReader(naveNames, graph.inputs.files),
    isCxFile: createCxFileTest(graph.inputs.files),
    declaredFiles: declared.files,
    declaredEntries: declared.entries,
    queue: [],
    seen: new Map(),
    graph,
  }
  for (const file of entries.files) enqueue(walk, file, true)
  while (walk.queue.length > 0) visit(walk, walk.queue.pop()!)
  addPagesDynamicPackages(graph, entries.pagesFiles, (file) => packageNameOf(walk, file))
  return graph
}
