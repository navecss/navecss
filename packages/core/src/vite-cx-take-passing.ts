/**
 * How a module uses what its import specifiers take from a module that gives out `cx`: whether it
 * passes the value on to an export of its own (a forward), whether it carries it where the build
 * cannot follow it, and the takes of the whole module a dependency makes that the build cannot
 * read to the exports used.
 */
import type { AstNode } from './vite-ast.ts'
import type { Taken } from './vite-cx-takes.ts'
import type { Reference, ScopeAnalysis } from './vite-scope.ts'

import { exportNameOf, nodeAt, nodesAt, propertyNameOf } from './vite-ast.ts'
import { type Flow, flowOf } from './vite-cx-flow.ts'
import { memberReadOf, patternDestructuring } from './vite-cx-reference.ts'
import { type CxNames, isCxName } from './vite-cx-take-keys.ts'
import { INHERITED_NAMES } from './vite-require-uses.ts'

/**
 * The references to the binding that the import specifier of `source` declares.
 */
export function usesOf(
  analysis: ScopeAnalysis,
  source: string,
  specifier: AstNode,
): readonly Reference[] {
  const local = exportNameOf(nodeAt(specifier, 'local'))
  return analysis.references.filter(
    ({ binding }) =>
      binding?.kind === 'import' && binding.source === source && binding.name === local,
  )
}

/**
 * Whether a use only passes the value on: it reaches an export and is neither called nor carried.
 */
function isPure(flow: Flow): boolean {
  return flow.names.size > 0 && !flow.isCalled && !flow.isUnbound
}

/**
 * How the module passes on what the import specifier declares: `isPassedOn` when it reaches an
 * export of the module, by an export statement or through aliases of it, `isForward` when it does
 * nothing else with it.
 */
export function passingOf(
  analysis: ScopeAnalysis,
  source: string,
  specifier: AstNode,
): { isForward?: true; isPassedOn?: true } {
  const flows = usesOf(analysis, source, specifier).map((use) => flowOf(analysis, use.node))
  if (flows.every((flow) => flow.names.size === 0)) return {}
  return flows.every((flow) => isPure(flow))
    ? { isForward: true, isPassedOn: true }
    : { isPassedOn: true }
}

/**
 * Whether a use of the import specifier carries it where the build cannot follow it.
 */
export function isCarriedOn(analysis: ScopeAnalysis, source: string, specifier: AstNode): boolean {
  return usesOf(analysis, source, specifier).some((use) => flowOf(analysis, use.node).isUnbound)
}

/**
 * Whether the value `node` is read from the namespace reaches an export of the module or leaves it
 * where the build cannot follow it. A call of it is the module's own call.
 */
function isValueCarried(analysis: ScopeAnalysis, node: AstNode): boolean {
  const flow = flowOf(analysis, node)
  return flow.isUnbound || flow.names.size > 0
}

/**
 * Whether the declarator sits in an `export const` declaration.
 */
function isExportedDeclarator(analysis: ScopeAnalysis, declarator: AstNode): boolean {
  const declaration = analysis.parentOf.get(declarator)
  const statement = declaration && analysis.parentOf.get(declaration)
  return statement?.type === 'ExportNamedDeclaration'
}

/**
 * Whether the name that the destructuring property `property` binds is carried on. A binding that
 * is not a plain declared name (a default, a nested pattern, an assignment target, an export)
 * is.
 */
function isBoundNameCarried(analysis: ScopeAnalysis, property: AstNode): boolean {
  const value = nodeAt(property, 'value')
  const declarator = analysis.parentOf.get(analysis.parentOf.get(property) ?? property)
  const alias = value?.type === 'Identifier' ? analysis.bindingDeclaredBy(value) : undefined
  if (
    !alias ||
    declarator?.type !== 'VariableDeclarator' ||
    isExportedDeclarator(analysis, declarator)
  ) {
    return true
  }
  return analysis.references.some(
    (use) => use.binding === alias && isValueCarried(analysis, use.node),
  )
}

/**
 * Whether the destructuring `pattern` of a namespace reads a member by an inherited name, or
 * carries on the name it binds to a `cx` export.
 */
function isPatternCarried(analysis: ScopeAnalysis, pattern: AstNode, names: CxNames): boolean {
  return nodesAt(pattern, 'properties').some((property) => {
    const key = propertyNameOf(nodeAt(property, 'key'), property.computed === true)
    if (key === undefined) return false
    if (INHERITED_NAMES.has(key)) return true
    return isCxName(names, key) && isBoundNameCarried(analysis, property)
  })
}

/**
 * Whether `member` is called with its object as the receiver: `ns.x()`, `ns.x?.()`, `(ns.x)()` or a
 * tagged template `` ns.x`...` ``. A call through a sequence (`(0, ns.x)()`) has none.
 */
function isCalledWithReceiver(analysis: ScopeAnalysis, member: AstNode): boolean {
  let node = member
  let parent = analysis.parentOf.get(node)
  while (parent?.type === 'ParenthesizedExpression') {
    node = parent
    parent = analysis.parentOf.get(node)
  }
  if (parent?.type === 'CallExpression') return nodeAt(parent, 'callee') === node
  return parent?.type === 'TaggedTemplateExpression' && nodeAt(parent, 'tag') === node
}

/**
 * Whether a use of a namespace import reads a member by an inherited name, calls a member that is
 * not a `cx` export with the namespace as its receiver (it may return `this`), or carries a `cx`
 * export it reads (`ns.cn`, or a name destructured from it) on where the build cannot follow it.
 */
function isUseCarried(analysis: ScopeAnalysis, node: AstNode, names: CxNames): boolean {
  const read = memberReadOf({ analysis }, node)
  if (read) {
    if (read.key === undefined) return isCalledWithReceiver(analysis, read.member)
    if (INHERITED_NAMES.has(read.key)) return true
    if (!isCxName(names, read.key)) return isCalledWithReceiver(analysis, read.member)
    return isValueCarried(analysis, read.member)
  }
  const pattern = patternDestructuring({ analysis }, node)
  return pattern?.type === 'ObjectPattern' && isPatternCarried(analysis, pattern, names)
}

/**
 * The held take of a namespace import of `source` when any of its `references` reads a member by an
 * inherited name, or carries a `cx` export read off it on; otherwise `undefined`.
 */
export function heldNamespace(
  analysis: ScopeAnalysis,
  references: readonly Reference[],
  names: CxNames,
  source: string,
): Taken | undefined {
  const isCarried = references.some(({ node }) => isUseCarried(analysis, node, names))
  return isCarried ? withHeld({ shape: 'namespace', names: [] }, source) : undefined
}

/**
 * A dependency's take of the whole module that is not a forward, which the build cannot read to
 * the exports it uses: held.
 */
export function withHeld(taken: Taken, source: string): Taken {
  const isWhole = taken.names.length === 0 && taken.isForward !== true
  if (!isWhole || taken.shape === 'names' || taken.shape === 'star') return taken
  const form =
    taken.shape === 'namespace'
      ? `uses the namespace of ${source} where the build cannot follow it`
      : `imports ${source} and uses it where the build cannot follow it`
  return { ...taken, isHeld: true, form }
}
