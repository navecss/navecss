/**
 * R4's outward pairs: a directive written inside a nested rule is compared not only with what its
 * own rule holds after it but with what each enclosing rule holds after the block that contains
 * the directive. The path from that rule down to the directive is read as R4(a) reads a later
 * block (nested rules whose subject stays on the element, and conditional groups), and the pair
 * is judged by the same tests as any other: equal specificity, conditions that may both hold,
 * related properties, unequal values.
 */
import type { ConditionRule } from './condition-overlap.ts'
import type { Segment } from './order-check.ts'
import type { AtomFacts, Candidate, DirectiveFacts, Finding, Unit } from './order-model.ts'
import type { AnchoredBlock } from './plan.ts'
import type { DirectiveNode, ModelNode } from './rule-model.ts'
import type { Specificity } from './selector-specificity.ts'

import { compare } from './order-compare.ts'
import { toOrderDeclaration } from './order-declaration.ts'
import { type ConditionChain, conditionsOf, type Emitted, GROUP_NAMES } from './order-units.ts'
import { directiveFacts } from './rule-emit.ts'
import { nestedSpecificities } from './selector-specificity.ts'

/**
 * How a warning names a nested node of the rule's own.
 */
export function nestedText(node: ModelNode): string {
  if (node.kind === 'rule') return `the ${node.selector} block`
  if (node.kind === 'group' || node.kind === 'opaque') {
    return ['the', `@${node.name}`, node.prelude, 'block'].filter((part) => part !== '').join(' ')
  }
  return ''
}

/**
 * A directive found below a nested node, with where it sits: the specificities of the rule that
 * holds it, and the conditional groups on the way down.
 */
interface Found {
  readonly chain: ConditionChain | undefined
  readonly directive: DirectiveNode
  readonly specificities: readonly Specificity[]
}

/**
 * One level of the search: the nodes of a nested rule or group, and how they are reached.
 */
interface Level {
  next: number
  readonly chain: ConditionChain | undefined
  readonly isRule: boolean
  readonly nodes: readonly ModelNode[]
  readonly specificities: readonly Specificity[]
}

/**
 * The level inside `node` when a directive could sit in it: a rule whose subject stays on the
 * element, or a conditional group. Nothing else is entered, as for any later block.
 */
function enter(node: ModelNode, level: Level): Level | undefined {
  if (node.kind === 'rule') {
    const specificities = level.specificities.flatMap((s) => nestedSpecificities(node.selector, s))
    if (specificities.length === 0) return undefined
    return { ...level, next: 0, isRule: true, nodes: node.nodes, specificities }
  }
  if (node.kind === 'group' && GROUP_NAMES.has(node.name)) {
    const chain = { rule: { name: node.name, prelude: node.prelude }, parent: level.chain }
    return { ...level, next: 0, chain, isRule: false, nodes: node.nodes }
  }
  return undefined
}

/**
 * Every directive below `top`, a rule or a group of the enclosing rule, in document order. A
 * directive standing straight in a group is refused by the hosts and is not one. The search keeps
 * a stack of its own, so nesting depth cannot overflow the call stack.
 */
function directivesBelow(top: ModelNode, amp: Specificity): Found[] {
  const first = enter(top, {
    next: 0,
    chain: undefined,
    isRule: true,
    nodes: [],
    specificities: [amp],
  })
  if (first === undefined) return []
  const found: Found[] = []
  const stack = [first]
  while (stack.length > 0) {
    const level = stack.at(-1)!
    const node = level.nodes[level.next++]
    if (node === undefined) {
      stack.pop()
    } else if (node.kind === 'directive') {
      if (level.isRule) {
        found.push({ chain: level.chain, directive: node, specificities: level.specificities })
      }
    } else {
      const inner = enter(node, level)
      if (inner !== undefined) stack.push(inner)
    }
  }
  return found
}

/**
 * Whether two conditions are the same group rule, whitespace aside: holding both is holding one.
 */
function isSameCondition(a: ConditionRule, b: ConditionRule): boolean {
  const clean = (rule: ConditionRule): string =>
    `${rule.name} ${rule.prelude.replaceAll(/\s+/g, ' ').trim()}`
  return clean(a) === clean(b)
}

/**
 * The units of one block of an atom of a directive found below the enclosing rule's block.
 */
function unitsOfBlock(
  found: Found,
  context: { readonly atom: AtomFacts; readonly directive: DirectiveFacts },
  block: AnchoredBlock,
): Unit[] {
  const make = (
    selector: string,
    conditions: readonly ConditionRule[],
    declarations: AnchoredBlock['declarations'],
  ): Unit => ({
    ...context,
    selector,
    conditions,
    declarations: declarations.map((declaration) => toOrderDeclaration(declaration)),
    specificities: found.specificities.flatMap((s) => nestedSpecificities(selector, s)),
  })
  const path = conditionsOf(found.chain)
  if (block.kind === 'pseudo') return [make(block.selector, path, block.declarations)]
  const own = { name: block.kind, prelude: block.condition }
  const conditions = path.some((condition) => isSameCondition(condition, own))
    ? path
    : [...path, own]
  const units = block.pseudos.map((pseudo) =>
    make(pseudo.selector, conditions, pseudo.declarations),
  )
  if (block.declarations.length > 0) units.unshift(make('&', conditions, block.declarations))
  return units
}

/**
 * The findings of every directive found below `top` against `later`, the candidates the
 * enclosing rule holds after `top`.
 */
function findingsBelow(
  top: ModelNode,
  context: { readonly amp: Specificity; readonly emitted: Emitted },
  later: readonly Candidate[],
): Finding[] {
  const outward = { above: nestedText(top) }
  return directivesBelow(top, context.amp).flatMap((found) => {
    const { atoms } = context.emitted(found.directive)
    const facts = directiveFacts(found.directive, { atoms, diagnostics: [] })
    return atoms.flatMap((atom, index) =>
      atom.blocks
        .flatMap((block) =>
          unitsOfBlock(found, { atom: facts.atoms[index]!, directive: facts }, block),
        )
        .flatMap((unit) =>
          later.flatMap((candidate) => {
            const finding = compare(unit, candidate)
            return finding === undefined ? [] : [{ ...finding, outward }]
          }),
        ),
    )
  })
}

/**
 * The outward findings of a rule: for each nested rule or group it holds, the blocks of the
 * directives written inside against what the rule holds after it.
 */
export function outwardFindings(
  segments: readonly Segment[],
  amp: Specificity,
  emitted: Emitted,
  candidatesOfSegment: (index: number) => readonly Candidate[],
): Finding[] {
  return segments.flatMap((segment, index) => {
    if (segment.kind !== 'own' || index === segments.length - 1) return []
    if (segment.node.kind !== 'rule' && segment.node.kind !== 'group') return []
    const later = segments.flatMap((_other, at) => (at > index ? candidatesOfSegment(at) : []))
    return later.length === 0 ? [] : findingsBelow(segment.node, { amp, emitted }, later)
  })
}
