/**
 * The text of an order warning: what comes after what, what the value is as a result, what was
 * lost where it matters, how to let the atom win, and how to mark the directive when the override
 * is meant. The templates are fixed; this module only fills them.
 */
import type { Finding, RelatedPair } from './order-model.ts'

import { overriderSentence } from './migration.ts'
import { focusClauseOf } from './order-focus.ts'
import { printedValue, reorderedDirective } from './order-print.ts'
import { alsoWhere, whereOf } from './order-where.ts'
import {
  isLogicalPhysicalPair,
  isSameProperty,
  longhandsOf,
  standardName,
} from './property-relations.ts'

/**
 * What a finding needs beyond itself: the names the printed marker adds, and the atom of the same
 * directive the atom must be written after, when the overrider is a later atom of that directive.
 */
export interface TextContext {
  readonly markerNames: readonly string[]
  readonly markedDirective: string
  readonly moveAfter: number | undefined
}

/**
 * `a`, `a and b`, `a, b and c`.
 */
export function joinList(items: readonly string[], conjunction = 'and'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`
}

/**
 * Whether the later declaration's longhands include every longhand of the block's, a legacy name
 * alias counting as the property it stands for.
 */
function isLaterContaining(pair: RelatedPair): boolean {
  const later = new Set(longhandsOf(pair.later.prop).map((longhand) => standardName(longhand)))
  return longhandsOf(pair.block.prop).every((longhand) => later.has(standardName(longhand)))
}

/**
 * Whether a declaration overrides another by being a bare declaration of the rule (template B).
 */
function isBareDeclaration(finding: Finding): boolean {
  const { overrider } = finding.candidate
  return overrider.kind === 'own' && overrider.top.kind === 'declaration'
}

/**
 * The overridden longhands in the longhand-over-shorthand form: the later property itself where
 * the block's shorthand sets every longhand of it, otherwise the longhands the two share. A legacy
 * name alias is named as the property it stands for.
 */
function overriddenName(pair: RelatedPair): string {
  const block = new Set(longhandsOf(pair.block.prop).map((longhand) => standardName(longhand)))
  const later = longhandsOf(pair.later.prop).map((longhand) => standardName(longhand))
  if (later.every((longhand) => block.has(longhand))) {
    const standard = standardName(pair.later.prop)
    return standard === pair.later.prop.toLowerCase() ? pair.later.prop : standard
  }
  return joinList([...new Set(later.filter((longhand) => block.has(longhand)))])
}

/**
 * The `so` clause after the place: how the values read.
 */
function valueClause(finding: Finding): string {
  const [first] = finding.pairs
  const { block, later } = first!
  const isBare = isBareDeclaration(finding)
  const blockValue = printedValue(block.value)
  const laterValue = printedValue(later.value)
  if (
    finding.pairs.length > 1 ||
    (!isSameProperty(block.prop, later.prop) && isLaterContaining(first!))
  ) {
    const list = joinList([...new Set(finding.pairs.map((pair) => pair.block.prop))])
    return `${later.prop}: ${laterValue} replaces ${list}`
  }
  if (isSameProperty(block.prop, later.prop)) {
    return `${block.prop} is ${laterValue}, not ${blockValue}`
  }
  const subject = isBare ? 'it' : `its ${later.prop}: ${laterValue}`
  if (isLogicalPhysicalPair(block.prop, later.prop)) {
    return `${subject} may override ${block.prop}: ${blockValue}, depending on writing mode`
  }
  return `${subject} replaces the ${overriddenName(first!)} that ${block.prop}: ${blockValue} sets`
}

/**
 * The place the block's value holds and, when the overrider has a place of its own, that too.
 */
function placeClause(finding: Finding): string {
  const { unit, candidate } = finding
  const placed = {
    conditions: unit.conditions,
    said: unit.placeStates,
    selector: unit.placeSelector ?? unit.selector,
  }
  const place = whereOf(placed.selector, unit.conditions)
  const also = alsoWhere(placed, {
    selector: candidate.holderSelector,
    conditions: candidate.conditions,
  })
  return also === '' ? place : `${place} while also ${also},`
}

/**
 * How the overrider is named at the start of the warning and in the fix.
 */
function overriderName(finding: Finding): string {
  const { overrider, declaration } = finding.candidate
  if (overrider.kind === 'atom') return `"${overrider.atom.name}"`
  if (overrider.top.kind === 'declaration') {
    return `${declaration.prop}: ${printedValue(declaration.value)}`
  }
  if (finding.outward?.overrider !== undefined) return finding.outward.overrider
  if (overrider.top.kind === 'rule') return `the ${printedValue(overrider.top.selector)} block`
  return `the @${overrider.top.name} ${printedValue(overrider.top.prelude)} block`
}

/**
 * The sentence that says what to do to let the atom win.
 */
function fixSentence(finding: Finding, context: TextContext): string | undefined {
  if (finding.canMove !== true) return undefined
  const { unit, candidate } = finding
  const atom = `"${unit.atom.name}"`
  const { overrider } = candidate
  if (finding.outward !== undefined) {
    const moved =
      overrider.kind === 'own'
        ? overriderName(finding)
        : `the directive that names "${overrider.atom.name}"`
    return `To let ${atom} win, move ${moved} above ${finding.outward.above}.`
  }
  if (overrider.kind === 'own')
    return `To let ${atom} win, move ${overriderName(finding)} above the directive.`
  const later = `"${overrider.atom.name}"`
  if (overrider.directive.ref !== unit.directive.ref || context.moveAfter === undefined) {
    return `To let ${atom} win, move it into the later directive, after ${later}.`
  }
  const occurrences = unit.directive.atoms.filter((named) => named.name === unit.atom.name)
  const printed = reorderedDirective(unit.directive.prelude, unit.directive.atoms, {
    moving: occurrences.map((named) => named.atomIndex),
    after: context.moveAfter,
  })
  return `To let ${atom} win, name it after ${later}: \`${printed}\`.`
}

/**
 * The sentence that says how to mark the directive when the override is meant.
 */
function markerSentence(finding: Finding, context: TextContext): string {
  const { unit, candidate } = finding
  const { overrider } = candidate
  const printed = `\`${context.markedDirective}\``
  if (overrider.kind === 'own') {
    return `If it is meant to win, mark the directive that names "${unit.atom.name}": ${printed}`
  }
  const isSameDirective = overrider.directive.ref === unit.directive.ref
  const target = isSameDirective
    ? 'mark the directive'
    : `mark the directive that names "${unit.atom.name}"`
  return `If "${overrider.atom.name}" is meant to win, ${target}: ${printed}`
}

/**
 * The sentence about how the result was before this release, for an overrider that is not itself
 * an atom's block (the blocks used to be placed last, so the atom won). A directive in a nested
 * rule paired with what the enclosing rule holds after it has none: the later content won then too.
 */
function migrationSentence(finding: Finding): string | undefined {
  const { overrider } = finding.candidate
  const isBlock = overrider.kind === 'atom' && overrider.isBlock
  if (isBlock || finding.outward !== undefined) return undefined
  return overriderSentence(finding.unit.atom.name)
}

/**
 * The whole warning for `finding`, without the host's frame.
 */
export function findingText(finding: Finding, context: TextContext): string {
  const opening = `${overriderName(finding)} comes after "${finding.unit.atom.name}"`
  const reason = `so ${placeClause(finding)} ${valueClause(finding)}.`
  const sentences = [
    `@nave: ${opening}, ${reason}`,
    focusClauseOf(finding),
    migrationSentence(finding),
    fixSentence(finding, context),
    markerSentence(finding, context),
  ]
  return sentences.filter((sentence) => sentence !== undefined).join(' ')
}
