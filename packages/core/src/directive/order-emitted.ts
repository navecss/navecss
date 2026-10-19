/**
 * What a directive written inside a nested rule emits, as the nodes of that rule: its atoms'
 * declarations, bare, and its atoms' blocks as nested rules and conditional groups. The order
 * check reads them as it reads what the author wrote there, so a nested directive counts as what
 * it expands to, in either host and whether or not the host has expanded it yet.
 */
import type { AnchoredBlock } from './plan.ts'
import type { ExtendMap } from './resolve.ts'
import type { DirectiveNode, ModelNode, PlannedDirective } from './rule-model.ts'

import { toOrderDeclaration } from './order-declaration.ts'
import { plan } from './plan.ts'

/**
 * What the order check needs to plan a directive the way a host will.
 */
export interface EmitContext {
  readonly extend: ExtendMap | undefined
  readonly isInsideKeyframes: boolean
}

/**
 * A declaration of an atom as a node of the rule that holds the directive.
 */
function declarationNode(
  ref: number,
  declaration: { readonly prop: string; readonly value: string },
): ModelNode {
  const { prop, value, important } = toOrderDeclaration(declaration)
  return { kind: 'decl', ref, prop, value, important }
}

/**
 * One block of an atom as the node it is written as: a pseudo block is a nested rule; an `@media`
 * or `@container` block is a group holding its own declarations and its pseudo rules.
 */
function blockNode(ref: number, block: AnchoredBlock): ModelNode {
  const rule = (selector: string, declarations: AnchoredBlock['declarations']): ModelNode => ({
    kind: 'rule',
    ref,
    selector,
    nodes: declarations.map((declaration) => declarationNode(ref, declaration)),
  })
  if (block.kind === 'pseudo') return rule(block.selector, block.declarations)
  return {
    kind: 'group',
    ref,
    name: block.kind,
    prelude: block.condition,
    nodes: [
      ...block.declarations.map((declaration) => declarationNode(ref, declaration)),
      ...block.pseudos.map((pseudo) => rule(pseudo.selector, pseudo.declarations)),
    ],
  }
}

/**
 * The atoms `directive` names and the nodes it expands to in a style rule, atom by atom: an atom's
 * declarations, then its blocks. A directive that cannot be planned emits nothing here; its own rule reports it. With a
 * `cache`, a directive written the same way is planned once; the nodes it gives are shared and
 * never changed.
 */
export function plannedDirective(
  directive: DirectiveNode,
  context: EmitContext,
  cache?: Map<string, PlannedDirective>,
): PlannedDirective {
  if (cache === undefined) return planNow(directive, context)
  const key = `${context.isInsideKeyframes ? 'k' : 'r'}${directive.prelude}`
  let planned = cache.get(key)
  if (planned === undefined) {
    planned = planNow(directive, context)
    cache.set(key, planned)
  }
  return planned
}

/**
 * The nodes `directive` expands to, planned now.
 */
function planNow(directive: DirectiveNode, context: EmitContext): PlannedDirective {
  try {
    const { atoms } = plan(
      directive.prelude,
      { isStyleRuleParent: true, isInsideKeyframes: context.isInsideKeyframes },
      { extend: context.extend },
    )
    const nodes = atoms.flatMap((atom) => [
      ...atom.declarations.map((declaration) => declarationNode(directive.ref, declaration)),
      ...atom.blocks.map((block) => blockNode(directive.ref, block)),
    ])
    return { atoms, nodes }
  } catch {
    return { atoms: [], nodes: [] }
  }
}
