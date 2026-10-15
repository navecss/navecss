/**
 * The `cx` exports a module gives out by re-exporting another module's: `export { a as b } from`,
 * `export * from` (every name but the default, and not one the module exports itself, which wins
 * over a star), `export * as ns from`, and an import of the module that the file then exports. A
 * module that does so has those names as `cx` exports of its own, so what an importer takes from
 * it is read as a take of the `cx` the first module gives out.
 */
import type { AstNode } from './vite-ast.ts'

import {
  childrenOf,
  exportNameOf,
  nodeAt,
  nodesAt,
  pushAll,
  staticStringOf,
  stringAt,
} from './vite-ast.ts'
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
  /**
   * The names another star of the re-exporting module exports with a binding of its own, which
   * leaves them exported by neither star.
   */
  readonly rivals: ReadonlySet<string>
}

/**
 * The names a binding pattern declares: the identifiers inside its objects, arrays, defaults and
 * rest elements.
 */
function declaredNames(pattern: AstNode | undefined): string[] {
  const found: string[] = []
  const stack = pattern ? [pattern] : []
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'Identifier') {
      found.push(stringAt(node, 'name') ?? '')
    } else if (node.type === 'AssignmentPattern') {
      pushAll(
        stack,
        [nodeAt(node, 'left')].filter((part) => part !== undefined),
      )
    } else {
      const single = ['argument', 'value'].map((key) => nodeAt(node, key))
      const lists = ['properties', 'elements'].flatMap((key) => nodesAt(node, key))
      pushAll(
        stack,
        single.filter((part) => part !== undefined),
      )
      pushAll(stack, lists)
    }
  }
  return found
}

/**
 * The names the module exports itself, by a declaration, an export list or `export * as`: they win
 * over the same name exported by a star.
 */
export function ownExports(program: AstNode): Set<string> {
  const found = new Set<string>()
  for (const statement of nodesAt(program, 'body')) {
    const namespace =
      statement.type === 'ExportAllDeclaration'
        ? exportNameOf(nodeAt(statement, 'exported'))
        : undefined
    if (namespace !== undefined) found.add(namespace)
    if (statement.type !== 'ExportNamedDeclaration') continue
    const declaration = nodeAt(statement, 'declaration')
    const declared = nodesAt(declaration ?? statement, 'declarations').flatMap((declarator) =>
      declaredNames(nodeAt(declarator, 'id')),
    )
    for (const name of [...declared, ...declaredNames(declaration && nodeAt(declaration, 'id'))]) {
      found.add(name)
    }
    for (const specifier of nodesAt(statement, 'specifiers')) {
      const name = exportNameOf(nodeAt(specifier, 'exported'))
      if (name !== undefined) found.add(name)
    }
  }
  return found
}

/**
 * The names an `export ... from` statement of the module gives its `cx` exports out under.
 */
function exportedBy(node: AstNode, source: Source, own: ReadonlySet<string>): string[] {
  const from = staticStringOf(nodeAt(node, 'source'))
  if (from === undefined || !source.reaches.has(from)) return []
  if (node.type === 'ExportAllDeclaration') {
    const namespace = exportNameOf(nodeAt(node, 'exported'))
    if (namespace !== undefined) return [namespace]
    return source.names
      .values()
      .filter((name) => name !== 'default' && !own.has(name) && !source.rivals.has(name))
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
 * The specifiers of the `export * from` statements of the module.
 */
export function starSources(program: AstNode): string[] {
  return nodesAt(program, 'body').flatMap((statement) => {
    const source = staticStringOf(nodeAt(statement, 'source'))
    const isStar = statement.type === 'ExportAllDeclaration' && !nodeAt(statement, 'exported')
    return isStar && source !== undefined ? [source] : []
  })
}

/**
 * The names under which the module `program` gives out the `cx` exports `source.names` of the
 * module it imports through `source.reaches`.
 */
export function reexportedNames(program: AstNode, source: Source): string[] {
  const found = new Set<string>()
  const own = ownExports(program)
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      for (const name of exportedBy(node, source, own)) found.add(name)
    }
    pushAll(stack, childrenOf(node))
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
