/**
 * The equivalence between two outputs: one reference parser (PostCSS, a test dependency only)
 * reads both into the same tree, meaning the same node kinds in the same order and nesting; rules
 * match on selector with whitespace runs collapsed, at-rules on ASCII-lowercased name and
 * whitespace-collapsed prelude, declarations on property, whitespace-collapsed value and the
 * `!important` flag, comments on text; whitespace and semicolon raws are ignored.
 */
import postcss, { type ChildNode, type Container } from 'postcss'

/**
 * Reduces one PostCSS node to the plain shape the equivalence compares, children included.
 */
function normalize(node: ChildNode): unknown {
  if (node.type === 'comment') return { type: 'comment', text: node.text }
  if (node.type === 'decl')
    return {
      type: 'decl',
      prop: node.prop,
      value: node.value.replaceAll(/\s+/g, ' '),
      important: node.important,
    }
  if (node.type === 'atrule') {
    return {
      type: 'atrule',
      name: node.name.toLowerCase(),
      params: node.params.replaceAll(/\s+/g, ' '),
      nodes: normalizeChildren(node),
    }
  }
  return {
    type: 'rule',
    selector: node.selector.replaceAll(/\s+/g, ' '),
    nodes: normalizeChildren(node),
  }
}

/**
 * Normalises every child of a container, in order.
 */
function normalizeChildren(container: Container): unknown[] {
  return (container.nodes ?? []).map((n) => normalize(n))
}

/**
 * True when both stylesheets parse to the same normalised tree.
 */
export function isEquivalent(cssA: string, cssB: string): boolean {
  const treeA = normalizeChildren(postcss.parse(cssA))
  const treeB = normalizeChildren(postcss.parse(cssB))
  return JSON.stringify(treeA) === JSON.stringify(treeB)
}
