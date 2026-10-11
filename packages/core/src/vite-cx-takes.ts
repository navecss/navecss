/**
 * What an importer takes from a module that gives out Nave's `cx`: which of its `cx` exports it
 * imports, re-exports or reads off a namespace. The test is by name, not by file: an importer that
 * takes only `Button` from a module which also exports `cx` as `cn` takes no `cx` from it, so
 * nothing of its own routes calls through `cn`. A take the parse cannot tell apart (a namespace
 * passed on, a computed key, a rest element, an `import()` used any other way) counts as taken, and
 * so does an importer whose text names the module in no way the build reads (a `require()`).
 */
import type { AstNode } from './vite-ast.ts'

import { childrenOf, exportNameOf, nodeAt, nodesAt, staticStringOf } from './vite-ast.ts'
import { type CxNames, dynamicKeys, isCxName, referenceTakes } from './vite-cx-take-keys.ts'
import { analyze, type Reference, type ScopeAnalysis } from './vite-scope.ts'

/**
 * How an importer takes the module: by the names it imports or re-exports, as a namespace, as
 * `export *`, as an `import()`, or in a way the build cannot read.
 */
type TakeShape = 'dynamic-import' | 'names' | 'namespace' | 'star' | 'unreadable'

export interface Taken {
  readonly shape: TakeShape
  /**
   * The `cx` exports the importer takes by name; none when it takes the module whole.
   */
  readonly names: readonly string[]
  /**
   * Whether the importer only passes on what it takes: a named re-export, or an import that it
   * then exports.
   */
  readonly isPassedOn?: boolean
  /**
   * Whether the importer does nothing with what it takes but re-export it: `export ... from`, or an
   * import that every use of is an export. A forward is followed to what takes it; it is not a
   * take on the `cxModules` route.
   */
  readonly isForward?: boolean
}

export interface Take extends Taken {
  /**
   * The importer's path, relative to the project root, with forward slashes.
   */
  readonly taker: string
  /**
   * Whether the module taken from is reached through another module of its package, which
   * re-exports the `cx` it gives out.
   */
  readonly isReached: boolean
}

/**
 * The take of an importer the build cannot read: it takes the module whole.
 */
export const UNREADABLE: Taken = { shape: 'unreadable', names: [] }

/**
 * What the references to a namespace import take.
 */
function namespaceTakes(
  analysis: ScopeAnalysis,
  references: readonly Reference[],
  names: CxNames,
): Taken | undefined {
  const found = new Set<string>()
  for (const reference of references) {
    const taken = referenceTakes(analysis, reference.node, names)
    if (taken === undefined) return { shape: 'namespace', names: [] }
    for (const name of taken) found.add(name)
  }
  return found.size === 0 ? undefined : { shape: 'namespace', names: [...found] }
}

/**
 * The references to the namespace import that `specifier` declares in the module.
 */
function referencesTo(
  analysis: ScopeAnalysis,
  source: string,
  specifier: AstNode,
): readonly Reference[] {
  const local = exportNameOf(nodeAt(specifier, 'local'))
  return analysis.references.filter(({ binding }) => {
    return (
      binding?.kind === 'import' &&
      binding.imported === '*' &&
      binding.source === source &&
      binding.name === local
    )
  })
}

interface Scan {
  readonly analysis: () => ScopeAnalysis
  readonly names: CxNames
  readonly reaches: ReadonlySet<string>
}

/**
 * The references to the binding that the import specifier of `source` declares.
 */
function usesOf(analysis: ScopeAnalysis, source: string, specifier: AstNode): readonly Reference[] {
  const local = exportNameOf(nodeAt(specifier, 'local'))
  return analysis.references.filter(
    ({ binding }) =>
      binding?.kind === 'import' && binding.source === source && binding.name === local,
  )
}

/**
 * Whether a reference is what an export statement exports.
 */
function isExportOf(analysis: ScopeAnalysis, reference: Reference): boolean {
  const parent = analysis.parentOf.get(reference.node)
  return parent?.type === 'ExportSpecifier' || parent?.type === 'ExportDefaultDeclaration'
}

/**
 * How the module passes on what the import specifier declares: `isPassedOn` when it exports it,
 * `isForward` when it does nothing else with it.
 */
function passingOf(
  analysis: ScopeAnalysis,
  source: string,
  specifier: AstNode,
): { isForward?: true; isPassedOn?: true } {
  const uses = usesOf(analysis, source, specifier)
  const exported = uses.filter((use) => isExportOf(analysis, use))
  if (exported.length === 0) return {}
  return exported.length === uses.length
    ? { isForward: true, isPassedOn: true }
    : { isPassedOn: true }
}

/**
 * What an `import` declaration takes.
 */
function importTakes(node: AstNode, source: string, scan: Scan): Taken[] {
  const found: Taken[] = []
  for (const specifier of nodesAt(node, 'specifiers')) {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      const references = referencesTo(scan.analysis(), source, specifier)
      const taken = namespaceTakes(scan.analysis(), references, scan.names)
      const isForward = passingOf(scan.analysis(), source, specifier).isForward
      if (taken) found.push({ ...taken, ...(isForward && { isForward }) })
      continue
    }
    const imported =
      specifier.type === 'ImportDefaultSpecifier'
        ? 'default'
        : exportNameOf(nodeAt(specifier, 'imported'))
    if (imported !== undefined && isCxName(scan.names, imported)) {
      const passing = passingOf(scan.analysis(), source, specifier)
      found.push({ shape: 'names', names: [imported], ...passing })
    }
  }
  return found
}

/**
 * What an `export ... from` statement takes: the `cx` exports a named one re-exports, the whole
 * namespace an `export * as` re-exports, and the module's named exports an `export *` re-exports.
 */
function exportTakes(node: AstNode, scan: Scan): Taken[] {
  if (node.type === 'ExportAllDeclaration') {
    if (nodeAt(node, 'exported') !== undefined) {
      return [{ shape: 'namespace', names: [], isForward: true }]
    }
    const hasNamed =
      scan.names === undefined || scan.names.keys().some((name) => name !== 'default')
    return hasNamed ? [{ shape: 'star', names: [], isForward: true }] : []
  }
  const re = nodesAt(node, 'specifiers')
    .map((specifier) => exportNameOf(nodeAt(specifier, 'local')))
    .filter((name): name is string => name !== undefined && isCxName(scan.names, name))
  return re.length === 0 ? [] : [{ shape: 'names', names: re, isPassedOn: true, isForward: true }]
}

/**
 * What an `import()` takes: the `cx` exports its awaited result, or the parameter of its inline
 * `.then` callback, reads by static keys (none when it reads other keys), and the whole module for
 * any other use.
 */
function dynamicTakes(node: AstNode, scan: Scan): Taken[] {
  const keys = dynamicKeys(scan.analysis(), node, scan.names)
  if (keys === undefined) return [{ shape: 'dynamic-import', names: [] }]
  return keys.length === 0 ? [] : [{ shape: 'dynamic-import', names: keys }]
}

/**
 * What one statement or expression takes from the module, when it names it.
 */
function takesOf(node: AstNode, scan: Scan): Taken[] {
  const source = staticStringOf(nodeAt(node, 'source'))
  if (source === undefined || !scan.reaches.has(source)) return []
  if (node.type === 'ImportDeclaration') return importTakes(node, source, scan)
  if (node.type === 'ImportExpression') return dynamicTakes(node, scan)
  return exportTakes(node, scan)
}

/**
 * What the module `program` takes from a module that exports `cx` under `names`, `reaches` being
 * the specifiers it writes that resolve to that module.
 */
export function takesIn(
  program: AstNode,
  input: { readonly names: CxNames; readonly reaches: ReadonlySet<string> },
): Taken[] {
  let analysis: ScopeAnalysis | undefined
  const scan: Scan = {
    ...input,
    analysis: () => (analysis ??= analyze(program)),
  }
  const found: Taken[] = []
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    found.push(...takesOf(node, scan))
    stack.push(...childrenOf(node))
  }
  return found
}
