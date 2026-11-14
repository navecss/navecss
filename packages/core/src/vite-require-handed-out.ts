/**
 * Whether a module of a dependency hands out the Nave `cx` it imports in a form the build does not
 * bind: see `isImportedCxHandedOut`.
 */
import type { AstNode } from './vite-ast.ts'
import type { ScopeAnalysis } from './vite-scope.ts'

import { childrenOf, nodeAt, nodesAt, pushAll, staticStringOf } from './vite-ast.ts'
import { flowOf } from './vite-cx-flow.ts'
import { isUsedAsCallsOnly } from './vite-require-uses.ts'
import { analyze } from './vite-scope.ts'

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
  return !isUsedAsCallsOnly(analysis, node, undefined)
}
