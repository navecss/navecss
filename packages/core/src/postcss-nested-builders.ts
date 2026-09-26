/**
 * Whether a `@nave` directive's authored position already follows a
 * nested node — the one fact about the PostCSS AST `plan()` cannot answer
 * itself (R2's "any host can answer" facts). Building the nested output
 * (pseudo rules, `@media`/`@container` blocks) is `plan()`'s job now; this
 * file is left with only the position check, split out to keep
 * `postcss.ts` under the project's file-length lint.
 */
import type { ChildNode, AtRule as PostCSSAtRule, Rule } from 'postcss'

/**
 * True for a node that constitutes CSS nesting (excludes the @nave directive itself).
 */
function isNestedNode(node: ChildNode): boolean {
  return node.type === 'rule' || (node.type === 'atrule' && node.name.toLowerCase() !== 'nave')
}

/**
 * Whether `atRule`'s authored position already follows a nested node (a
 * consumer-authored rule, or an at-rule other than @nave). Bare declarations
 * after a nested node need CSSNestedDeclarations, which is past the Baseline
 * 2024 floor this plugin targets (docs/04-adr/0001-native-css-nesting.md).
 * Computed once per directive: only a node inserted BEFORE the directive
 * would change the answer, and nested nodes this plugin builds are always
 * appended to the end of `rule`, never inserted before the directive.
 */
export function isFollowingNestedNode(rule: Rule, atRule: PostCSSAtRule): boolean {
  return rule.nodes.slice(0, rule.index(atRule)).some((node) => isNestedNode(node))
}
