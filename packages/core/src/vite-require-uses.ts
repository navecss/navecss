/**
 * Whether the result of a dependency's CommonJS require, or of a dynamic import it awaits, is used
 * as calls only: it is bound to a name, or destructured into names, and every use of them is a call
 * through a member (`m.cn(...)`, `(0, m.cn)(...)` as the compilers write it) or a call of a
 * destructured name. Such a take is the package's own call. A result that is passed on, stored,
 * returned or assigned is not: the build cannot tell where it goes.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { childrenOf, nodeAt, nodesAt, propertyNameOf, pushAll, staticStringOf } from './vite-ast.ts'
import { isTslibMember } from './vite-commonjs-emits.ts'
import { memberOf } from './vite-commonjs-exports.ts'
import { flowOf } from './vite-cx-flow.ts'
import { analyze } from './vite-scope.ts'

/**
 * The helpers the compilers wrap the result of a require in when the importing module takes a
 * default or a namespace.
 */
const INTEROP_HELPERS: ReadonlySet<string> = new Set([
  '__importDefault',
  '__importStar',
  '__toESM',
  '_interop_require_default',
  '_interop_require_wildcard',
  '_interopRequireDefault',
  '_interopRequireWildcard',
])

/**
 * Whether `callee` is one of those helpers: a name the module declares itself, or a member of the
 * `tslib` it requires.
 */
function isInteropCallee(analysis: ScopeAnalysis, callee: AstNode | undefined): boolean {
  if (callee?.type === 'Identifier') {
    const binding = analysis.referenceOf(callee)?.binding
    const isDeclared =
      binding !== undefined && binding.kind !== 'import' && binding.kind !== 'param'
    return INTEROP_HELPERS.has(callee.name as string) && isDeclared
  }
  const member = memberOf(callee)
  return member !== undefined && INTEROP_HELPERS.has(member.name) && isTslibMember(callee, analysis)
}

/**
 * `node`, or the call of an interop helper that wraps it, or the `await` of it, however deeply.
 */
function unwrappedFromInterop(analysis: ScopeAnalysis, node: AstNode): AstNode {
  let current = node
  for (;;) {
    const parent = analysis.parentOf.get(current)
    if (parent?.type === 'AwaitExpression') {
      current = parent
      continue
    }
    const args = parent ? nodesAt(parent, 'arguments') : []
    const isFirstArgument = parent?.type === 'CallExpression' && args[0] === current
    if (!parent || !isFirstArgument || !isInteropCallee(analysis, nodeAt(parent, 'callee'))) {
      return current
    }
    current = parent
  }
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
 * Whether the use at `node` of a module's exports object is the object of a member that is called.
 */
function isMemberCall(analysis: ScopeAnalysis, node: AstNode): boolean {
  const member = analysis.parentOf.get(node)
  if (member?.type !== 'MemberExpression' || nodeAt(member, 'object') !== node) return false
  return isCalled(analysis, member)
}

/**
 * The names a plain destructuring `{ a, b: c }` binds, or `undefined` when it holds anything else
 * (a rest element, a computed key, a default, a nested pattern).
 */
function destructuredNames(pattern: AstNode): string[] | undefined {
  if (pattern.type !== 'ObjectPattern') return undefined
  const names: string[] = []
  for (const property of nodesAt(pattern, 'properties')) {
    const value = nodeAt(property, 'value')
    const key = propertyNameOf(nodeAt(property, 'key'), property.computed === true)
    if (key === undefined || property.type !== 'Property' || value?.type !== 'Identifier') {
      return undefined
    }
    names.push(value.name as string)
  }
  return names
}

/**
 * Whether every reference to a name bound by the declarator is `isUse`d, the references being those
 * of bindings called `names` that the declaration introduced.
 */
function isOnlyUsedAs(
  analysis: ScopeAnalysis,
  input: { readonly init?: AstNode; readonly names?: readonly string[] },
  isUse: (node: AstNode) => boolean,
): boolean {
  const { init, names } = input
  return analysis.references
    .filter(({ binding }) => {
      if (init !== undefined) return binding?.init === init
      return binding !== undefined && names?.includes(binding.name) === true
    })
    .every(({ node }) => isUse(node))
}

/**
 * Whether the declarator that holds the result `top` binds it to names that are only called.
 */
function isDeclaredAndCalled(analysis: ScopeAnalysis, declarator: AstNode, top: AstNode): boolean {
  if (nodeAt(declarator, 'init') !== top) return false
  const id = nodeAt(declarator, 'id')
  if (id?.type === 'Identifier') {
    return isOnlyUsedAs(analysis, { init: top }, (node) => isMemberCall(analysis, node))
  }
  const names = id && destructuredNames(id)
  return (
    names !== undefined && isOnlyUsedAs(analysis, { names }, (node) => isCalled(analysis, node))
  )
}

/**
 * Whether the require at `require` is used as calls only. A module that evaluates text can reach
 * any name in it, so it never is.
 */
export function isUsedAsCallsOnly(analysis: ScopeAnalysis, require: AstNode): boolean {
  if (analysis.hasDirectEval) return false
  const top = unwrappedFromInterop(analysis, require)
  const parent = analysis.parentOf.get(top)
  if (parent?.type === 'ExpressionStatement') return true
  if (parent?.type === 'MemberExpression') return isMemberCall(analysis, top)
  return parent?.type === 'VariableDeclarator' && isDeclaredAndCalled(analysis, parent, top)
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
