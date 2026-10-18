/**
 * The import graph from Next.js's entries: every file reached is parsed, read for the atoms it
 * names and the calls it cannot read, and followed to the files it imports. Nothing here throws
 * for a problem in the code it reads; each becomes a problem in the result.
 */
import type { LocatedProblem, ModuleReading } from '@navecss/core/collect'

import { CX_SOURCE, readModule } from '@navecss/core/collect'
import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { parseSync } from 'oxc-parser'

import type { Edge } from './edges.ts'
import type { SelectedDirectory } from './entries.ts'
import type { Place } from './lines.ts'
import type { PackageInfo } from './packages.ts'
import type { Resolver } from './resolve.ts'

import { CORE_PACKAGE, declaredModules, isCoreFile, isUnboundCxEdge } from './core-edges.ts'
import { digestOf } from './digest.ts'
import { edgesOf } from './edges.ts'
import { findEntries } from './entries.ts'
import {
  isFatalParseError,
  languageOf,
  listedAtomsFor,
  unboundCxProblem,
  unreadProblem,
  unresolvedProblem,
} from './graph-parts.ts'
import { placerFor } from './lines.ts'
import { createPackageReader, packageNameOfSpecifier } from './packages.ts'
import { createResolver } from './resolve.ts'
import { isDependencyPath, isMarkdownFile, isSourceFile, relativeTo } from './source-files.ts'

export interface GraphOptions {
  readonly dir: string
  readonly keep: readonly string[]
  readonly keepFor: Readonly<Record<string, readonly string[]>>
  readonly cxModules: readonly string[]
  /**
   * The names of the consumer's own atoms, which have no class.
   */
  readonly ownAtoms: ReadonlySet<string>
}

export interface Graph {
  /**
   * The built-in atoms the files name: `cx()` calls and classes written whole.
   */
  readonly atoms: Set<string>
  readonly problems: LocatedProblem[]
  /**
   * Content digest of every file read, by absolute path.
   */
  readonly files: Map<string, string>
  /**
   * The Markdown and MDX files met, absolute, not read.
   */
  readonly markdown: Set<string>
  readonly directories: SelectedDirectory[]
}

interface Walk {
  readonly options: GraphOptions
  readonly resolver: Resolver
  readonly packageOf: (file: string) => PackageInfo
  readonly declaredFiles: ReadonlySet<string>
  readonly declaredEntries: ReadonlySet<string>
  readonly queue: string[]
  readonly seen: Set<string>
  readonly graph: Graph
}

/**
 * Queues a file the graph has not met.
 */
function enqueue(walk: Walk, file: string): void {
  if (walk.seen.has(file)) return
  walk.seen.add(file)
  if (isMarkdownFile(file)) walk.graph.markdown.add(file)
  else if (isSourceFile(file)) walk.queue.push(file)
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
  if (walk.declaredEntries.has(edge.specifier)) return true
  return files.some((resolved) => walk.declaredFiles.has(resolved))
}

interface FileFacts {
  readonly code: string
  readonly file: string
  readonly rel: string
  readonly pkg: string | undefined
  readonly place: (offset: number) => Place
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
    if (isUnboundCxEdge(walk.resolver, facts.file, edge, resolution.files)) {
      recordUnboundCx(walk, facts, edge)
      continue
    }
    for (const resolved of resolution.files) {
      if (!isCoreFile(walk.packageOf, resolved)) enqueue(walk, resolved)
    }
    if (isNamingDeclared(walk, edge, resolution.files)) declared.add(edge.specifier)
    if (resolution.files.length === 0 && isCheckedImport(walk, facts.file)) {
      const found = unresolvedProblem(facts.code, edge, facts.place(edge.offset))
      walk.graph.problems.push({
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
  walk.graph.problems.push({
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
  if (isStoodInFor(walk, facts)) return
  for (const problem of reading.problems) {
    graph.problems.push({
      ...problem,
      file: facts.rel,
      pkg: facts.pkg,
      ...facts.place(problem.offset),
    })
  }
  if (listedAtomsFor(options, facts.pkg).length > 0) return
  for (const call of reading.dynamicCalls) {
    graph.problems.push({
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
    walk.graph.problems.push(unreadProblem(facts.rel, facts.pkg))
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
function visit(walk: Walk, file: string): void {
  const { options, graph } = walk
  const rel = relativeTo(options.dir, file)
  let code: string
  try {
    code = readFileSync(file, 'utf8')
  } catch (error) {
    // Declared all the same, so the bundler runs the plugin again once the file can be read.
    graph.files.set(file, digestOf(''))
    const reason = `opening it failed (${(error as NodeJS.ErrnoException).code ?? String(error)}).`
    graph.problems.push(unreadProblem(rel, packageNameOf(walk, file), reason))
    return
  }
  graph.files.set(file, digestOf(code))
  const facts: FileFacts = {
    code,
    file,
    rel,
    pkg: packageNameOf(walk, file),
    place: placerFor(code),
  }
  try {
    read(walk, facts)
  } catch (error) {
    graph.problems.push(unreadProblem(rel, facts.pkg, `reading it threw ${String(error)}`))
  }
}

/**
 * Reads the graph of the project in `options.dir`.
 */
export function readGraph(options: GraphOptions): Graph {
  const resolver = createResolver(options.dir)
  const declared = declaredModules(options.dir, options.cxModules, resolver)
  const naveNames = new Set([
    CORE_PACKAGE,
    ...options.cxModules
      .filter((entry) => !entry.startsWith('.'))
      .map((entry) => packageNameOfSpecifier(entry)),
  ])
  const entries = findEntries(options.dir)
  const graph: Graph = {
    atoms: new Set(),
    problems: [],
    files: new Map(),
    markdown: new Set(),
    directories: entries.directories,
  }
  const walk: Walk = {
    options,
    resolver,
    packageOf: createPackageReader(naveNames),
    declaredFiles: declared.files,
    declaredEntries: declared.entries,
    queue: [],
    seen: new Set(),
    graph,
  }
  for (const file of entries.files) enqueue(walk, file)
  while (walk.queue.length > 0) visit(walk, walk.queue.pop()!)
  return graph
}
