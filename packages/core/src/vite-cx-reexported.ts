/**
 * The `cx` exports a module gives out by re-exporting another module's: `export { a as b } from`,
 * `export * from` (every name but the default), `export * as ns from`, and an import of the module
 * that the file then exports. A module that does so has those names as `cx` exports of its own, so
 * what an importer takes from it is read as a take of the `cx` the first module gives out.
 */
import type { AstNode } from './vite-ast.ts'

import { childrenOf, exportNameOf, nodeAt, nodesAt, staticStringOf } from './vite-ast.ts'
import { analyze, type Binding, type Reference, type ScopeAnalysis } from './vite-scope.ts'

interface Source {
  /**
   * The `cx` exports of the module re-exported.
   */
  readonly names: ReadonlySet<string>
  /**
   * The specifiers the re-exporting module writes that resolve to that module.
   */
  readonly reaches: ReadonlySet<string>
}

/**
 * The names an `export ... from` statement of the module gives its `cx` exports out under.
 */
function exportedBy(node: AstNode, source: Source): string[] {
  const from = staticStringOf(nodeAt(node, 'source'))
  if (from === undefined || !source.reaches.has(from)) return []
  if (node.type === 'ExportAllDeclaration') {
    const namespace = exportNameOf(nodeAt(node, 'exported'))
    if (namespace !== undefined) return [namespace]
    return source.names
      .values()
      .filter((name) => name !== 'default')
      .toArray()
  }
  return nodesAt(node, 'specifiers').flatMap((specifier) => {
    const local = exportNameOf(nodeAt(specifier, 'local'))
    const exported = exportNameOf(nodeAt(specifier, 'exported'))
    return local !== undefined && exported !== undefined && source.names.has(local)
      ? [exported]
      : []
  })
}

/**
 * Whether the binding imports a `cx` export of the module, or its namespace.
 */
function isImportedFrom(binding: Binding | undefined, source: Source): boolean {
  if (binding?.kind !== 'import' || binding.source === undefined) return false
  if (!source.reaches.has(binding.source)) return false
  return binding.imported === '*' || source.names.has(binding.imported ?? '')
}

/**
 * The name an export statement gives the reference, if the reference is what it exports.
 */
function exportedAs(analysis: ScopeAnalysis, reference: Reference): string | undefined {
  const parent = analysis.parentOf.get(reference.node)
  if (parent?.type === 'ExportDefaultDeclaration') return 'default'
  return parent?.type === 'ExportSpecifier' ? exportNameOf(nodeAt(parent, 'exported')) : undefined
}

/**
 * The names under which the module `program` gives out the `cx` exports `source.names` of the
 * module it imports through `source.reaches`.
 */
export function reexportedNames(program: AstNode, source: Source): string[] {
  const found = new Set<string>()
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      for (const name of exportedBy(node, source)) found.add(name)
    }
    stack.push(...childrenOf(node))
  }
  const analysis = analyze(program)
  for (const reference of analysis.references) {
    const name = isImportedFrom(reference.binding, source)
      ? exportedAs(analysis, reference)
      : undefined
    if (name !== undefined) found.add(name)
  }
  return [...found]
}
