/**
 * Expands the `@nave` directives of one PostCSS style rule: reads the rule into the host-free
 * model, has the core plan it (`planRule()`), and applies the plan to the tree.
 */
import type { ChildNode, AtRule as PostCSSAtRule, Root, Rule } from 'postcss'

import type { Finding } from './directive/order-model.ts'
import type {
  ModelNode,
  PlanItem,
  PlanWarning,
  RuleInput,
  RulePlan,
} from './directive/rule-model.ts'
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
import { isInsideKeyframes, writtenText } from './postcss-node-utils.ts'
import {
  isLastDirectiveUnder,
  isRuleDirective,
  outermostRule,
  rulesAboveDirectives,
} from './postcss-rule-nesting.ts'
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
    // The value as written, comments included, when PostCSS kept it (it keeps it only while the
    // cleaned value is untouched): a comment between two tokens is part of how they are read.
    const raw = node.raws.value
    const value = raw?.value === node.value ? raw.raw : node.value
    return { kind: 'decl', ref, prop: node.prop, value, important: node.important }
  }
  if (node.type === 'comment') return { kind: 'comment', ref }
  if (node.type === 'rule') {
    const content = contentOf(node, table)
    return {
      kind: 'rule',
      ref,
      selector: writtenText(node.selector, node.raws.selector),
      get nodes() {
        return content()
      },
    }
  }
  const match = matchNaveAtRule(node)
  if (match.isNave) return { kind: 'directive', ref, prelude: match.prelude }
  const name = node.name.toLowerCase()
  if (!GROUP_NAMES.has(name) || node.nodes === undefined) {
    return { kind: 'opaque', ref, name, prelude: writtenText(node.params, node.raws.params) }
  }
  const content = contentOf(node, table)
  return {
    kind: 'group',
    ref,
    name,
    prelude: writtenText(node.params, node.raws.params),
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
 * An order warning waiting to be reported on the node it sits on, at `index` within it.
 */
interface PendingWarning {
  readonly index: number | undefined
  readonly node: ChildNode
  readonly text: string
}

/**
 * The order warnings of a plan, each with the node and the place within it that it sits at.
 */
function pendingWarnings(warnings: readonly PlanWarning[], table: NodeTable): PendingWarning[] {
  return warnings.map(({ anchor, text }) => {
    const node = table[anchor.ref]!
    if (anchor.offset === undefined) return { node, text, index: undefined }
    const { preludeStartIndex } = matchNaveAtRule(node as PostCSSAtRule)
    return { node, text, index: preludeStartIndex + anchor.offset }
  })
}

/**
 * Where a warning sits in the stylesheet, a node with no source last.
 */
function placeOf(warning: PendingWarning): readonly [number, number] {
  if (warning.node.source === undefined) return [Number.MAX_SAFE_INTEGER, 0]
  const { column, line } = warning.node.positionInside(warning.index ?? 0)
  return [line, column]
}

/**
 * Reports order warnings, before any node is replaced, in the order they sit in the stylesheet.
 * They never fail a build and are not governed by `onUnknown`; under Turbopack they are printed,
 * not attached.
 */
function reportInSourceOrder(warnings: readonly PendingWarning[], ctx: RuleContext): void {
  const placed = warnings.map((warning) => ({ warning, place: placeOf(warning) }))
  const ordered = placed.toSorted((a, b) => a.place[0] - b.place[0] || a.place[1] - b.place[1])
  for (const { warning } of ordered) {
    reportWarning(warning.node, ctx.result, warning.text, {
      index: warning.index,
      isOrder: true,
      printWarnings: ctx.printWarnings,
    })
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
function planOrThrow(
  rule: Rule,
  read: { readonly nodes: ModelNode[]; readonly table: NodeTable },
  ctx: Pick<RuleInput, 'emittedCache' | 'outward'> & RuleContext,
): RulePlan {
  try {
    return planRule({
      selector: rule.selector,
      nodes: read.nodes,
      isInsideKeyframes: isInsideKeyframes(rule),
      extend: ctx.extend,
      emittedCache: ctx.emittedCache,
      outward: ctx.outward,
    })
  } catch (error) {
    if (error instanceof DirectiveFailure) {
      return throwMalformedAtom(read.table[error.ref] as PostCSSAtRule, error.cause)
    }
    throw error
  }
}

/**
 * A style rule's plan and the table that turns the refs in it back into nodes.
 */
interface Planned {
  readonly plan: RulePlan
  readonly table: NodeTable
}

/**
 * Plans `root` and every style rule under it, each before the rules inside it, nothing yet
 * changed: an outer rule is read while a directive in a rule nested in it is still a directive,
 * which is how the text expander reads it, so the order check sees the same output from both
 * hosts.
 */
function planTree(root: Rule, ctx: RuleContext): Planned[] {
  const emittedCache: RuleInput['emittedCache'] = new Map()
  const known = new Map<unknown, Finding[]>()
  const holders = rulesAboveDirectives(root)
  const planned: Planned[] = []
  const stack: (PostCSSAtRule | Rule)[] = [root]
  while (stack.length > 0) {
    const container = stack.pop()!
    if (container.type === 'rule' && holders.has(container)) {
      const read = readRule(container)
      const outward = { identityOf: (ref: number) => read.table[ref], known }
      const plan = planOrThrow(container, read, { ...ctx, emittedCache, outward })
      for (const finding of plan.outwardFindings) {
        const key = read.table[finding.unit.directive.ref]
        known.set(key, [...(known.get(key) ?? []), finding])
      }
      planned.push({ table: read.table, plan })
    }
    const inner = (container.nodes ?? []).filter(
      (child) => child.type === 'rule' || child.type === 'atrule',
    )
    stack.push(...inner.toReversed())
  }
  return planned
}

/**
 * Expands `root` and every style rule under it. The warnings of the whole tree are reported
 * together, in source order, before the first node is replaced.
 */
function handleRuleTree(root: Rule, ctx: RuleContext): void {
  const planned = planTree(root, ctx)
  reportInSourceOrder(
    planned.flatMap(({ plan, table }) => pendingWarnings(plan.warnings, table)),
    ctx,
  )
  for (const { plan, table } of planned) {
    for (const item of plan.items) applyItem(item, table, ctx)
  }
}

/**
 * Expands every directive that is still directly in a style rule once the stylesheet has been
 * visited: one a plugin moved or added after the rule it sits in was due is not left behind as an
 * at-rule a browser drops.
 */
export function expandLeftovers(root: Root, ctx: RuleContext): void {
  const outer = new Set<Rule>()
  root.walkAtRules((atRule) => {
    if (isRuleDirective(atRule)) outer.add(outermostRule(atRule.parent as Rule))
  })
  for (const rule of outer) handleRuleTree(rule, ctx)
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
