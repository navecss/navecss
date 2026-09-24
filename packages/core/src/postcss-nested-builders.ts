/**
 * Builds the native-CSS-nesting shape (pseudo rules, nested @media/@container
 * blocks) an atom contributes inside its parent rule, plus the
 * authored-position bookkeeping that shape needs. Split out of `postcss.ts`
 * to keep that file under the project's file-length lint.
 */
import type { ChildNode, AtRule as PostCSSAtRule, Rule } from 'postcss'

import postcss from 'postcss'

import type { AtomDefinition } from './atoms.ts'

import { anchorSelectorList } from './selector-utils.ts'

export const DIRECTIVE = 'nave'

type AtBlock = NonNullable<AtomDefinition['media']>[string]
type PseudoMap = NonNullable<AtomDefinition['pseudos']>
export type NestedNode = Rule | ReturnType<typeof postcss.atRule>

/**
 * Builds a nested rule, e.g. `&` or `&:focus-visible`, from a declaration map.
 */
function buildNestedRule(selector: string, decls: Record<string, string>): Rule {
  const rule = postcss.rule({ selector })
  for (const [prop, value] of Object.entries(decls)) {
    rule.append(postcss.decl({ prop, value }))
  }
  return rule
}

/**
 * One nested rule per pseudo, e.g. `&:focus-visible { … }`. `anchorSelectorList` anchors
 * EVERY branch of a comma-separated key, not only the first.
 */
function buildPseudoRules(pseudos: PseudoMap): Rule[] {
  return Object.entries(pseudos).map(([pseudo, decls]) =>
    buildNestedRule(anchorSelectorList(pseudo), decls),
  )
}

/**
 * Inner rules of a nested @media / @container block.
 * Declarations are wrapped in `& { … }` rather than written bare: bare
 * declarations inside a nested at-rule need CSSNestedDeclarations, which is
 * past the Baseline 2024 floor this plugin targets.
 */
function buildInnerRules(block: AtBlock): Rule[] {
  const rules: Rule[] = []
  if (block.declarations) rules.push(buildNestedRule('&', block.declarations))
  if (block.pseudos) rules.push(...buildPseudoRules(block.pseudos))
  return rules
}

/**
 * A nested @media / @container at-rule, or undefined when the block is empty.
 */
function buildAtBlock(atName: string, condition: string, block: AtBlock): NestedNode | undefined {
  const inner = buildInnerRules(block)
  if (inner.length === 0) return undefined
  const node = postcss.atRule({ name: atName, params: condition })
  for (const rule of inner) node.append(rule)
  return node
}

/**
 * The nodes an atom contributes inside its parent rule, in authored order.
 * `&` resolves against the parent's whole selector list, so a rule like
 * `.a, .b` gets the pseudo on both selectors.
 */
export function buildNested(atom: AtomDefinition): NestedNode[] {
  const nodes: NestedNode[] = []
  if (atom.pseudos) nodes.push(...buildPseudoRules(atom.pseudos))
  for (const atName of ['media', 'container'] as const) {
    const blocks = atom[atName] ?? {}
    for (const [condition, block] of Object.entries(blocks)) {
      const node = buildAtBlock(atName, condition, block)
      if (node) nodes.push(node)
    }
  }
  return nodes
}

/**
 * True for a node that constitutes CSS nesting (excludes the @nave directive itself).
 */
function isNestedNode(node: ChildNode): boolean {
  return node.type === 'rule' || (node.type === 'atrule' && node.name !== DIRECTIVE)
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
