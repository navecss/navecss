/**
 * Finding the directives written below a nested rule or group of an enclosing rule: by the path
 * R4(a) reads for a later block, with the rule selectors and conditional groups on the way down
 * and what each group holds after the child that holds the directive. The search keeps a stack
 * of its own, so nesting depth cannot overflow the call stack.
 */
import type { DirectiveNode, ModelNode } from './rule-model.ts'
import type { Specificity } from './selector-specificity.ts'

import { namesOf } from './order-outward-names.ts'
import { type ConditionChain, GROUP_NAMES } from './order-units.ts'
import { nestedSpecificities } from './selector-specificity.ts'

/**
 * What a conditional group on the path holds after the child that holds the directive.
 */
export interface GroupLevelFact {
  readonly above: string
  readonly chain: ConditionChain | undefined
  readonly later: readonly ModelNode[]
  readonly names: ReadonlyMap<number, string>
  readonly specificities: readonly Specificity[]
}

/**
 * A directive found below a nested node, with where it sits: the specificities of the rule that
 * holds it, the conditional groups and the rule selectors on the way down, and what the groups
 * above it hold after it.
 */
export interface Found {
  readonly chain: ConditionChain | undefined
  readonly directive: DirectiveNode
  readonly groups: readonly GroupLevelFact[]
  readonly path: readonly string[]
  readonly specificities: readonly Specificity[]
}

/**
 * One level of the search: the nodes of a nested rule or group, and how they are reached.
 * `isGroupOnly` marks the levels reached from the top through conditional groups alone, which the
 * enclosing rule reads; a rule below has a plan of its own.
 */
interface Level {
  next: number
  readonly chain: ConditionChain | undefined
  readonly isGroupOnly: boolean
  readonly isRule: boolean
  readonly nodes: readonly ModelNode[]
  readonly path: readonly string[]
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
    const path = [...level.path, node.selector]
    return {
      ...level,
      next: 0,
      isGroupOnly: false,
      isRule: true,
      nodes: node.nodes,
      path,
      specificities,
    }
  }
  if (node.kind === 'group' && GROUP_NAMES.has(node.name)) {
    const chain = { rule: { name: node.name, prelude: node.prelude }, parent: level.chain }
    return { ...level, next: 0, chain, isRule: false, nodes: node.nodes }
  }
  return undefined
}

/**
 * What each group level on the stack holds after the child being searched.
 */
function groupFacts(stack: readonly Level[]): GroupLevelFact[] {
  return stack.flatMap((level) => {
    const container = level.nodes[level.next - 1]
    if (container === undefined || level.isRule || !level.isGroupOnly) return []
    return [
      {
        above: namesOf(level.nodes).get(container.ref) ?? '',
        chain: level.chain,
        later: level.nodes.slice(level.next),
        names: namesOf(level.nodes),
        specificities: level.specificities,
      },
    ]
  })
}

/**
 * Every directive below `top`, a rule or a group of the enclosing rule, in document order. A
 * directive standing straight in a group is refused by the hosts and is not one. The search keeps
 * a stack of its own, so nesting depth cannot overflow the call stack.
 */
export function directivesBelow(top: ModelNode, amp: Specificity): Found[] {
  const start: Level = {
    next: 0,
    chain: undefined,
    isGroupOnly: true,
    isRule: true,
    nodes: [],
    path: [],
    specificities: [amp],
  }
  const first = enter(top, start)
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
        found.push({
          chain: level.chain,
          directive: node,
          groups: groupFacts(stack),
          path: level.path,
          specificities: level.specificities,
        })
      }
    } else {
      const inner = enter(node, level)
      if (inner !== undefined) stack.push(inner)
    }
  }
  return found
}
