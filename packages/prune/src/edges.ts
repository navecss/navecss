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
 * The text of a template literal with no substitution, which names one module as a string does.
 */
function templateTextOf(node: Node): string | undefined {
  const quasis = node.quasis as { value?: { cooked?: unknown } }[] | undefined
  const expressions = node.expressions as unknown[] | undefined
  if (quasis?.length !== 1 || expressions?.length !== 0) return undefined
  const cooked = quasis[0]?.value?.cooked
  return typeof cooked === 'string' ? cooked : undefined
}

/**
 * The string a node is, if it is one: a string literal, or a template literal with no
 * substitution.
 */
function stringOf(node: Node | undefined): string | undefined {
  if (node?.type === 'TemplateLiteral') return templateTextOf(node)
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
}

/**
 * The string a node is, with where it starts, if it is one.
 */
function literalOf(node: unknown): { start: number; value: string } | undefined {
  const literal = node as Node | undefined
  const value = stringOf(literal)
  return value === undefined ? undefined : { value, start: literal?.start ?? 0 }
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
 * Whether a node is a call of `createRequire()`, as a name or as a member (`module.createRequire`).
 */
function isCreateRequireCall(node: Node | undefined): boolean {
  if (node?.type !== 'CallExpression') return false
  const callee = node.callee as Node | undefined
  if (callee?.type === 'Identifier') return callee.name === 'createRequire'
  const property =
    callee?.type === 'MemberExpression' ? (callee.property as Node | undefined) : undefined
  return property?.type === 'Identifier' && property.name === 'createRequire'
}

/**
 * Whether a callee is a `require` function: the name `require`, a name bound to the result of
 * `createRequire()`, or such a call itself. webpack bundles each statically on a Node target.
 */
function isRequireCallee(callee: Node | undefined, requireNames: ReadonlySet<string>): boolean {
  if (callee?.type === 'Identifier') {
    return callee.name === 'require' || requireNames.has(callee.name as string)
  }
  return isCreateRequireCall(callee)
}

/**
 * The edge a call or dynamic import makes, if it makes one with a string.
 */
function callEdge(node: Node, requireNames: ReadonlySet<string>): Edge | undefined {
  if (node.type === 'ImportExpression') {
    const source = literalOf(node.source)
    return source && { specifier: source.value, offset: source.start, isRequire: false }
  }
  if (node.type !== 'CallExpression') return undefined
  const args = node.arguments as unknown[]
  if (!isRequireCallee(node.callee as Node | undefined, requireNames) || args.length !== 1) {
    return undefined
  }
  const source = literalOf(args[0])
  return source && { specifier: source.value, offset: source.start, isRequire: true }
}

/**
 * The edge a TypeScript `import x = require('y')` makes; `import type x = require('y')` makes
 * none, since it emits nothing.
 */
function equalsEdge(node: Node): Edge | undefined {
  if (node.type !== 'TSImportEqualsDeclaration' || node.importKind === 'type') return undefined
  const reference = node.moduleReference as Node | undefined
  if (reference?.type !== 'TSExternalModuleReference') return undefined
  const source = literalOf(reference.expression)
  return source && { specifier: source.value, offset: source.start, isRequire: true }
}

/**
 * Every node of the tree, parents before children, in source order.
 */
function nodesOf(program: AstNode): Node[] {
  const nodes: Node[] = []
  const stack: unknown[] = [program]
  while (stack.length > 0) {
    const value = stack.pop()
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push(value[index])
      continue
    }
    if (typeof value !== 'object' || value === null) continue
    const node = value as Node
    nodes.push(node)
    for (const key of Object.keys(node).toReversed()) stack.push(node[key])
  }
  return nodes
}

/**
 * The names bound to the result of a `createRequire()` call.
 */
function requireNamesIn(nodes: readonly Node[]): Set<string> {
  const names = new Set<string>()
  for (const node of nodes) {
    const id = node.id as Node | undefined
    if (node.type !== 'VariableDeclarator' || id?.type !== 'Identifier') continue
    if (isCreateRequireCall(node.init as Node | undefined)) names.add(id.name as string)
  }
  return names
}

/**
 * Every edge of the module, in source order.
 */
export function edgesOf(program: AstNode): Edge[] {
  const nodes = nodesOf(program)
  const requireNames = requireNamesIn(nodes)
  const edges: Edge[] = []
  for (const node of nodes) {
    const edge = declarationEdge(node) ?? callEdge(node, requireNames) ?? equalsEdge(node)
    if (edge) edges.push(edge)
  }
  return edges.toSorted((a, b) => a.offset - b.offset)
}
