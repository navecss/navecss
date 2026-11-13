/**
 * Whether the result of a dependency's CommonJS require, or of a dynamic import it awaits or hands
 * to a `then` callback, is used as calls only: it is bound to a name, or destructured into names, or
 * a member of it is bound to a name, and every use of them is a call through a member (`m.cn(...)`,
 * `(0, m.cn)(...)` as the compilers write it) or a call of the name. Such a take is the package's
 * own call. A result that is passed on, stored, returned or assigned is not: the build cannot tell
 * where it goes.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { childrenOf, nodeAt, nodesAt, propertyNameOf, pushAll, staticStringOf } from './vite-ast.ts'
import { flowOf } from './vite-cx-flow.ts'
import { unwrappedFromInterop } from './vite-require-interop.ts'
import { analyze } from './vite-scope.ts'

/**
 * The names every object and every function inherits, read from the engine so a name the platform
 * adds later is held too. A key that is one of them does not name an export of the module taken:
 * some (`valueOf`, `bind`, `__lookupGetter__`) return the module or a function over it.
 */
const INHERITED_NAMES: ReadonlySet<string> = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  ...Object.getOwnPropertyNames(Function.prototype),
])

/**
 * Whether `key`, a member key of the module taken, names one of its exports: a static string that
 * is not an inherited name. A key computed from anything but a string may name any member.
 */
function isExportKey(key: string | undefined): key is string {
  return key !== undefined && !INHERITED_NAMES.has(key)
}

/**
 * Whether `callee` is called: `callee(...)`, or the last of a sequence that is called, which is how
 * the compilers write a call through an import (`(0, m.cn)(...)`).
 */
function isCalled(analysis: ScopeAnalysis, node: AstNode): boolean {
  const parent = analysis.parentOf.get(node)
  if (parent?.type === 'CallExpression') return nodeAt(parent, 'callee') === node
  if (parent?.type !== 'SequenceExpression') return false
  return nodesAt(parent, 'expressions').at(-1) === node && isCalled(analysis, parent)
}

/**
 * Whether the use at `node` of a module's exports object is the object of a member that is called,
 * by a key that names an export.
 */
function isMemberCall(analysis: ScopeAnalysis, node: AstNode): boolean {
  const member = analysis.parentOf.get(node)
  if (member?.type !== 'MemberExpression' || nodeAt(member, 'object') !== node) return false
  const key = propertyNameOf(nodeAt(member, 'property'), member.computed === true)
  return isExportKey(key) && isCalled(analysis, member)
}

/**
 * The names a plain destructuring `{ a, b: c }` binds, or `undefined` when it holds anything else
 * (a rest element, a computed key, a default, a nested pattern, a key that is no export's name).
 */
function destructuredNames(pattern: AstNode): string[] | undefined {
  if (pattern.type !== 'ObjectPattern') return undefined
  const names: string[] = []
  for (const property of nodesAt(pattern, 'properties')) {
    const value = nodeAt(property, 'value')
    const key = propertyNameOf(nodeAt(property, 'key'), property.computed === true)
    if (!isExportKey(key) || property.type !== 'Property' || value?.type !== 'Identifier') {
      return undefined
    }
    names.push(value.name as string)
  }
  return names
}

/**
 * Whether every reference to a binding called one of `names`, parameters aside, is `isUse`d. A
 * same-named binding elsewhere can only hold a take, and one written after its declaration (`var m
 * = 1` after `var m = require(...)`) may have held the result before, so it is not calls only.
 */
function isOnlyUsedAs(
  analysis: ScopeAnalysis,
  names: readonly string[],
  isUse: (node: AstNode) => boolean,
): boolean {
  const matching = analysis.references.filter(
    ({ binding }) =>
      binding !== undefined && binding.kind !== 'param' && names.includes(binding.name),
  )
  return matching.every(({ binding, node }) => binding!.writes === 0 && isUse(node))
}

/**
 * Whether `pattern` binds names that are only called through a member (an identifier), or only
 * called (a plain destructuring), `isUsedAs` checking the uses of the names.
 */
function isBoundAndCalled(
  analysis: ScopeAnalysis,
  pattern: AstNode | undefined,
  isUsedAs: (names: readonly string[], isUse: (node: AstNode) => boolean) => boolean,
): boolean {
  if (pattern?.type === 'Identifier') {
    return isUsedAs([pattern.name as string], (node) => isMemberCall(analysis, node))
  }
  const names = pattern && destructuredNames(pattern)
  return names !== undefined && isUsedAs(names, (node) => isCalled(analysis, node))
}

/**
 * Whether `declarator` declares names an `export` gives out (`export const m = ...`): they leave
 * the module with no reference to read, so the take is never calls only.
 */
function isExportedDeclarator(analysis: ScopeAnalysis, declarator: AstNode): boolean {
  const declaration = analysis.parentOf.get(declarator)
  return (
    declaration !== undefined &&
    analysis.parentOf.get(declaration)?.type === 'ExportNamedDeclaration'
  )
}

/**
 * Whether the declarator that holds the result `top` binds it to names that are only called.
 */
function isDeclaredAndCalled(analysis: ScopeAnalysis, declarator: AstNode, top: AstNode): boolean {
  if (nodeAt(declarator, 'init') !== top || isExportedDeclarator(analysis, declarator)) return false
  return isBoundAndCalled(analysis, nodeAt(declarator, 'id'), (names, isUse) =>
    isOnlyUsedAs(analysis, names, isUse),
  )
}

/**
 * Whether `member`, a read of a named member of the result, initialises a name that is only called
 * (`const cn = require('./cn.js').cn`, then `cn(...)`).
 */
function isMemberDeclaredAndCalled(analysis: ScopeAnalysis, member: AstNode): boolean {
  const name = propertyNameOf(nodeAt(member, 'property'), member.computed === true)
  const declarator = analysis.parentOf.get(member)
  if (!isExportKey(name) || declarator?.type !== 'VariableDeclarator') return false
  if (isExportedDeclarator(analysis, declarator)) return false
  const id = nodeAt(declarator, 'id')
  if (nodeAt(declarator, 'init') !== member || id?.type !== 'Identifier') return false
  return isOnlyUsedAs(analysis, [id.name as string], (node) => isCalled(analysis, node))
}

/**
 * Whether `callback`'s first parameter, the module a dynamic import resolves to, is only called
 * through. The callback must be an arrow function, which has no `arguments` of its own to reach the
 * module by; every reference of the parameter's names inside it counts, whatever binds it there.
 */
function isCallbackCalledOnly(analysis: ScopeAnalysis, callback: AstNode | undefined): boolean {
  if (callback?.type !== 'ArrowFunctionExpression') return false
  const parameter = nodesAt(callback, 'params')[0]
  if (!parameter) return true
  const isInside = (node: AstNode): boolean =>
    node.start >= callback.start && node.end <= callback.end
  return isBoundAndCalled(analysis, parameter, (names, isUse) =>
    analysis.references
      .filter(({ node }) => isInside(node) && names.includes(node.name as string))
      .every(({ node }) => isUse(node)),
  )
}

/**
 * Whether the promise of an `import()` that is not awaited is used as calls only: evaluated for its
 * effect, or handed to `.then` with a callback that only calls through the module.
 */
function isPromiseUsedAsCallsOnly(analysis: ScopeAnalysis, promise: AstNode): boolean {
  const member = analysis.parentOf.get(promise)
  if (member?.type === 'ExpressionStatement') return true
  if (member?.type !== 'MemberExpression' || nodeAt(member, 'object') !== promise) return false
  const name = propertyNameOf(nodeAt(member, 'property'), member.computed === true)
  const call = analysis.parentOf.get(member)
  if (name !== 'then' || call?.type !== 'CallExpression' || nodeAt(call, 'callee') !== member) {
    return false
  }
  return isCallbackCalledOnly(analysis, nodesAt(call, 'arguments')[0])
}

/**
 * Whether an `await` sits between `node` and `top`, the node it unwraps to.
 */
function isAwaitedUpTo(analysis: ScopeAnalysis, node: AstNode, top: AstNode): boolean {
  let current: AstNode | undefined = node
  while (current && current !== top) {
    current = analysis.parentOf.get(current)
    if (current?.type === 'AwaitExpression') return true
  }
  return false
}

/**
 * Whether the result `top`, the require or the awaited import with any interop helper around it, is
 * used as calls only.
 */
function isResultUsedAsCallsOnly(analysis: ScopeAnalysis, top: AstNode): boolean {
  const parent = analysis.parentOf.get(top)
  if (parent?.type === 'ExpressionStatement') return true
  if (parent?.type === 'MemberExpression') {
    return isMemberCall(analysis, top) || isMemberDeclaredAndCalled(analysis, parent)
  }
  return parent?.type === 'VariableDeclarator' && isDeclaredAndCalled(analysis, parent, top)
}

/**
 * Whether the name `import x = require(...)` binds is only called through a member. The statement
 * is not an expression the result flows out of, so a name it exports leaves the module whole.
 */
function isEqualsDeclaredAndCalled(analysis: ScopeAnalysis, declaration: AstNode): boolean {
  if (analysis.parentOf.get(declaration)?.type === 'ExportNamedDeclaration') return false
  return isBoundAndCalled(analysis, nodeAt(declaration, 'id'), (names, isUse) =>
    isOnlyUsedAs(analysis, names, isUse),
  )
}

/**
 * Whether the require at `require` is used as calls only. A module that evaluates text can reach
 * any name in it, so it never is.
 */
export function isUsedAsCallsOnly(analysis: ScopeAnalysis, require: AstNode): boolean {
  if (analysis.hasDirectEval) return false
  if (require.type === 'TSImportEqualsDeclaration') {
    return isEqualsDeclaredAndCalled(analysis, require)
  }
  const top = unwrappedFromInterop(analysis, require)
  if (require.type === 'ImportExpression' && !isAwaitedUpTo(analysis, require, top)) {
    return isPromiseUsedAsCallsOnly(analysis, top)
  }
  return isResultUsedAsCallsOnly(analysis, top)
}

/**
 * Every node of the tree, parents first.
 */
function allNodes(program: AstNode): AstNode[] {
  const found: AstNode[] = []
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    found.push(node)
    pushAll(stack, childrenOf(node))
  }
  return found
}

/**
 * The node that imports the module named by the string at `offset`: the require or dynamic import
 * that holds it, or the import declaration.
 */
function importAt(nodes: readonly AstNode[], offset: number): AstNode | undefined {
  return nodes.find((node) => {
    const literal =
      node.type === 'CallExpression'
        ? nodesAt(node, 'arguments')[0]
        : (nodeAt(node, 'source') ?? nodeAt(nodeAt(node, 'moduleReference') ?? node, 'expression'))
    return literal?.start === offset && node.type !== 'Literal'
  })
}

/**
 * Whether the names an import declaration binds are handed out: some use of them is not a call.
 */
function isDeclarationHandedOut(analysis: ScopeAnalysis, declaration: AstNode): boolean {
  const source = staticStringOf(nodeAt(declaration, 'source'))
  return analysis.references
    .filter(({ binding }) => binding?.kind === 'import' && binding.source === source)
    .some(({ node }) => {
      const flow = flowOf(analysis, node)
      return flow.isUnbound || flow.names.size > 0
    })
}

/**
 * Whether a module of a dependency hands out the Nave `cx` it imports in a form the build does not
 * bind (a `require()`, a dynamic import, or a specifier other than the package's own), the string
 * naming it starting at `offset`: its result is used for more than calls, or the build cannot find
 * the import. A `cx` that is only called is the package's own call.
 */
export function isImportedCxHandedOut(program: AstNode, offset: number): boolean {
  const analysis = analyze(program)
  const node = importAt(allNodes(program), offset)
  if (!node) return true
  if (node.type === 'ImportDeclaration') return isDeclarationHandedOut(analysis, node)
  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') return true
  return !isUsedAsCallsOnly(analysis, node)
}
