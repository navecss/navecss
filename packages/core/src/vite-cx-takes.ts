/**
 * What an importer takes from a module that gives out Nave's `cx`: which of its `cx` exports it
 * imports, re-exports or reads off a namespace. The test is by name, not by file: an importer that
 * takes only `Button` from a module which also exports `cx` as `cn` takes no `cx` from it, so
 * nothing of its own routes calls through `cn`. A take the parse cannot tell apart (a namespace
 * passed on, a computed key, a rest element, an `import()` used any other way) counts as taken.
 */
import type { AstNode } from './vite-ast.ts'

import {
  childrenOf,
  exportNameOf,
  nodeAt,
  nodesAt,
  propertyNameOf,
  staticStringOf,
} from './vite-ast.ts'
import { memberReadOf, patternDestructuring } from './vite-cx-reference.ts'
import { analyze, type Reference, type ScopeAnalysis } from './vite-scope.ts'

/**
 * How an importer takes the module: by the names it imports or re-exports, as a namespace, as
 * `export *`, or as an `import()`.
 */
type TakeShape = 'dynamic-import' | 'names' | 'namespace' | 'star'

export interface Taken {
  readonly shape: TakeShape
  /**
   * The `cx` exports the importer takes by name; none when it takes the module whole.
   */
  readonly names: readonly string[]
}

export interface Take extends Taken {
  /**
   * The importer's path, relative to the project root, with forward slashes.
   */
  readonly taker: string
}

/**
 * The `cx` exports of the module; `undefined` when they are not known, which counts every name.
 */
export type CxNames = ReadonlySet<string> | undefined

/**
 * Whether `name` is one of the `cx` exports.
 */
function isCxName(names: CxNames, name: string): boolean {
  return names === undefined || names.has(name)
}

/**
 * The `cx` exports an object pattern takes by static keys, or `undefined` when it takes the whole
 * object: a rest element, or a key that is computed.
 */
function patternKeys(pattern: AstNode, names: CxNames): string[] | undefined {
  const taken: string[] = []
  for (const property of nodesAt(pattern, 'properties')) {
    const key =
      property.type === 'Property'
        ? propertyNameOf(nodeAt(property, 'key'), property.computed === true)
        : undefined
    if (key === undefined) return undefined
    if (isCxName(names, key)) taken.push(key)
  }
  return taken
}

/**
 * The names one reference to a namespace takes: a member read by a static key, or a destructuring
 * by static keys, take the keys that are `cx` exports; anything else takes the whole namespace.
 */
function referenceTakes(
  analysis: ScopeAnalysis,
  node: AstNode,
  names: CxNames,
): string[] | undefined {
  const read = memberReadOf({ analysis }, node)
  if (read) {
    if (read.key === undefined) return undefined
    return isCxName(names, read.key) ? [read.key] : []
  }
  const pattern = patternDestructuring({ analysis }, node)
  return pattern?.type === 'ObjectPattern' ? patternKeys(pattern, names) : undefined
}

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
 * What an `import` declaration takes.
 */
function importTakes(node: AstNode, source: string, scan: Scan): Taken[] {
  const found: Taken[] = []
  for (const specifier of nodesAt(node, 'specifiers')) {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      const references = referencesTo(scan.analysis(), source, specifier)
      const taken = namespaceTakes(scan.analysis(), references, scan.names)
      if (taken) found.push(taken)
      continue
    }
    const imported =
      specifier.type === 'ImportDefaultSpecifier'
        ? 'default'
        : exportNameOf(nodeAt(specifier, 'imported'))
    if (imported !== undefined && isCxName(scan.names, imported)) {
      found.push({ shape: 'names', names: [imported] })
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
    if (nodeAt(node, 'exported') !== undefined) return [{ shape: 'namespace', names: [] }]
    const hasNamed =
      scan.names === undefined || scan.names.keys().some((name) => name !== 'default')
    return hasNamed ? [{ shape: 'star', names: [] }] : []
  }
  const re = nodesAt(node, 'specifiers')
    .map((specifier) => exportNameOf(nodeAt(specifier, 'local')))
    .filter((name): name is string => name !== undefined && isCxName(scan.names, name))
  return re.length === 0 ? [] : [{ shape: 'names', names: re }]
}

/**
 * What an `import()` takes: the `cx` exports of a destructuring of its awaited result by static
 * keys, none for a destructuring of other keys, and the whole module for any other use.
 */
function dynamicTakes(node: AstNode, scan: Scan): Taken[] {
  const awaited = scan.analysis().parentOf.get(node)
  const pattern =
    awaited?.type === 'AwaitExpression'
      ? patternDestructuring({ analysis: scan.analysis() }, awaited)
      : undefined
  const keys = pattern?.type === 'ObjectPattern' ? patternKeys(pattern, scan.names) : undefined
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
