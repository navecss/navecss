/**
 * The warnings about the shape a rule's output takes under its selector list. A rule whose every
 * selector is a pseudo-element gets none of its atoms' blocks (`&` matches no pseudo-element). In
 * a list that mixes pseudo-element selectors with others, a run of declarations written inside
 * `& { }` does not reach the pseudo-element ones; and a run written there matches with the
 * specificity of the list's most specific selector, not each selector's own.
 */
import type { PlanWarning } from './rule-model.ts'
import type { DirectiveRunFact, DroppedFact, OwnRunFact, PlanState } from './rule-state.ts'

import { splitTopLevel } from '../selector-utils.ts'
import { wrappedPseudoElementSentence, wrappedSpecificitySentence } from './migration.ts'
import { directiveWithAtomsBefore } from './order-print.ts'
import { joinList } from './order-text.ts'
import {
  ampersandSpecificity,
  compareSpecificity,
  endsInPseudoElement,
  maxSpecificity,
  type Specificity,
} from './selector-specificity.ts'

const WRAP = '`& { }`'

/**
 * The selectors of the list, split into those that end in a pseudo-element and the rest.
 */
interface Selectors {
  readonly others: readonly string[]
  readonly pseudoElements: readonly string[]
}

/**
 * The selectors of `list`, as written.
 */
function splitSelectors(list: string): Selectors {
  const all = splitTopLevel(list)
    .map((selector) => selector.trim())
    .filter((selector) => selector !== '')
  return {
    pseudoElements: all.filter((selector) => endsInPseudoElement(selector)),
    others: all.filter((selector) => !endsInPseudoElement(selector)),
  }
}

/**
 * The names quoted and joined: `"a" and "b"`.
 */
function quoted(names: readonly string[]): string {
  return joinList(names.map((name) => `"${name}"`))
}

/**
 * Where a run's warning is reported.
 */
function anchorOf(run: DirectiveRunFact | OwnRunFact): PlanWarning['anchor'] {
  if (run.kind === 'own') return { ref: run.anchorRef, offset: undefined }
  return { ref: run.directive.ref, offset: run.atoms[0]!.offset }
}

/**
 * The warning for a run wrapped in a list with a pseudo-element selector, template b1, b2 or b3.
 */
function pseudoElementText(run: DirectiveRunFact | OwnRunFact, pseudo: string): string {
  const other = `Or move ${pseudo} to a separate rule, with or without them.`
  if (run.kind === 'own') {
    return `@nave: the declarations after ${run.nested} are written inside ${WRAP}, which cannot match a pseudo-element, so they do not apply to ${pseudo}. ${wrappedPseudoElementSentence()} To apply them there too, move them above ${run.above}. ${other}`
  }
  const atoms = quoted(run.atoms.map((atom) => atom.name))
  const sentence = run.isWrappedBefore ? '' : ` ${wrappedPseudoElementSentence()}`
  const separate = `Move ${pseudo} to a separate rule, with or without them.`
  if (run.follows) return followsText(run, { atoms, pseudo, sentence, separate, other })
  const nestedSentence = run.nested.block && !run.isWrappedBefore ? sentence : ''
  const move = run.canMoveDirective
    ? ` To apply them there too, move the directive above ${run.above}. ${other}`
    : ` ${separate}`
  return `@nave: this directive comes after ${run.nested.text}, so the declarations of ${atoms} are written inside ${WRAP}, which cannot match a pseudo-element: they do not apply to ${pseudo}.${nestedSentence}${move}`
}

/**
 * Template b2: the run follows a block of an atom of its own directive.
 */
function followsText(
  run: DirectiveRunFact,
  parts: { atoms: string; other: string; pseudo: string; sentence: string; separate: string },
): string {
  const { follows } = run
  const head = `@nave: the declarations of ${parts.atoms} follow the block of "${follows!.atom.name}" ${follows!.where}, so they are written inside ${WRAP}, which cannot match a pseudo-element: they do not apply to ${parts.pseudo}.${parts.sentence}`
  if (!run.canReorder) return `${head} ${parts.separate}`
  const printed = directiveWithAtomsBefore(run.directive.prelude, run.directive.atoms, {
    moving: run.atoms.map((atom) => atom.atomIndex),
    before: follows!.atom.atomIndex,
  })
  return `${head} To apply them there too, name ${parts.atoms} before "${follows!.atom.name}": \`${printed}\`. ${parts.other}`
}

/**
 * The selectors grouped by specificity, the pseudo-element ones joining the first group, as the
 * rule rewritten once for each group: `` `a, c::before` and `b` ``.
 */
function groupsText(selectors: Selectors, specificities: readonly Specificity[]): string {
  const groups: { readonly members: string[]; readonly specificity: Specificity }[] = []
  for (const [index, selector] of selectors.others.entries()) {
    const specificity = specificities[index]!
    const group = groups.find((g) => compareSpecificity(g.specificity, specificity) === 0)
    if (group) group.members.push(selector)
    else groups.push({ specificity, members: [selector] })
  }
  groups[0]!.members.push(...selectors.pseudoElements)
  return joinList(groups.map((group) => `\`${group.members.join(', ')}\``))
}

/**
 * The warning for a run wrapped under a list whose selectors differ in specificity.
 */
function wrapText(run: DirectiveRunFact | OwnRunFact, selectors: Selectors): string {
  const specificities = selectors.others.map((selector) => ampersandSpecificity(selector))
  const highest = maxSpecificity(specificities)
  const mostIndex = specificities.findIndex((s) => compareSpecificity(s, highest) === 0)
  const most = selectors.others[mostIndex]!
  const less = selectors.others.filter(
    (_s, i) => compareSpecificity(specificities[i]!, highest) < 0,
  )
  const list = selectors.others.join(', ')
  const wholeList = [`:is(${list})`, ...selectors.pseudoElements].join(', ')
  const subject =
    run.kind === 'own'
      ? `the declarations after ${run.nested}`
      : `the declarations of ${quoted(run.atoms.map((atom) => atom.name))}`
  const sentence =
    run.kind === 'directive' && run.isWrappedBefore ? '' : ` ${wrappedSpecificitySentence()}`
  return `@nave: ${subject} are written inside ${WRAP}, which under the selector list ${list} matches with the specificity of ${most}, so where ${joinList(less, 'or')} matches they can win over a rule elsewhere that is more specific than ${joinList(less, 'or')}.${sentence} To give each selector its own specificity, write the rule once for each of ${groupsText(selectors, specificities)}. To give the whole rule the specificity of ${most}, write the list as \`${wholeList}\`.`
}

/**
 * Whether the list's non-pseudo-element selectors differ in specificity.
 */
function isUnequal(selectors: Selectors): boolean {
  const [first, ...rest] = selectors.others.map((selector) => ampersandSpecificity(selector))
  return first !== undefined && rest.some((s) => compareSpecificity(s, first) !== 0)
}

/**
 * The warning about one directive's blocks left out of a rule whose every selector is a pseudo-element.
 */
function droppedWarning(fact: DroppedFact): PlanWarning {
  const blocks = fact.atoms.flatMap(({ atom, wheres }) =>
    wheres.map((where) => `the block of "${atom.name}" ${where}`),
  )
  const atoms = quoted(fact.atoms.map(({ atom }) => atom.name))
  const declarations = fact.atoms
    .flatMap(({ declarations: own }) => own.map((d) => `${d.prop}: ${d.value}`))
    .join('; ')
  const tail =
    declarations === ''
      ? ''
      : ` and write these declarations in the rule instead: \`${declarations}\``
  return {
    anchor: { ref: fact.directive.ref, offset: undefined },
    text: `@nave: every selector in this rule ends in a pseudo-element, and an atom's pseudo-class, @media and @container blocks are written on \`&\`, which cannot match one, so this directive leaves out ${joinList(blocks)}. Remove ${atoms} from the directive${tail}. If a block was meant for the pseudo-element, write a rule for the pseudo-element under that condition yourself.`,
  }
}

/**
 * Every warning about the shape of a rule's output.
 */
export function shapeWarnings(state: PlanState): PlanWarning[] {
  if (state.isPseudoElementRule) return state.dropped.map((fact) => droppedWarning(fact))
  if (state.runs.length === 0) return []
  const selectors = splitSelectors(state.input.selector)
  const isMixed = selectors.pseudoElements.length > 0 && selectors.others.length > 0
  const hasUnequal = isUnequal(selectors)
  const pseudo = selectors.pseudoElements.join(', ')
  return state.runs.flatMap((run) => {
    const anchor = anchorOf(run)
    const found: PlanWarning[] = []
    if (isMixed) found.push({ anchor, text: pseudoElementText(run, pseudo) })
    if (hasUnequal) found.push({ anchor, text: wrapText(run, selectors) })
    return found
  })
}
