/**
 * Where a `@nave` directive sits among the rules around it, for the PostCSS host: whether it is
 * the last one that expands a rule, and which rule is the outermost one around it. Split out of
 * `postcss-rule.ts` to keep that file under the project's file-length lint.
 */
import type { ChildNode, AtRule as PostCSSAtRule, Rule } from 'postcss'

import { matchNaveAtRule } from './postcss-at-rule.ts'

/**
 * Whether `node` is a directive directly in a style rule: the kind whose visit expands a rule.
 */
export function isRuleDirective(node: ChildNode): boolean {
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
export function isLastDirectiveUnder(root: Rule, atRule: PostCSSAtRule): boolean {
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
export function outermostRule(rule: Rule): Rule {
  let outer = rule
  let node: unknown = rule.parent
  while (node !== undefined && node !== null) {
    const container = node as { parent?: unknown; type: string }
    if (container.type === 'rule') outer = node as Rule
    node = container.parent
  }
  return outer
}
