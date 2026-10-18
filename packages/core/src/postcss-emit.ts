/**
 * Builds the PostCSS nodes a directive's emissions stand for, and writes them into the tree in
 * front of the directive. Split out of `postcss-rule.ts` to keep that file small.
 */
import type { ChildNode, AtRule as PostCSSAtRule, Rule } from 'postcss'

import postcss from 'postcss'

import type { AnchoredBlock, Declaration } from './directive/plan.ts'
import type { Emission } from './directive/rule-model.ts'

import { stampSource } from './postcss-node-utils.ts'

/**
 * One rendered declaration, stamped with the directive's own source.
 */
function declNode(atRule: PostCSSAtRule, decl: Declaration): ReturnType<typeof postcss.decl> {
  const node = postcss.decl({ prop: decl.prop, value: decl.value })
  if (atRule.source) node.source = atRule.source
  return node
}

/**
 * A rule node with `selector`, holding `declarations`.
 */
function buildRule(selector: string, declarations: readonly Declaration[]): Rule {
  const rule = postcss.rule({ selector })
  for (const decl of declarations) rule.append(postcss.decl({ prop: decl.prop, value: decl.value }))
  return rule
}

/**
 * The PostCSS node one anchored block stands for.
 */
function buildBlockNode(block: AnchoredBlock): Rule | PostCSSAtRule {
  if (block.kind === 'pseudo') return buildRule(block.selector, block.declarations)
  const node = postcss.atRule({ name: block.kind, params: block.condition })
  if (block.declarations.length > 0) node.append(buildRule('&', block.declarations))
  for (const pseudo of block.pseudos) node.append(buildRule(pseudo.selector, pseudo.declarations))
  return node
}

/**
 * The nodes one emission stands for, each stamped with the directive's source.
 */
function nodesOf(atRule: PostCSSAtRule, emission: Emission): ChildNode[] {
  if (emission.kind === 'block') {
    const node = buildBlockNode(emission.block)
    stampSource(node, atRule.source)
    return [node]
  }
  if (!emission.isWrapped) return emission.declarations.map((decl) => declNode(atRule, decl))
  const wrapper = postcss.rule({ selector: '&' })
  if (atRule.source) wrapper.source = atRule.source
  for (const decl of emission.declarations) wrapper.append(declNode(atRule, decl))
  return [wrapper]
}

/**
 * Writes a block in front of `atRule`. A block takes the whitespace of the node before it, and
 * the stylesheet's own default when nothing is before it, as a block written at the end of the
 * rule always did; copying the directive's whitespace would put a block on the directive's line.
 */
function insertBlock(atRule: PostCSSAtRule, node: ChildNode): void {
  const previous = atRule.prev()
  atRule.before(node)
  if (previous?.raws.before === undefined) delete node.raws.before
  else node.raws.before = previous.raws.before.replaceAll(/\S/g, '')
}

/**
 * Writes `emissions` into the tree in front of `atRule`, in order.
 */
export function insertEmissions(atRule: PostCSSAtRule, emissions: readonly Emission[]): void {
  for (const emission of emissions) {
    for (const node of nodesOf(atRule, emission)) {
      if (emission.kind === 'block') insertBlock(atRule, node)
      else atRule.before(node)
    }
  }
}

/**
 * Moves `nodes` (a run of the rule's own declarations and the comments between them) into one
 * `& { }` written where the first of them was. The wrapper takes `source`; the nodes keep theirs.
 */
export function wrapRun(nodes: readonly ChildNode[], source: PostCSSAtRule['source']): void {
  const wrapper = postcss.rule({ selector: '&' })
  if (source) wrapper.source = source
  nodes[0]!.before(wrapper)
  for (const node of nodes) wrapper.append(node)
}
