/**
 * Shared helpers for the native-order tests: the two hosts that expand `@nave` (the PostCSS
 * plugin and the text expander), and a one-line-per-node reading of an output rule so a test can
 * state the order and nesting it expects without restating every declaration.
 */
import postcss, { type ChildNode, type Container, type Rule } from 'postcss'

import type { AtomDefinition } from '../../src/atoms.ts'

import { expandText, type ExpandTextOptions } from '../../src/directive/expand-text.ts'
import { navePlugin } from '../../src/postcss.ts'

export interface HostOptions {
  readonly extend?: Record<string, AtomDefinition>
  readonly from?: string
  readonly onUnknown?: 'warn' | 'error' | 'ignore'
}

/**
 * The PostCSS host's output for `css`.
 */
export async function viaPostcss(css: string, options: HostOptions = {}): Promise<string> {
  const plugin = navePlugin({
    onUnknown: options.onUnknown ?? 'warn',
    ...(options.extend && { extend: options.extend }),
  })
  const result = await postcss([plugin]).process(css, { from: options.from })
  return result.css
}

/**
 * The text expander's output for `css`.
 */
export function viaText(css: string, options: HostOptions = {}): string {
  const expandOptions: ExpandTextOptions = {
    onUnknown: options.onUnknown ?? 'warn',
    ...(options.extend && { extend: options.extend }),
    ...(options.from !== undefined && { from: options.from }),
  }
  return expandText(css, expandOptions).css
}

/**
 * What goes between the child before `index` and the child at it.
 */
function separatorBefore(nodes: readonly ChildNode[], index: number): string {
  if (index === 0) return ''
  return nodes[index - 1]!.type === 'comment' ? ' ' : '; '
}

/**
 * `nodes` on one line: joined with `; `, except that a comment is followed by a plain space.
 */
function renderChildren(nodes: readonly ChildNode[]): string {
  return nodes
    .map((child, index) => {
      return `${separatorBefore(nodes, index)}${renderNode(child)}`
    })
    .join('')
}

/**
 * `node` as one line: declarations as `prop: value`, comments as `/* text *\/`, rules and
 * at-rules with their children between braces, joined with `; `.
 */
export function renderNode(node: ChildNode): string {
  if (node.type === 'comment') return `/* ${node.text} */`
  if (node.type === 'decl') {
    const important = node.important ? ' !important' : ''
    return `${node.prop}: ${node.value.replaceAll(/\s+/g, ' ')}${important}`
  }
  const head =
    node.type === 'rule'
      ? node.selector.replaceAll(/\s+/g, ' ')
      : `@${node.name} ${node.params.replaceAll(/\s+/g, ' ')}`.trim()
  if (node.nodes === undefined) return head
  return `${head} { ${renderChildren(node.nodes)} }`
}

/**
 * The first rule of `css` whose selector is `selector`.
 */
function ruleOf(css: string, selector: string): Rule {
  let found: Rule | undefined
  postcss.parse(css).walkRules((rule) => {
    if (found === undefined && rule.selector === selector) found = rule
  })
  if (found === undefined) throw new Error(`no rule ${selector} in: ${css}`)
  return found
}

/**
 * Each child of the rule `selector` in `css`, rendered by `renderNode`.
 */
export function childrenOf(css: string, selector = '.x'): string[] {
  return ruleOf(css, selector).nodes.map((child) => renderNode(child))
}

/**
 * Each child of the rule `selector` in `css` reduced to its kind and head: `decl <prop>`,
 * `rule <selector>`, `at <name> <params>`, `comment`.
 */
export function kindsOf(css: string, selector = '.x'): string[] {
  return ruleOf(css, selector).nodes.map((child) => {
    if (child.type === 'decl') return `decl ${child.prop}`
    if (child.type === 'comment') return 'comment'
    if (child.type === 'rule') return `rule ${child.selector}`
    return `at ${child.name} ${child.params}`.trim()
  })
}

/**
 * The text of every declaration inside `container`, at any depth, in document order.
 */
export function declarationsIn(container: Container): string[] {
  const found: string[] = []
  container.walkDecls((decl) => {
    found.push(`${decl.prop}: ${decl.value}`)
  })
  return found
}
