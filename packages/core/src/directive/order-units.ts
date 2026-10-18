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
import type { ModelNode } from './rule-model.ts'

import { nestedSpecificities, type Specificity } from './selector-specificity.ts'
import { tokenize } from './tokenizer.ts'

const GROUP_NAMES = new Set(['container', 'media', 'supports'])

/**
 * Nested rules and groups are read this deep; below it a declaration is not compared.
 */
const MAX_DEPTH = 8

/**
 * The index of the last token that is not whitespace or a comment, or -1.
 */
function lastSignificant(tokens: ReturnType<typeof tokenize>, before: number): number {
  let i = before - 1
  while (i >= 0 && (tokens[i]!.type === 'whitespace-token' || tokens[i]!.type === 'comment')) i--
  return i
}

/**
 * A declaration whose value may end in `!important`, as the declaration and the flag.
 */
function toOrderDeclaration(declaration: Declaration): OrderDeclaration {
  const tokens = tokenize(declaration.value)
  const last = lastSignificant(tokens, tokens.length)
  const ident = tokens[last]
  if (
    ident?.type !== 'ident-token' ||
    String(ident.structured?.value).toLowerCase() !== 'important'
  ) {
    return { prop: declaration.prop, value: declaration.value, important: false }
  }
  const bang = lastSignificant(tokens, last)
  if (tokens[bang]?.type !== 'delim-token' || tokens[bang].structured?.value !== '!') {
    return { prop: declaration.prop, value: declaration.value, important: false }
  }
  const value = declaration.value.slice(0, tokens[bang].startIndex).trim()
  return { prop: declaration.prop, value, important: true }
}

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

interface Walk {
  readonly conditions: readonly ConditionRule[]
  readonly holderSelector: string
  readonly overrider: Overrider
  readonly specificities: readonly Specificity[]
}

/**
 * The candidates inside `nodes`: declarations at this level, then those of nested rules whose
 * subject stays on the element and of conditional groups, to a fixed depth.
 */
function walkNodes(nodes: readonly ModelNode[], walk: Walk, depth: number): Candidate[] {
  const found: Candidate[] = []
  const siblings = nodes.flatMap((node) =>
    node.kind === 'decl' ? [{ prop: node.prop, value: node.value, important: node.important }] : [],
  )
  for (const node of nodes) {
    if (node.kind === 'decl') {
      const { prop, value, important } = node
      found.push({
        declaration: { prop, value, important },
        overrider: walk.overrider,
        conditions: walk.conditions,
        specificities: walk.specificities,
        holderSelector: walk.holderSelector,
        siblings,
      })
    } else if (depth < MAX_DEPTH && node.kind === 'rule') {
      const specificities = walk.specificities.flatMap((s) => nestedSpecificities(node.selector, s))
      if (specificities.length === 0) continue
      const inner = { ...walk, specificities, holderSelector: node.selector }
      found.push(...walkNodes(node.nodes, inner, depth + 1))
    } else if (depth < MAX_DEPTH && node.kind === 'group' && GROUP_NAMES.has(node.name)) {
      const conditions = [...walk.conditions, { name: node.name, prelude: node.prelude }]
      found.push(...walkNodes(node.nodes, { ...walk, conditions }, depth + 1))
    }
  }
  return found
}

/**
 * The candidates one child of the rule contributes, `amp` being what `&` weighs.
 */
export function candidatesOfOwnNode(node: ModelNode, amp: Specificity): Candidate[] {
  if (node.kind === 'decl') return walkNodes([node], ownWalk(node, { kind: 'declaration' }, amp), 0)
  if (node.kind === 'rule') {
    const top = { kind: 'rule', selector: node.selector } as const
    const specificities = nestedSpecificities(node.selector, amp)
    if (specificities.length === 0) return []
    return walkNodes(
      node.nodes,
      { ...ownWalk(node, top, amp), specificities, holderSelector: node.selector },
      1,
    )
  }
  if (node.kind === 'group' && GROUP_NAMES.has(node.name)) {
    const top = { kind: 'group', name: node.name, prelude: node.prelude } as const
    const conditions = [{ name: node.name, prelude: node.prelude }]
    return walkNodes(node.nodes, { ...ownWalk(node, top, amp), conditions }, 1)
  }
  return []
}

/**
 * The starting walk for a child of the rule.
 */
function ownWalk(
  node: ModelNode,
  top: Extract<Overrider, { kind: 'own' }>['top'],
  amp: Specificity,
): Walk {
  return {
    conditions: [],
    holderSelector: '&',
    overrider: { kind: 'own', top, topRef: node.ref },
    specificities: [amp],
  }
}
