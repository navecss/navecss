/**
 * What a module listed in `cxModules` may export. The build follows a listed module one step, to
 * the `cx` it re-exports from `@navecss/core/cx` itself, under the name `cx`. Anything else it
 * exports of `cx` is a problem in that module: Nave's `cx` under another name, as a default or in a
 * namespace, a `cx` that is not Nave's (its own function, a wrapper, one taken from another
 * module), and the `cx` of a module that is already listed, which would be a second hop.
 */
import type { AstNode } from './vite-ast.ts'
import type { CxBinding } from './vite-cx-reference.ts'
import type { Problem } from './vite-problems.ts'
import type { Binding, ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt, staticStringOf, stringAt } from './vite-ast.ts'

const DECLARED_TEXT =
  "listed in cxModules, but its cx is not Nave's cx re-exported: the build follows a listed module one step, to a cx it imports from @navecss/core/cx."

export interface DeclaredExportsInput {
  readonly program: AstNode
  readonly analysis: ScopeAnalysis
  readonly bindings: ReadonlyMap<Binding, CxBinding>
  /**
   * Every specifier that binds a `cx`: Nave's own and the listed modules'.
   */
  readonly cxSources: ReadonlySet<string>
  /**
   * The specifiers that name a listed module.
   */
  readonly declaredSources: ReadonlySet<string>
}

/**
 * The name an export specifier's side spells: an identifier, or a string (`export { x as 'a-b' }`).
 */
function exportNameOf(node: AstNode | undefined): string | undefined {
  if (!node) return undefined
  return node.type === 'Identifier' ? stringAt(node, 'name') : staticStringOf(node)
}

/**
 * The patterns a binding pattern holds one level down: a property's value, an element, a default's
 * left side, a rest's argument.
 */
function innerPatterns(pattern: AstNode): AstNode[] {
  switch (pattern.type) {
    case 'ArrayPattern': {
      return nodesAt(pattern, 'elements')
    }
    case 'AssignmentPattern': {
      return [nodeAt(pattern, 'left')].filter((inner) => inner !== undefined)
    }
    case 'ObjectPattern': {
      return nodesAt(pattern, 'properties').flatMap((property) =>
        [nodeAt(property, property.type === 'Property' ? 'value' : 'argument')].filter(
          (inner) => inner !== undefined,
        ),
      )
    }
    case 'RestElement': {
      return [nodeAt(pattern, 'argument')].filter((inner) => inner !== undefined)
    }
    default: {
      return []
    }
  }
}

/**
 * The names a binding pattern declares.
 */
function patternNames(pattern: AstNode | undefined): string[] {
  const names: string[] = []
  const stack = pattern ? [pattern] : []
  while (stack.length > 0) {
    const next = stack.pop()!
    if (next.type === 'Identifier') names.push(stringAt(next, 'name') ?? '')
    stack.push(...innerPatterns(next))
  }
  return names
}

/**
 * The names an exported declaration declares.
 */
function declaredNames(declaration: AstNode): string[] {
  if (declaration.type !== 'VariableDeclaration') {
    return patternNames(nodeAt(declaration, 'id'))
  }
  return nodesAt(declaration, 'declarations').flatMap((declarator) =>
    patternNames(nodeAt(declarator, 'id')),
  )
}

/**
 * The problem an export makes in a listed module.
 */
function problem(node: AstNode): Problem {
  return { kind: 'declared', offset: node.start, construct: '', text: DECLARED_TEXT }
}

/**
 * Whether `exported` is a name Nave's `cx` may leave the module under, and `local` the name it is
 * taken from, in `export { local as exported } from '@navecss/core/cx'`.
 */
function isPlainReExport(local: string | undefined, exported: string | undefined): boolean {
  return local === 'cx' && exported === 'cx'
}

/**
 * The problems of `export { ... } from <source>`.
 */
function fromSourceProblems(node: AstNode, source: string, input: DeclaredExportsInput): Problem[] {
  const isNave = input.cxSources.has(source) && !input.declaredSources.has(source)
  const isListed = input.declaredSources.has(source)
  const isBad = nodesAt(node, 'specifiers').some((specifier) => {
    const local = exportNameOf(nodeAt(specifier, 'local'))
    const exported = exportNameOf(nodeAt(specifier, 'exported'))
    if (isNave) return !isPlainReExport(local, exported)
    return exported === 'cx' || (isListed && local === 'cx')
  })
  return isBad ? [problem(node)] : []
}

/**
 * The problems of `export { ... }` with no source: each specifier names a binding of the module.
 */
function localProblems(node: AstNode, input: DeclaredExportsInput): Problem[] {
  const isBad = nodesAt(node, 'specifiers').some((specifier) => {
    const local = nodeAt(specifier, 'local')
    const binding = local && input.analysis.referenceOf(local)?.binding
    const cx = binding ? input.bindings.get(binding) : undefined
    if (exportNameOf(nodeAt(specifier, 'exported')) !== 'cx') return cx !== undefined
    const isNaves =
      cx !== undefined && !cx.isNamespace && !input.declaredSources.has(binding?.source ?? '')
    return !isNaves
  })
  return isBad ? [problem(node)] : []
}

/**
 * The problems of `export <declaration>`, `export { ... }` and `export { ... } from <source>`.
 */
function namedExportProblems(node: AstNode, input: DeclaredExportsInput): Problem[] {
  const declaration = nodeAt(node, 'declaration')
  if (declaration) return declaredNames(declaration).includes('cx') ? [problem(node)] : []
  const source = staticStringOf(nodeAt(node, 'source'))
  return source === undefined ? localProblems(node, input) : fromSourceProblems(node, source, input)
}

/**
 * The problems of `export * from <source>` and `export * as n from <source>`: the first is the plain
 * re-export from Nave's own module, a second hop from a listed one; the second is a namespace,
 * which no importer can read as `cx`.
 */
function starExportProblems(node: AstNode, input: DeclaredExportsInput): Problem[] {
  const source = staticStringOf(nodeAt(node, 'source'))
  if (source === undefined || !input.cxSources.has(source)) return []
  const isNamespace = nodeAt(node, 'exported') !== undefined
  return isNamespace || input.declaredSources.has(source) ? [problem(node)] : []
}

/**
 * The problems of `export default <expression>`: a default that is a `cx` binding.
 */
function defaultExportProblems(node: AstNode, input: DeclaredExportsInput): Problem[] {
  const declaration = nodeAt(node, 'declaration')
  const binding = declaration && input.analysis.referenceOf(declaration)?.binding
  return binding && input.bindings.has(binding) ? [problem(node)] : []
}

const EXPORT_PROBLEMS: Readonly<
  Record<string, (node: AstNode, input: DeclaredExportsInput) => Problem[]>
> = {
  ExportAllDeclaration: starExportProblems,
  ExportDefaultDeclaration: defaultExportProblems,
  ExportNamedDeclaration: namedExportProblems,
}

/**
 * The problems in the exports of a module listed in `cxModules`.
 */
export function declaredExportProblems(input: DeclaredExportsInput): Problem[] {
  return nodesAt(input.program, 'body').flatMap(
    (node) => EXPORT_PROBLEMS[node.type]?.(node, input) ?? [],
  )
}
