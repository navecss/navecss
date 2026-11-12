/**
 * Where a value of Nave's `cx` goes inside one module: the binding itself, or a `cx` export the
 * module imports from another. Each use of the value is a call (the module's own call), an export
 * (the value leaves under that name), a harmless read, a further alias of the value that is
 * followed in turn, or something else, which carries the value where the build cannot follow it.
 * The reader and the walk through a dependency's forwards both ask this, so they agree on which
 * uses are which.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { exportNameOf, nodeAt, nodesAt, propertyNameOf, pushAll, wrappedBy } from './vite-ast.ts'

/**
 * Where a value goes: the export names it reaches, whether any use of it is a call, and whether
 * any use of it leaves the module where the build cannot follow it.
 */
export interface Flow {
  readonly isCalled: boolean
  readonly isUnbound: boolean
  readonly names: ReadonlySet<string>
}

type Step =
  | { readonly exportedAs?: string; readonly init: AstNode; readonly kind: 'aliased' }
  | { readonly kind: 'called' }
  | { readonly kind: 'exported'; readonly name: string }
  | { readonly kind: 'safe' }
  | { readonly kind: 'unbound' }

const CALLED: Step = { kind: 'called' }
const SAFE: Step = { kind: 'safe' }
const UNBOUND: Step = { kind: 'unbound' }

/**
 * The parents under which a value is only tested, computed on or printed, so it cannot be carried
 * on: `typeof x`, `x + 1`, `` `${x}` ``, and a statement that is the value alone.
 */
const HARMLESS_PARENTS: ReadonlySet<string> = new Set([
  'BinaryExpression',
  'ExpressionStatement',
  'TemplateLiteral',
  'UnaryExpression',
])

/**
 * The parents whose `test` slot only reads the value.
 */
const TESTING_PARENTS: ReadonlySet<string> = new Set([
  'ConditionalExpression',
  'DoWhileStatement',
  'ForStatement',
  'IfStatement',
  'WhileStatement',
])

/**
 * `node`, or the expression above it when it sits inside a parenthesis or a type assertion
 * (`x as T`, `x satisfies T`, `x!`), which leave the value as it is.
 */
function unwrapped(analysis: ScopeAnalysis, node: AstNode): AstNode {
  let current = node
  for (;;) {
    const parent = analysis.parentOf.get(current)
    if (!parent || wrappedBy(parent) !== current) return current
    current = parent
  }
}

/**
 * The name `export const name = ...` gives a declarator, when it is one.
 */
function ownExportOf(analysis: ScopeAnalysis, declarator: AstNode): string | undefined {
  const declaration = analysis.parentOf.get(declarator)
  const statement = declaration && analysis.parentOf.get(declaration)
  if (statement?.type !== 'ExportNamedDeclaration') return undefined
  const id = nodeAt(declarator, 'id')
  return id ? exportNameOf(id) : undefined
}

/**
 * Whether a destructuring pattern reads members by static keys other than `bind`, and nothing
 * else: no rest element, no computed key. Such a pattern takes members of the value, never the
 * value itself.
 */
function isMemberPattern(pattern: AstNode): boolean {
  if (pattern.type !== 'ObjectPattern') return false
  return nodesAt(pattern, 'properties').every((property) => {
    if (property.type !== 'Property') return false
    const name = propertyNameOf(nodeAt(property, 'key'), property.computed === true)
    return name !== undefined && name !== 'bind'
  })
}

/**
 * What a declarator that holds the value does with it.
 */
function declaredStep(analysis: ScopeAnalysis, declarator: AstNode, init: AstNode): Step {
  const id = nodeAt(declarator, 'id')
  if (id?.type === 'Identifier') {
    const exportedAs = ownExportOf(analysis, declarator)
    return { kind: 'aliased', init, ...(exportedAs !== undefined && { exportedAs }) }
  }
  return id && isMemberPattern(id) ? SAFE : UNBOUND
}

/**
 * What a member read of the value does with it: `cx.bind` returns a callable `cx`, and a key the
 * build cannot read may be `bind`; every other member is read for itself.
 */
function memberStep(node: AstNode): Step {
  const name = propertyNameOf(nodeAt(node, 'property'), node.computed === true)
  return name === undefined || name === 'bind' ? UNBOUND : SAFE
}

/**
 * What an export statement above the value does with it.
 */
function exportStep(parent: AstNode): Step {
  if (parent.type === 'ExportDefaultDeclaration') return { kind: 'exported', name: 'default' }
  const name = exportNameOf(nodeAt(parent, 'exported'))
  return name === undefined ? UNBOUND : { kind: 'exported', name }
}

/**
 * What a parent that only reads the value does with it: it tests it, computes on it, spreads it
 * into an object (which copies only what `cx` carries as properties; any other spread throws), or
 * holds it in a sequence, where the last expression is the value of the whole.
 */
function readingStep(analysis: ScopeAnalysis, top: AstNode, parent: AstNode): Step {
  const { type } = parent
  if (TESTING_PARENTS.has(type)) return nodeAt(parent, 'test') === top ? SAFE : UNBOUND
  if (type === 'SpreadElement' || HARMLESS_PARENTS.has(type)) return SAFE
  if (type !== 'SequenceExpression') return UNBOUND
  return nodesAt(parent, 'expressions').at(-1) === top ? stepOf(analysis, parent) : SAFE
}

/**
 * What the parent of `top` does with the value.
 */
function stepAbove(analysis: ScopeAnalysis, top: AstNode, parent: AstNode): Step {
  switch (parent.type) {
    case 'CallExpression': {
      return nodeAt(parent, 'callee') === top ? CALLED : UNBOUND
    }
    case 'ExportDefaultDeclaration':
    case 'ExportSpecifier': {
      return exportStep(parent)
    }
    case 'MemberExpression': {
      return nodeAt(parent, 'object') === top ? memberStep(parent) : SAFE
    }
    case 'VariableDeclarator': {
      return nodeAt(parent, 'init') === top ? declaredStep(analysis, parent, top) : SAFE
    }
    default: {
      return readingStep(analysis, top, parent)
    }
  }
}

/**
 * What the use at `node` does with the value.
 */
function stepOf(analysis: ScopeAnalysis, node: AstNode): Step {
  const top = unwrapped(analysis, node)
  const parent = analysis.parentOf.get(top)
  return parent ? stepAbove(analysis, top, parent) : UNBOUND
}

/**
 * The uses of the alias declared with `init`, and whether anything writes to it.
 */
function usesOfAlias(
  analysis: ScopeAnalysis,
  init: AstNode,
): { readonly isWritten: boolean; readonly nodes: AstNode[] } {
  const uses = analysis.references.filter(({ binding }) => binding?.init === init)
  return {
    isWritten: uses.some(({ binding }) => (binding?.writes ?? 0) > 0),
    nodes: uses.map(({ node }) => node),
  }
}

/**
 * Where the value used at `start` goes, following every alias of it through the module. An alias
 * is a `const`, or a `let` or `var` nothing writes to, declared with the value as its initialiser;
 * every reference of it is read the same way. An alias that is written to after its declaration is
 * unbound, since the build cannot tell which value it holds.
 */
export function flowOf(analysis: ScopeAnalysis, start: AstNode): Flow {
  const names = new Set<string>()
  const state = { isCalled: false, isUnbound: false }
  const seen = new Set<AstNode>()
  const stack = [start]
  while (stack.length > 0 && !state.isUnbound) {
    const node = stack.pop()!
    if (seen.has(node)) continue
    seen.add(node)
    followStep(stepOf(analysis, node), { analysis, names, stack, state })
  }
  return { ...state, names }
}

interface Walk {
  readonly analysis: ScopeAnalysis
  readonly names: Set<string>
  readonly stack: AstNode[]
  readonly state: { isCalled: boolean; isUnbound: boolean }
}

/**
 * Takes one step of the walk: records where the value went, and queues the uses of an alias.
 */
function followStep(step: Step, walk: Walk): void {
  const { analysis, names, stack, state } = walk
  if (step.kind === 'aliased') {
    if (step.exportedAs !== undefined) names.add(step.exportedAs)
    const alias = usesOfAlias(analysis, step.init)
    state.isUnbound = alias.isWritten
    pushAll(stack, alias.nodes)
    return
  }
  if (step.kind === 'exported') names.add(step.name)
  state.isCalled ||= step.kind === 'called'
  state.isUnbound ||= step.kind === 'unbound'
}
