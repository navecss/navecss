/**
 * Reads the parts of a rule's output into what the order check compares: the units of an atom's
 * conditional blocks, and the candidates that come after them (an atom's declarations and blocks,
 * the rule's own declarations, and its nested rules and groups that stay on the same element).
 */
import type { ConditionRule } from './condition-overlap.ts'
import type {
  AtomFacts,
  Candidate,
  DirectiveFacts,
  OrderDeclaration,
  Overrider,
  Unit,
} from './order-model.ts'
import type { AnchoredBlock, Declaration } from './plan.ts'
import type { DirectiveNode, ModelNode } from './rule-model.ts'

import { toOrderDeclaration } from './order-declaration.ts'
import { nestedSpecificities, type Specificity } from './selector-specificity.ts'

const GROUP_NAMES = new Set(['container', 'media', 'supports'])

/**
 * The context an atom's block is read in.
 */
export interface UnitContext {
  readonly amp: Specificity
  readonly atom: AtomFacts
  readonly directive: DirectiveFacts
}

/**
 * One unit of a block: a selector under the block's condition, with the declarations it holds.
 */
function unitOf(
  context: UnitContext,
  selector: string,
  conditions: readonly ConditionRule[],
  declarations: readonly Declaration[],
): Unit {
  return {
    atom: context.atom,
    directive: context.directive,
    selector,
    conditions,
    declarations: declarations.map((declaration) => toOrderDeclaration(declaration)),
    specificities: nestedSpecificities(selector, context.amp),
  }
}

/**
 * The units of one conditional block of an atom: a pseudo block is one; an `@media` or
 * `@container` block is one for its own declarations and one for each pseudo rule inside it.
 */
export function unitsOfBlock(context: UnitContext, block: AnchoredBlock): Unit[] {
  if (block.kind === 'pseudo') return [unitOf(context, block.selector, [], block.declarations)]
  const conditions = [{ name: block.kind, prelude: block.condition }]
  const units = block.pseudos.map((pseudo) =>
    unitOf(context, pseudo.selector, conditions, pseudo.declarations),
  )
  if (block.declarations.length > 0) {
    units.unshift(unitOf(context, '&', conditions, block.declarations))
  }
  return units
}

/**
 * Candidates for a run of declarations on the element itself or a nested selector.
 */
function candidatesOfUnit(unit: Unit, overrider: Overrider): Candidate[] {
  return unit.declarations.map((declaration) => ({
    declaration,
    overrider,
    conditions: unit.conditions,
    specificities: unit.specificities,
    holderSelector: unit.selector,
    siblings: unit.declarations,
  }))
}

/**
 * The candidates an atom's bare declarations contribute: they set properties on the rule itself.
 */
export function candidatesOfAtomDeclarations(
  context: UnitContext,
  declarations: readonly Declaration[],
): Candidate[] {
  const unit = { ...unitOf(context, '&', [], declarations), specificities: [context.amp] }
  const overrider = {
    atom: context.atom,
    directive: context.directive,
    kind: 'atom',
    isBlock: false,
  } as const
  return candidatesOfUnit(unit, overrider)
}

/**
 * The candidates one conditional block of an atom contributes.
 */
export function candidatesOfAtomBlock(context: UnitContext, block: AnchoredBlock): Candidate[] {
  const overrider = {
    atom: context.atom,
    directive: context.directive,
    kind: 'atom',
    isBlock: true,
  } as const
  return unitsOfBlock(context, block).flatMap((unit) => candidatesOfUnit(unit, overrider))
}

/**
 * What a directive written inside a nested rule emits, as nodes of that rule.
 */
export type Emitted = (directive: DirectiveNode) => readonly ModelNode[]

/**
 * The conditional groups around a declaration, innermost last, kept as a chain so entering a group
 * costs one link however deep the groups nest. The array a comparison needs is made once, for the
 * links a declaration is actually under.
 */
interface ConditionChain {
  array?: readonly ConditionRule[]
  readonly parent: ConditionChain | undefined
  readonly rule: ConditionRule
}

const NO_CONDITIONS: readonly ConditionRule[] = []

/**
 * The conditions of a chain, outermost first.
 */
function conditionsOf(chain: ConditionChain | undefined): readonly ConditionRule[] {
  if (chain === undefined) return NO_CONDITIONS
  if (chain.array === undefined) {
    const rules: ConditionRule[] = []
    for (let link: ConditionChain | undefined = chain; link; link = link.parent) {
      rules.push(link.rule)
    }
    chain.array = rules.toReversed()
  }
  return chain.array
}

interface Walk {
  readonly chain: ConditionChain | undefined
  readonly emitted: Emitted
  readonly holderSelector: string
  readonly overrider: Overrider
  readonly specificities: readonly Specificity[]
}

/**
 * One level of the walk: the nodes of a nested rule or group, a directive in a nested rule
 * standing for the nodes it emits, and the declarations written at that level.
 */
interface Level {
  next: number
  readonly nodes: readonly ModelNode[]
  readonly siblings: readonly OrderDeclaration[]
  readonly walk: Walk
}

/**
 * The level for `nodes`. `isRule` says they are the content of a style rule, where a directive
 * is expanded; a directive straight inside a group is refused by the hosts and stays unread.
 */
function levelOf(nodes: readonly ModelNode[], walk: Walk, isRule: boolean): Level {
  const read = isRule
    ? nodes.flatMap((node) => (node.kind === 'directive' ? walk.emitted(node) : [node]))
    : nodes
  const siblings = read.flatMap((node) =>
    node.kind === 'decl' ? [{ prop: node.prop, value: node.value, important: node.important }] : [],
  )
  return { next: 0, nodes: read, siblings, walk }
}

/**
 * The level inside `node`, or nothing when `node` holds no candidate: a rule whose subject stays
 * on the element, or a conditional group. Candidates of a declaration go to `found`.
 */
function enter(node: ModelNode, level: Level, found: Candidate[]): Level | undefined {
  const { walk } = level
  if (node.kind === 'decl') {
    const { prop, value, important } = node
    found.push({
      declaration: { prop, value, important },
      overrider: walk.overrider,
      conditions: conditionsOf(walk.chain),
      specificities: walk.specificities,
      holderSelector: walk.holderSelector,
      siblings: level.siblings,
    })
    return undefined
  }
  if (node.kind === 'rule') {
    const specificities = walk.specificities.flatMap((s) => nestedSpecificities(node.selector, s))
    if (specificities.length === 0) return undefined
    return levelOf(node.nodes, { ...walk, specificities, holderSelector: node.selector }, true)
  }
  if (node.kind === 'group' && GROUP_NAMES.has(node.name)) {
    const chain = { rule: { name: node.name, prelude: node.prelude }, parent: walk.chain }
    return levelOf(node.nodes, { ...walk, chain }, false)
  }
  return undefined
}

/**
 * The candidates inside `nodes`, in document order: declarations at each level, then those of
 * nested rules whose subject stays on the element and of conditional groups, at any depth. The
 * levels are walked with a stack of their own, so a stylesheet cannot overflow the call stack by
 * nesting.
 */
function walkNodes(nodes: readonly ModelNode[], walk: Walk, isRule: boolean): Candidate[] {
  const found: Candidate[] = []
  const stack = [levelOf(nodes, walk, isRule)]
  while (stack.length > 0) {
    const level = stack.at(-1)!
    const node = level.nodes[level.next++]
    if (node === undefined) {
      stack.pop()
      continue
    }
    const inner = enter(node, level, found)
    if (inner !== undefined) stack.push(inner)
  }
  return found
}

/**
 * The starting walk for a child of the rule.
 */
function ownWalk(
  node: ModelNode,
  top: Extract<Overrider, { kind: 'own' }>['top'],
  context: { readonly amp: Specificity; readonly emitted: Emitted },
): Walk {
  return {
    chain: undefined,
    emitted: context.emitted,
    holderSelector: '&',
    overrider: { kind: 'own', top, topRef: node.ref },
    specificities: [context.amp],
  }
}

/**
 * The candidates one child of the rule contributes, `amp` being what `&` weighs and `emitted` what
 * a directive inside a nested rule expands to.
 */
export function candidatesOfOwnNode(
  node: ModelNode,
  amp: Specificity,
  emitted: Emitted,
): Candidate[] {
  const context = { amp, emitted }
  if (node.kind === 'decl') {
    return walkNodes([node], ownWalk(node, { kind: 'declaration' }, context), false)
  }
  if (node.kind === 'rule') {
    const top = { kind: 'rule', selector: node.selector } as const
    const specificities = nestedSpecificities(node.selector, amp)
    if (specificities.length === 0) return []
    const walk = { ...ownWalk(node, top, context), specificities, holderSelector: node.selector }
    return walkNodes(node.nodes, walk, true)
  }
  if (node.kind === 'group' && GROUP_NAMES.has(node.name)) {
    const top = { kind: 'group', name: node.name, prelude: node.prelude } as const
    const chain = { rule: { name: node.name, prelude: node.prelude }, parent: undefined }
    return walkNodes(node.nodes, { ...ownWalk(node, top, context), chain }, false)
  }
  return []
}
