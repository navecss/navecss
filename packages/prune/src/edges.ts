/**
 * The imports a parsed module makes: the edges of the graph.
 */
import type { AstNode } from '@navecss/core/collect'

export interface Edge {
  readonly specifier: string
  /**
   * The offset of the specifier's opening quote.
   */
  readonly offset: number
  /**
   * Whether the edge is a `require()` call, which resolves under the `require` condition.
   */
  readonly isRequire: boolean
}

const DECLARATIONS = new Set([
  'ExportAllDeclaration',
  'ExportNamedDeclaration',
  'ImportDeclaration',
])

type Node = Record<string, unknown> & { start?: number; type?: string }

/**
 * The string literal a node is, if it is one.
 */
function literalOf(node: unknown): { start: number; value: string } | undefined {
  const literal = node as Node | undefined
  if (literal?.type !== 'Literal' || typeof literal.value !== 'string') return undefined
  return { value: literal.value, start: literal.start ?? 0 }
}

/**
 * Whether every specifier of an import or export is a `type` one (and there is at least one).
 */
function isEveryTypeSpecifier(node: Node): boolean {
  const specifiers = node.specifiers as Node[] | undefined
  if (!specifiers || specifiers.length === 0) return false
  return specifiers.every((specifier) => {
    return specifier.importKind === 'type' || specifier.exportKind === 'type'
  })
}

/**
 * The edge a module-level node makes, if it makes one.
 */
function declarationEdge(node: Node): Edge | undefined {
  if (!DECLARATIONS.has(node.type ?? '')) return undefined
  if (node.importKind === 'type' || node.exportKind === 'type') return undefined
  if (isEveryTypeSpecifier(node)) return undefined
  const source = literalOf(node.source)
  return source && { specifier: source.value, offset: source.start, isRequire: false }
}

/**
 * The edge a call or dynamic import makes, if it makes one with a string literal.
 */
function callEdge(node: Node): Edge | undefined {
  if (node.type === 'ImportExpression') {
    const source = literalOf(node.source)
    return source && { specifier: source.value, offset: source.start, isRequire: false }
  }
  if (node.type !== 'CallExpression') return undefined
  const callee = node.callee as Node | undefined
  const args = node.arguments as unknown[]
  if (callee?.type !== 'Identifier' || callee.name !== 'require' || args.length !== 1) {
    return undefined
  }
  const source = literalOf(args[0])
  return source && { specifier: source.value, offset: source.start, isRequire: true }
}

/**
 * The edge a TypeScript `import x = require('y')` makes.
 */
function equalsEdge(node: Node): Edge | undefined {
  if (node.type !== 'TSExternalModuleReference') return undefined
  const source = literalOf(node.expression)
  return source && { specifier: source.value, offset: source.start, isRequire: true }
}

/**
 * Every edge of the module, in source order.
 */
export function edgesOf(program: AstNode): Edge[] {
  const edges: Edge[] = []
  const stack: unknown[] = [program]
  while (stack.length > 0) {
    const value = stack.pop()
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push(value[index])
      continue
    }
    if (typeof value !== 'object' || value === null) continue
    const node = value as Node
    const edge = declarationEdge(node) ?? callEdge(node) ?? equalsEdge(node)
    if (edge) edges.push(edge)
    for (const key of Object.keys(node).toReversed()) stack.push(node[key])
  }
  return edges.toSorted((a, b) => a.offset - b.offset)
}
