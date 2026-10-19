/**
 * Expands the `@nave` directives of one PostCSS style rule: reads the rule into the host-free
 * model, has the core plan it (`planRule()`), and applies the plan to the tree.
 */
import type { ChildNode, AtRule as PostCSSAtRule, Rule } from 'postcss'

import type { ModelNode, PlanItem, PlanWarning, RulePlan } from './directive/rule-model.ts'
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
import { reportWarning } from './postcss-warn.ts'

type RuleContext = Omit<DirectiveContext, 'atRule'>

const GROUP_NAMES = new Set(['container', 'media', 'supports'])

/**
 * The PostCSS node behind each `ref`, in the order the model was read.
 */
type NodeTable = ChildNode[]

/**
 * The model of the children of `container`, read when first asked for and then kept: nobody pays
 * for the content of a nested rule the order check never enters, however deep the nesting goes,
 * and nothing recurses to read it.
 */
function contentOf(container: Rule | PostCSSAtRule, table: NodeTable): () => readonly ModelNode[] {
  let nodes: readonly ModelNode[] | undefined
  return () => {
    nodes ??= (container.nodes ?? []).map((child) => toModel(child, table))
    return nodes
  }
}

/**
 * One child of a rule as a model node: a directive, a declaration, a comment, a rule or a
 * conditional group whose content is read on demand, or an opaque nested node.
 */
function toModel(node: ChildNode, table: NodeTable): ModelNode {
  const ref = table.length
  table.push(node)
  if (node.type === 'decl') {
    return { kind: 'decl', ref, prop: node.prop, value: node.value, important: node.important }
  }
  if (node.type === 'comment') return { kind: 'comment', ref }
  if (node.type === 'rule') {
    const content = contentOf(node, table)
    return {
      kind: 'rule',
      ref,
      selector: node.selector,
      get nodes() {
        return content()
      },
    }
  }
  const match = matchNaveAtRule(node)
  if (match.isNave) return { kind: 'directive', ref, prelude: match.prelude }
  const name = node.name.toLowerCase()
  if (!GROUP_NAMES.has(name) || node.nodes === undefined) {
    return { kind: 'opaque', ref, name, prelude: node.params }
  }
  const content = contentOf(node, table)
  return {
    kind: 'group',
    ref,
    name,
    prelude: node.params,
    get nodes() {
      return content()
    },
  }
}

/**
 * The model of `rule`, and the table that turns a `ref` back into its node.
 */
function readRule(rule: Rule): { nodes: ModelNode[]; table: NodeTable } {
  const table: NodeTable = []
  return { table, nodes: rule.nodes.map((child) => toModel(child, table)) }
}

/**
 * Whether `rule` has a `@nave` directive among its own children.
 */
function hasDirective(rule: Rule): boolean {
  return rule.nodes.some((node) => node.type === 'atrule' && matchNaveAtRule(node).isNave)
}

/**
 * Reports the order warnings on the nodes they sit on, before any node is replaced. They never
 * fail a build and are not governed by `onUnknown`; under Turbopack they are printed, not attached.
 */
function reportWarnings(
  warnings: readonly PlanWarning[],
  table: NodeTable,
  ctx: RuleContext,
): void {
  for (const { anchor, text } of warnings) {
    const node = table[anchor.ref]!
    if (anchor.offset === undefined) {
      reportWarning(node, ctx.result, text)
      continue
    }
    const { preludeStartIndex } = matchNaveAtRule(node as PostCSSAtRule)
    reportWarning(node, ctx.result, text, preludeStartIndex + anchor.offset)
  }
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
function planOrThrow(rule: Rule, nodes: ModelNode[], table: NodeTable, ctx: RuleContext): RulePlan {
  try {
    return planRule({
      selector: rule.selector,
      nodes,
      isInsideKeyframes: isInsideKeyframes(rule),
      extend: ctx.extend,
    })
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
function handleRule(rule: Rule, ctx: RuleContext): void {
  if (!hasDirective(rule)) return
  const { table, nodes } = readRule(rule)
  const plan = planOrThrow(rule, nodes, table, ctx)
  reportWarnings(plan.warnings, table, ctx)
  for (const item of plan.items) applyItem(item, table, ctx)
}

/**
 * Whether `node` is a directive directly in a style rule: the kind whose visit expands a rule.
 */
function isRuleDirective(node: ChildNode): boolean {
  return node.type === 'atrule' && node.parent?.type === 'rule' && matchNaveAtRule(node).isNave
}

/**
 * Whether `node` or anything under it is a directive directly in a style rule.
 */
function isOrHoldsRuleDirective(node: ChildNode): boolean {
  const stack: ChildNode[] = [node]
  while (stack.length > 0) {
    const next = stack.pop()!
    if (isRuleDirective(next)) return true
    if (next.type === 'rule' || next.type === 'atrule') stack.push(...(next.nodes ?? []))
  }
  return false
}

/**
 * Whether no directive directly in a style rule follows `atRule` anywhere under `root`.
 */
function isLastDirectiveUnder(root: Rule, atRule: PostCSSAtRule): boolean {
  let node: ChildNode = atRule
  for (;;) {
    const parent = node.parent as Rule | PostCSSAtRule
    const later = (parent.nodes ?? []).slice(parent.index(node) + 1)
    if (later.some((child) => isOrHoldsRuleDirective(child))) {
      return false
    }
    if (parent === root) return true
    node = parent
  }
}

/**
 * The outermost style rule that holds `rule`, `rule` itself when none does.
 */
function outermostRule(rule: Rule): Rule {
  let outer = rule
  let node: unknown = rule.parent
  while (node !== undefined && node !== null) {
    const container = node as { parent?: unknown; type: string }
    if (container.type === 'rule') outer = node as Rule
    node = container.parent
  }
  return outer
}

/**
 * Expands `root` and then every style rule under it, each before the rules inside it: an outer
 * rule is read while a directive in a rule nested in it is still a directive, which is how the
 * text expander reads it, so the order check sees the same output from both hosts.
 */
function handleRuleTree(root: Rule, ctx: RuleContext): void {
  const stack: (PostCSSAtRule | Rule)[] = [root]
  while (stack.length > 0) {
    const container = stack.pop()!
    if (container.type === 'rule') handleRule(container, ctx)
    const inner = (container.nodes ?? []).filter(
      (child) => child.type === 'rule' || child.type === 'atrule',
    )
    stack.push(...inner.toReversed())
  }
}

/**
 * The plugin's `AtRule` visitor. A directive directly in a style rule is expanded together with
 * its siblings, and with the rules nested in its rule, once every directive in them has been
 * visited, so a plugin ahead of this one that rewrites a directive's prelude on its visit has done
 * so before the rule is read. Any other directive is refused.
 */
export function handleDirective(atRule: PostCSSAtRule, ctx: RuleContext): void {
  const parent = atRule.parent
  if (parent?.type !== 'rule') {
    handleAtRule(atRule, ctx)
    return
  }
  if (!matchNaveAtRule(atRule).isNave) return
  const root = outermostRule(parent)
  if (isLastDirectiveUnder(root, atRule)) handleRuleTree(root, ctx)
}
