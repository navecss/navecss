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
import type { ModelNode } from './rule-model.ts'
import type { Specificity } from './selector-specificity.ts'

import { compare } from './order-compare.ts'
import { toOrderDeclaration } from './order-declaration.ts'
import { namesOf, nestedText, placeOf } from './order-outward-names.ts'
import { directivesBelow } from './order-outward-search.ts'
import { printedValue } from './order-print.ts'
import {
  candidatesOfOwnNode,
  conditionsOf,
  type Emitted,
  type Reach,
  unitsOfBlock as unitsOfAtomBlock,
} from './order-units.ts'
import { statesOf } from './order-where.ts'
import { directiveFacts } from './rule-emit.ts'
import { nestedSpecificities } from './selector-specificity.ts'

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
 * after the block that contains the directive, how its blocks are named, and the part of its
 * output that moving a later directive above that block would put after the directive's blocks.
 */
interface Enclosing {
  readonly amp: Specificity
  readonly emitted: Emitted
  readonly later: readonly Candidate[]
  readonly names: ReadonlyMap<number, string>
  readonly isSwapped: (finding: Finding) => boolean
  readonly top: ModelNode
}

/**
 * The finding with how an outward warning names the blocks in it.
 */
function outwardOf(
  finding: Finding,
  above: string,
  names: ReadonlyMap<number, string>,
  canMove: boolean,
): Finding {
  const { overrider } = finding.candidate
  const name = overrider.kind === 'own' ? names.get(overrider.topRef) : undefined
  return { ...finding, outward: { above, canMove, overrider: name } }
}

/**
 * The findings of one block's units against `candidates`, as outward findings.
 */
function pairs(
  units: readonly Unit[],
  candidates: readonly Candidate[],
  how: {
    readonly above: string
    readonly enclosing: Enclosing
    readonly names: ReadonlyMap<number, string>
  },
): Finding[] {
  return units.flatMap((unit) =>
    candidates.flatMap((candidate) => {
      const finding = compare(unit, candidate)
      if (finding === undefined) return []
      const canMove = candidate.overrider.kind !== 'atom' || !how.enclosing.isSwapped(finding)
      return [outwardOf(finding, how.above, how.names, canMove)]
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
      { above, candidates: enclosing.later, names: enclosing.names },
      ...found.groups.map((group) => ({
        above: group.above,
        candidates: groupCandidates(group, enclosing),
        names: group.names,
      })),
    ]
    return atoms.flatMap((atom, index) =>
      atom.blocks
        .flatMap((block) =>
          unitsOfBlock(found, { atom: facts.atoms[index]!, directive: facts }, block),
        )
        .flatMap((unit) =>
          levels.flatMap((level) =>
            pairs([unit], level.candidates, { above: level.above, enclosing, names: level.names }),
          ),
        ),
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
    const isSwapped = (finding: Finding): boolean =>
      isSwappedBy(finding, segments, candidatesOfSegment(index), amp)
    return findingsBelow({ amp, emitted, later, names, isSwapped, top })
  })
}

/**
 * Whether writing the later directive of `finding` above the nested block would only turn the
 * pair round: some block of that directive overrides the content of the nested block, with a
 * different value, once it comes first.
 */
function isSwappedBy(
  finding: Finding,
  segments: readonly Segment[],
  held: readonly Candidate[],
  amp: Specificity,
): boolean {
  const { overrider } = finding.candidate
  if (overrider.kind !== 'atom') return false
  return segments.some(
    (segment) =>
      segment.kind === 'atom-block' &&
      segment.directive.ref === overrider.directive.ref &&
      unitsOfAtomBlock(
        { amp, atom: segment.atom, directive: segment.directive },
        segment.block,
      ).some((unit) => held.some((candidate) => compare(unit, candidate) !== undefined)),
  )
}
