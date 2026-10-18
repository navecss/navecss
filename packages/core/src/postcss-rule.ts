/**
 * Expands the `@nave` directives of one PostCSS style rule: reads the rule into the host-free
 * model, has the core plan it (`planRule()`), and applies the plan to the tree.
 */
import type { ChildNode, AtRule as PostCSSAtRule, Rule } from 'postcss'

import type { ModelNode, PlanItem } from './directive/rule-model.ts'
import type { DirectiveContext } from './postcss-at-rule.ts'

import { DirectiveFailure, planRule } from './directive/rule-plan.ts'
import {
  handleAtRule,
  hasBlock,
  matchNaveAtRule,
  reportDiagnostic,
  throwMalformedAtom,
} from './postcss-at-rule.ts'
import { insertEmissions, wrapRun } from './postcss-emit.ts'
import { isInsideKeyframes } from './postcss-node-utils.ts'

type RuleContext = Omit<DirectiveContext, 'atRule'>

const GROUP_NAMES = new Set(['container', 'media', 'supports'])

/**
 * The PostCSS node behind each `ref`, in the order the model was read.
 */
type NodeTable = ChildNode[]

/**
 * One at-rule child of the rule as a model node: a directive, a conditional group whose content is
 * read, or an opaque nested node.
 */
function atRuleToModel(atRule: PostCSSAtRule, table: NodeTable): ModelNode {
  const ref = table.length
  table.push(atRule)
  const match = matchNaveAtRule(atRule)
  if (match.isNave) return { kind: 'directive', ref, prelude: match.prelude }
  const name = atRule.name.toLowerCase()
  if (!GROUP_NAMES.has(name) || atRule.nodes === undefined) return { kind: 'opaque', ref }
  return { kind: 'group', ref, name, prelude: atRule.params, nodes: childrenToModel(atRule, table) }
}

/**
 * One child of a rule as a model node.
 */
function toModel(node: ChildNode, table: NodeTable): ModelNode {
  if (node.type === 'atrule') return atRuleToModel(node, table)
  const ref = table.length
  table.push(node)
  if (node.type === 'decl') {
    return { kind: 'decl', ref, prop: node.prop, value: node.value, important: node.important }
  }
  if (node.type === 'comment') return { kind: 'comment', ref }
  return { kind: 'rule', ref, selector: node.selector, nodes: childrenToModel(node, table) }
}

/**
 * Every child of `container` as a model node, in order.
 */
function childrenToModel(container: Rule | PostCSSAtRule, table: NodeTable): ModelNode[] {
  return (container.nodes ?? []).map((child) => toModel(child, table))
}

/**
 * The model of `rule`, and the table that turns a `ref` back into its node.
 */
function readRule(rule: Rule): { nodes: ModelNode[]; table: NodeTable } {
  const table: NodeTable = []
  return { table, nodes: childrenToModel(rule, table) }
}

/**
 * Whether `rule` has a `@nave` directive among its own children.
 */
function hasDirective(rule: Rule): boolean {
  return rule.nodes.some((node) => node.type === 'atrule' && matchNaveAtRule(node).isNave)
}

/**
 * Applies one plan item to the tree.
 */
function applyItem(item: PlanItem, table: NodeTable, ctx: RuleContext): void {
  if (item.kind === 'keep') return
  if (item.kind === 'wrap') {
    const source = (table[item.after] as PostCSSAtRule).source
    wrapRun(
      item.refs.map((ref) => table[ref]!),
      source,
    )
    return
  }
  const atRule = table[item.ref] as PostCSSAtRule
  const match = matchNaveAtRule(atRule)
  const fullCtx: DirectiveContext = { ...ctx, atRule }
  for (const diagnostic of item.diagnostics) {
    reportDiagnostic(diagnostic, fullCtx, match.preludeStartIndex)
  }
  if (hasBlock(atRule)) {
    reportDiagnostic(
      { code: 'has-block', offset: 0, endOffset: atRule.toString().length },
      fullCtx,
      match.preludeStartIndex,
    )
  }
  insertEmissions(atRule, item.emissions)
  atRule.remove()
}

/**
 * The plan for `rule`, a directive that cannot be planned reported as an error at its own place.
 */
function planOrThrow(
  rule: Rule,
  nodes: ModelNode[],
  table: NodeTable,
  ctx: RuleContext,
): readonly PlanItem[] {
  try {
    return planRule({
      selector: rule.selector,
      nodes,
      isInsideKeyframes: isInsideKeyframes(rule),
      extend: ctx.extend,
    }).items
  } catch (error) {
    if (error instanceof DirectiveFailure) {
      return throwMalformedAtom(table[error.ref] as PostCSSAtRule, error.cause)
    }
    throw error
  }
}

/**
 * Expands every `@nave` directly in `rule`.
 */
export function handleRule(rule: Rule, ctx: RuleContext): void {
  if (!hasDirective(rule)) return
  const { table, nodes } = readRule(rule)
  for (const item of planOrThrow(rule, nodes, table, ctx)) applyItem(item, table, ctx)
}

/**
 * Whether no `@nave` follows `atRule` in its parent.
 */
function isLastDirective(parent: Rule, atRule: PostCSSAtRule): boolean {
  return parent.nodes
    .slice(parent.index(atRule) + 1)
    .every((node) => !(node.type === 'atrule' && matchNaveAtRule(node).isNave))
}

/**
 * The plugin's `AtRule` visitor. A directive directly in a style rule is expanded together with
 * its siblings, once every one of them has been visited, so a plugin ahead of this one that
 * rewrites a directive's prelude on its visit has done so before the rule is read. Any other
 * directive is refused.
 */
export function handleDirective(atRule: PostCSSAtRule, ctx: RuleContext): void {
  const parent = atRule.parent
  if (parent?.type !== 'rule') {
    handleAtRule(atRule, ctx)
    return
  }
  if (matchNaveAtRule(atRule).isNave && isLastDirective(parent, atRule)) handleRule(parent, ctx)
}
