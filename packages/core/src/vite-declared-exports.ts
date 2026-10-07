/**
 * What a module listed in `cxModules` may export. The build follows a listed module one step, to
 * the `cx` it re-exports from `@navecss/core/cx` itself, under the name `cx`. Anything else it
 * exports of `cx` is a problem in that module: Nave's `cx` under another name, as a default or in a
 * namespace, a `cx` that is not Nave's (its own function, a wrapper, one taken from another
 * module, a star of another module when Nave's `cx` is not exported beside it), and the `cx` of a
 * module that is already listed, which would be a second hop. A star of another module is no
 * problem beside an export of Nave's `cx` of the module's own: an explicit export wins over a star,
 * and two stars that give `cx` one binding are not ambiguous.
 */
import type { AstNode } from './vite-ast.ts'
import type { CxBinding } from './vite-cx-reference.ts'
import type { Problem } from './vite-problems.ts'
import type { Binding, ScopeAnalysis } from './vite-scope.ts'

import { nodeAt, nodesAt, staticStringOf, stringAt } from './vite-ast.ts'

const DECLARED_TEXT =
  "listed in cxModules, but this export can give it a cx the build does not follow: the build follows a listed module one step, to Nave's cx re-exported from @navecss/core/cx under the name cx."

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
 * re-export from Nave's own module, a second hop from a listed one unless the module exports Nave's
 * `cx` itself (`hasNaveCx`: both stars then give `cx` the same binding, or an explicit export wins
 * over the star); the second is a namespace, which no importer can read as `cx`, and which from any
 * other module is a `cx` that is not Nave's when it is named `cx`. A plain star from another module
 * is judged with the whole module, by `unfollowedStarProblems`.
 */
function starExportProblems(
  node: AstNode,
  input: DeclaredExportsInput,
  hasNaveCx: boolean,
): Problem[] {
  const source = staticStringOf(nodeAt(node, 'source'))
  if (source === undefined) return []
  const exported = nodeAt(node, 'exported')
  if (!input.cxSources.has(source)) {
    return exportNameOf(exported) === 'cx' ? [problem(node)] : []
  }
  if (exported !== undefined) return [problem(node)]
  return !hasNaveCx && input.declaredSources.has(source) ? [problem(node)] : []
}

/**
 * Whether `source` is Nave's own module, as opposed to a listed one or any other.
 */
function isNaveSource(source: string | undefined, input: DeclaredExportsInput): boolean {
  return source !== undefined && input.cxSources.has(source) && !input.declaredSources.has(source)
}

/**
 * Whether `export { local as exported }`, with no source, exports an imported binding of Nave's
 * `cx` under the name `cx`.
 */
function isNaveLocalExport(
  local: AstNode | undefined,
  exported: string | undefined,
  input: DeclaredExportsInput,
): boolean {
  const binding = local && input.analysis.referenceOf(local)?.binding
  const cx = binding ? input.bindings.get(binding) : undefined
  const isListed = input.declaredSources.has(binding?.source ?? '')
  return exported === 'cx' && cx !== undefined && !cx.isNamespace && !isListed
}

/**
 * Whether one specifier of `export { ... }` gives the module Nave's `cx` under the name `cx`: a
 * plain re-export from Nave's module (`source`), or the export of an imported binding of it.
 */
function isNaveSpecifier(
  specifier: AstNode,
  source: string | undefined,
  input: DeclaredExportsInput,
): boolean {
  const local = nodeAt(specifier, 'local')
  const exported = exportNameOf(nodeAt(specifier, 'exported'))
  if (source === undefined) return isNaveLocalExport(local, exported, input)
  return isNaveSource(source, input) && isPlainReExport(exportNameOf(local), exported)
}

/**
 * Whether the statement gives the module Nave's `cx` under the name `cx`: a plain re-export from
 * Nave's module, a star from it, or an export of an imported binding of it.
 */
function isNaveCxExport(node: AstNode, input: DeclaredExportsInput): boolean {
  const source = staticStringOf(nodeAt(node, 'source'))
  if (node.type === 'ExportAllDeclaration') {
    return isNaveSource(source, input) && nodeAt(node, 'exported') === undefined
  }
  if (node.type !== 'ExportNamedDeclaration' || nodeAt(node, 'declaration')) return false
  return nodesAt(node, 'specifiers').some((specifier) => isNaveSpecifier(specifier, source, input))
}

/**
 * The problem of a module that gives itself no Nave `cx` but has `export * from` another module:
 * its `cx` can only come from there, as a second hop or as another function. It is judged from the
 * module's own text, at the first such statement, whether or not the other module exports a `cx`.
 */
function unfollowedStarProblems(body: readonly AstNode[], input: DeclaredExportsInput): Problem[] {
  if (body.some((node) => isNaveCxExport(node, input))) return []
  const star = body.find((node) => {
    const source = staticStringOf(nodeAt(node, 'source'))
    const isPlainStar =
      node.type === 'ExportAllDeclaration' && nodeAt(node, 'exported') === undefined
    return isPlainStar && source !== undefined && !input.cxSources.has(source)
  })
  return star ? [problem(star)] : []
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
  ExportDefaultDeclaration: defaultExportProblems,
  ExportNamedDeclaration: namedExportProblems,
}

/**
 * The problems in the exports of a module listed in `cxModules`.
 */
export function declaredExportProblems(input: DeclaredExportsInput): Problem[] {
  const body = nodesAt(input.program, 'body')
  const hasNaveCx = body.some((node) => isNaveCxExport(node, input))
  const problems = [
    ...body.flatMap((node) =>
      node.type === 'ExportAllDeclaration'
        ? starExportProblems(node, input, hasNaveCx)
        : (EXPORT_PROBLEMS[node.type]?.(node, input) ?? []),
    ),
    ...unfollowedStarProblems(body, input),
  ]
  return hasNaveCx ? problems.map((found) => ({ ...found, hasNaveCx })) : problems
}
