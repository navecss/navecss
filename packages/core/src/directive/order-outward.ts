/**
 * R4's outward pairs: a directive written inside a nested rule is compared not only with what its
 * own rule holds after it but with what each enclosing rule holds after the block that contains
 * the directive. The path from that rule down to the directive is read as R4(a) reads a later
 * block (nested rules whose subject stays on the element, and conditional groups), and the pair
 * is judged by the same tests as any other: equal specificity, conditions that may both hold,
 * related properties, unequal values. A conditional group on the path has no plan of its own, so
 * what it holds after the block that contains the directive is read here too; a rule on the path
 * has one, and reads its own content.
 */
import type { ConditionRule } from './condition-overlap.ts'
import type { Segment } from './order-check.ts'
import type { AtomFacts, Candidate, DirectiveFacts, Finding, Unit } from './order-model.ts'
import type { Found, GroupLevelFact } from './order-outward-search.ts'
import type { AnchoredBlock } from './plan.ts'
import type { ModelNode, NodeRef } from './rule-model.ts'
import type { Specificity } from './selector-specificity.ts'

import { compare } from './order-compare.ts'
import { toOrderDeclaration } from './order-declaration.ts'
import { namesOf, nestedText, placeOf } from './order-outward-names.ts'
import { directivesBelow } from './order-outward-search.ts'
import { printedValue } from './order-print.ts'
import { candidatesOfOwnNode, conditionsOf, type Emitted, type Reach } from './order-units.ts'
import { conditionKey, statesOf } from './order-where.ts'
import { directiveFacts } from './rule-emit.ts'
import { nestedSpecificities } from './selector-specificity.ts'

/**
 * Whether two conditions are the same group rule, spelled with or without the whitespace around
 * an operator: holding both is holding one.
 */
function isSameCondition(a: ConditionRule, b: ConditionRule): boolean {
  return conditionKey(a) === conditionKey(b)
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
    placeSelector: placeOf(found.path, selector),
    placeStates: [...found.path, selector].flatMap((part) => statesOf(printedValue(part))),
    conditions,
    declarations: declarations.map((declaration) => toOrderDeclaration(declaration)),
    specificities: found.specificities.flatMap((s) => nestedSpecificities(selector, s)),
  })
  const path = conditionsOf(found.chain)
  if (block.kind === 'pseudo') return [make(block.selector, path, block.declarations)]
  const own = { name: block.kind, prelude: block.condition }
  const conditions = path.some((condition) => isSameCondition(condition, own))
    ? path
    : [own, ...path]
  const units = block.pseudos.map((pseudo) =>
    make(pseudo.selector, conditions, pseudo.declarations),
  )
  if (block.declarations.length > 0) units.unshift(make('&', conditions, block.declarations))
  return units
}

/**
 * What an enclosing rule gives `findingsBelow`: the rule's own context, the candidates it holds
 * after the block that contains the directive, and how its blocks are named.
 */
interface Enclosing {
  readonly amp: Specificity
  readonly emitted: Emitted
  readonly later: readonly Candidate[]
  readonly names: ReadonlyMap<number, string>
  readonly top: ModelNode
}

/**
 * Where an outward pair is read and how its warning names the blocks in it.
 */
interface How {
  readonly above: string
  readonly level?: { readonly container: NodeRef; readonly group: NodeRef }
  readonly names: ReadonlyMap<number, string>
  readonly top: NodeRef
}

/**
 * The finding with how an outward warning names the blocks in it.
 */
function outwardOf(finding: Finding, how: How): Finding {
  const { overrider } = finding.candidate
  const name = overrider.kind === 'own' ? how.names.get(overrider.topRef) : undefined
  const { above, level, top } = how
  return { ...finding, outward: { above, overrider: name, top, ...(level && { level }) } }
}

/**
 * The findings of one block's units against `candidates`, as outward findings.
 */
function pairs(units: readonly Unit[], candidates: readonly Candidate[], how: How): Finding[] {
  return units.flatMap((unit) =>
    candidates.flatMap((candidate) => {
      const finding = compare(unit, candidate)
      return finding === undefined ? [] : [outwardOf(finding, how)]
    }),
  )
}

/**
 * The candidates the nodes after the child that holds a directive give, inside one group level.
 */
function groupCandidates(group: GroupLevelFact, enclosing: Enclosing): Candidate[] {
  const reach: Reach = { chain: group.chain, specificities: group.specificities }
  return group.later.flatMap((node) =>
    candidatesOfOwnNode(node, enclosing.amp, enclosing.emitted, reach),
  )
}

/**
 * The findings of every directive found below `top` against what the enclosing rule holds after
 * `top`, and against what the groups on the way down hold after the child that holds it.
 */
function findingsBelow(enclosing: Enclosing): Finding[] {
  const { amp, emitted, top } = enclosing
  const above = enclosing.names.get(top.ref) ?? nestedText(top)
  return directivesBelow(top, amp).flatMap((found) => {
    const { atoms } = emitted(found.directive)
    const facts = directiveFacts(found.directive, { atoms, diagnostics: [] })
    const levels = [
      { candidates: enclosing.later, how: { above, names: enclosing.names, top: top.ref } },
      ...found.groups.map((group) => ({
        candidates: groupCandidates(group, enclosing),
        how: {
          above: group.above,
          level: { container: group.container, group: group.group },
          names: group.names,
          top: top.ref,
        },
      })),
    ]
    return atoms.flatMap((atom, index) =>
      atom.blocks
        .flatMap((block) =>
          unitsOfBlock(found, { atom: facts.atoms[index]!, directive: facts }, block),
        )
        .flatMap((unit) => levels.flatMap((level) => pairs([unit], level.candidates, level.how))),
    )
  })
}

/**
 * The outward findings of a rule: for each nested rule or group it holds, the blocks of the
 * directives written inside against what the rule holds after it, and what a group holds after
 * the block that contains the directive.
 */
export function outwardFindings(
  segments: readonly Segment[],
  amp: Specificity,
  emitted: Emitted,
  candidatesOfSegment: (index: number) => readonly Candidate[],
): Finding[] {
  const names = namesOf(
    segments.flatMap((segment) => (segment.kind === 'own' ? [segment.node] : [])),
  )
  return segments.flatMap((segment, index) => {
    if (segment.kind !== 'own') return []
    const top = segment.node
    if (top.kind !== 'rule' && top.kind !== 'group') return []
    const later = segments.flatMap((_other, at) => (at > index ? candidatesOfSegment(at) : []))
    if (later.length === 0 && top.kind === 'rule') return []
    return findingsBelow({ amp, emitted, later, names, top })
  })
}
