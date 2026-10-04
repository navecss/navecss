/**
 * The few shapes of the ESTree `this.parse` returns that the collector reads, declared here
 * rather than imported: the plugin takes no dependency, and a node is read through a handful of
 * typed accessors instead of a full ESTree type package.
 */

export interface AstNode {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [key: string]: unknown
}

/**
 * Whether `value` is an AST node.
 */
export function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/**
 * The node held under `key`, or `undefined` when that slot holds none.
 */
export function nodeAt(node: AstNode, key: string): AstNode | undefined {
  const value = node[key]
  return isNode(value) ? value : undefined
}

/**
 * The nodes held under `key` (an array slot), skipping holes such as the elisions of `[, a]`.
 */
export function nodesAt(node: AstNode, key: string): AstNode[] {
  const value = node[key]
  return Array.isArray(value) ? value.filter((item) => isNode(item)) : []
}

/**
 * The string held under `key`, or `undefined`.
 */
export function stringAt(node: AstNode, key: string): string | undefined {
  const value = node[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Every direct child node of `node`, in source order of its keys.
 */
export function childrenOf(node: AstNode): AstNode[] {
  return Object.values(node).flatMap((value) => {
    if (Array.isArray(value)) return value.filter((item) => isNode(item))
    return isNode(value) ? [value] : []
  })
}

/**
 * The text a string-valued node stands for: a string literal, or a template literal with no
 * substitutions. `undefined` for anything else.
 */
export function staticStringOf(node: AstNode | undefined): string | undefined {
  if (!node) return undefined
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : undefined
  }
  if (node.type !== 'TemplateLiteral' || nodesAt(node, 'expressions').length > 0) return undefined
  const quasi = nodesAt(node, 'quasis')[0]
  const value = quasi?.value
  if (typeof value !== 'object' || value === null) return undefined
  const cooked = (value as { cooked?: unknown }).cooked
  return typeof cooked === 'string' ? cooked : undefined
}

/**
 * The name a property key spells when it is not computed: `a` in `o.a` and `{ a: 1 }`, or the
 * string of `{ 'a': 1 }`; with `isComputed` set, only a string literal counts (`o['a']`).
 */
export function propertyNameOf(key: AstNode | undefined, isComputed: boolean): string | undefined {
  if (!key) return undefined
  if (!isComputed && key.type === 'Identifier') return stringAt(key, 'name')
  return staticStringOf(key)
}
