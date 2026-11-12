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
import type { FileFacts, Graph, GraphOptions } from './graph-types.ts'
import type { Resolution } from './resolve.ts'

import { CORE_PACKAGE, createCxFileTest, declaredModules, isUnboundCxEdge } from './core-edges.ts'
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
import {
  enqueue,
  enqueueResolved,
  isCheckedImport,
  isNamingDeclared,
  isStoodInFor,
  type Queued,
  type Walk,
} from './graph-walk.ts'
import { placerFor } from './lines.ts'
import { createPackageReader, packageNameOfSpecifier } from './packages.ts'
import { addPagesDynamicPackages } from './pages-reach.ts'
import { createResolver } from './resolve.ts'
import { isDependencyPath, relativeTo } from './source-files.ts'
import { judgedProblems } from './takes.ts'

/**
 * What a file's imports reach among the modules `cxModules` lists.
 */
interface Listed {
  /**
   * The specifiers that name a listed module.
   */
  readonly declared: Set<string>
  /**
   * The listed files the file reads a `cx` from, with forward slashes.
   */
  readonly via: Set<string>
  /**
   * Whether the file reads a `cx` from nothing but listed files it can name.
   */
  isOnlyListed: boolean
}

/**
 * Notes an import that names a listed module: the specifier, and the listed files it reaches.
 */
function noteListed(walk: Walk, listed: Listed, edge: Edge, files: readonly string[]): void {
  listed.declared.add(edge.specifier)
  const reached = files.filter((file) => walk.declaredFiles.has(file))
  if (reached.length === 0) listed.isOnlyListed = false
  for (const file of reached) listed.via.add(file.replaceAll('\\', '/'))
}

/**
 * Records the import that cannot be resolved, when it is a problem.
 */
function recordUnresolved(walk: Walk, facts: FileFacts, edge: Edge, resolution: Resolution): void {
  if (
    resolution.files.length > 0 ||
    resolution.isConfigCause ||
    !isCheckedImport(walk, facts.file)
  ) {
    return
  }
  const found = unresolvedProblem(facts.code, edge, facts.place(edge.offset))
  facts.problems.push({
    kind: 'unreadable',
    offset: edge.offset,
    file: facts.rel,
    pkg: facts.pkg,
    ...found,
  })
}

/**
 * Resolves each edge of a file: queues what it reaches, records the unresolved ones that are
 * problems, and returns what reaches a listed module.
 */
function followEdges(walk: Walk, facts: FileFacts, edges: readonly Edge[]): Listed {
  const listed: Listed = { declared: new Set(), via: new Set(), isOnlyListed: true }
  for (const edge of edges) {
    if (edge.specifier === CX_SOURCE) listed.isOnlyListed = false
    const resolution = walk.resolver.resolve(facts.file, edge.specifier, edge.isRequire)
    if (resolution.isBuiltin || isBuiltin(edge.specifier)) continue
    if (isUnboundCxEdge(walk, facts.file, edge, resolution.files)) {
      recordUnboundCx(walk, facts, edge)
      continue
    }
    enqueueResolved(walk, facts, resolution)
    if (isNamingDeclared(walk, edge, resolution.files)) {
      noteListed(walk, listed, edge, resolution.files)
    }
    recordUnresolved(walk, facts, edge, resolution)
  }
  return listed
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
  const found = isStoodInFor(walk, facts) ? facts.suppressed : facts.problems
  for (const problem of reading.problems) {
    found.push({
      ...problem,
      file: facts.rel,
      pkg: facts.pkg,
      moduleId: facts.file,
      ...facts.place(problem.offset),
    })
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
 * Parses one file, follows its edges and reads it. Returns the listed files it reads a `cx` from
 * when it reads no other.
 */
function read(walk: Walk, facts: FileFacts): ReadonlySet<string> | undefined {
  const { file, code } = facts
  const parsed = parseSync(file, code, {
    lang: languageOf(file),
    sourceType: 'unambiguous',
    preserveParens: false,
  })
  if (parsed.errors.some((error) => isFatalParseError(error))) {
    facts.problems.push(unreadProblem(facts.rel, facts.pkg))
    return undefined
  }
  const program = parsed.program as unknown as Parameters<typeof readModule>[1]
  const { declared, via, isOnlyListed } = followEdges(walk, facts, edgesOf(program))
  const reading = readModule(code, program, {
    cxSources: new Set([CX_SOURCE, ...declared]),
    declaredSources: declared,
    isDeclared: walk.declaredFiles.has(file),
    ownAtoms: walk.options.ownAtoms,
    isDependency: isDependencyPath(file),
  })
  record(walk, facts, reading)
  return isOnlyListed && via.size > 0 ? via : undefined
}

/**
 * The package a file belongs to, for a file under `node_modules`.
 */
function packageNameOf(walk: Walk, file: string): string | undefined {
  return isDependencyPath(file) ? walk.packageOf(file).name : undefined
}

/**
 * Reads one source file of the graph into `found`, and returns the listed files it reads a `cx`
 * from when it reads no other. A file that cannot be opened, or whose reading throws, is a problem
 * in that file, and the walk goes on.
 */
function readFileOf(
  walk: Walk,
  { file, isInMode }: Queued,
  found: { readonly problems: LocatedProblem[]; readonly suppressed: LocatedProblem[] },
): ReadonlySet<string> | undefined {
  const { options, graph } = walk
  const { problems, suppressed } = found
  const rel = relativeTo(options.dir, file)
  let code: string
  try {
    code = readFileSync(file, 'utf8')
  } catch (error) {
    // Declared all the same, so the bundler runs the plugin again once the file can be read.
    graph.files.set(file, digestOf(''))
    const reason = `opening it failed (${(error as NodeJS.ErrnoException).code ?? String(error)}).`
    problems.push(unreadProblem(rel, packageNameOf(walk, file), reason))
    return undefined
  }
  graph.files.set(file, digestOf(code))
  const pkg = packageNameOf(walk, file)
  const facts: FileFacts = {
    code,
    file,
    rel,
    pkg,
    place: placerFor(code),
    isInMode,
    problems,
    suppressed,
  }
  try {
    return read(walk, facts)
  } catch (error) {
    problems.push(unreadProblem(rel, pkg, `reading it threw ${String(error)}`))
    return undefined
  }
}

/**
 * Reads one source file of the graph; what it found counts when the build's mode reaches it.
 */
function visit(walk: Walk, queued: Queued): void {
  const found = { problems: [] as LocatedProblem[], suppressed: [] as LocatedProblem[] }
  const onlyVia = readFileOf(walk, queued, found)
  if (queued.isInMode) walk.outcomes.push({ onlyVia, ...found })
}

/**
 * Reads the graph of the project in `options.dir` into `graph`, which holds what was read so far
 * if reading stops.
 */
export async function readGraph(
  options: GraphOptions,
  graph: Graph = emptyGraph(),
): Promise<Graph> {
  const entries = findEntries(options.dir, options.pageExtensions)
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
    outcomes: [],
    seen: new Map(),
    graph,
  }
  for (const file of entries.files) enqueue(walk, file, true)
  while (walk.queue.length > 0) visit(walk, walk.queue.pop()!)
  graph.problems.push(...(await judgedProblems(walk, walk.outcomes)))
  addPagesDynamicPackages(graph, entries.pagesFiles, (file) => packageNameOf(walk, file))
  return graph
}
