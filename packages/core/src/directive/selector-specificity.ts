import type { Token } from './tokenizer.ts'

/**
 * Selector specificity for the nesting-aware cascade check: how heavy `&` is inside a rule,
 * and which selectors of a nested list apply to the same element as `&` and at what weight.
 * Weights follow Selectors Level 4: `:is()`, `:not()` and `:has()` take their heaviest
 * argument, `:where()` weighs nothing, `:nth-child(An+B of S)` is a pseudo-class plus its
 * `S`, and a pseudo-element weighs as a type.
 */
import {
  type Complex,
  type Compound,
  hasPseudoElement,
  parseSelectorList,
  parseSelectorTokens,
  type Simple,
  subjectOf,
  tokensAfterOf,
} from './selector-compounds.ts'

/**
 * Specificity as the triple of ids, classes (attributes, pseudo-classes) and types
 * (pseudo-elements).
 */
export type Specificity = readonly [number, number, number]

const ZERO: Specificity = [0, 0, 0]
const ONE_CLASS: Specificity = [0, 1, 0]
const ONE_TYPE: Specificity = [0, 0, 1]
const ONE_ID: Specificity = [1, 0, 0]
const FIXED_WEIGHTS = {
  class: ONE_CLASS,
  id: ONE_ID,
  type: ONE_TYPE,
  universal: ZERO,
} as const
const ARGUMENT_MAX_PSEUDOS = new Set(['has', 'is', 'not'])
const NTH_PSEUDOS = new Set(['nth-child', 'nth-last-child'])
const SUBJECT_TRANSPARENT_PSEUDOS = new Set(['is', 'where'])

/**
 * How many functional pseudo-classes may nest inside one another before a selector is not read.
 * Weighing one recurses once per level, so a selector nested thousands deep would overflow the
 * stack of a build that only meant to warn; no stylesheet written by hand comes near this.
 */
const MAX_NESTING = 256

/**
 * Thrown inside this module when a selector nests deeper than `MAX_NESTING`; every exported
 * function catches it, because an unreadable selector is not compared, never a failure.
 */
class UnreadableSelector extends Error {}

/**
 * The depth one level further in, or an `UnreadableSelector` past the limit.
 */
function deeper(depth: number): number {
  if (depth >= MAX_NESTING) throw new UnreadableSelector('selector nests too deep to be read')
  return depth + 1
}

/**
 * Negative when `a` is lighter than `b`, positive when heavier, zero when equal: ids first,
 * then classes, then types.
 */
export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * The component-wise sum of two specificities.
 */
export function addSpecificity(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

/**
 * The heaviest of `specificities`, or `[0, 0, 0]` when there are none.
 */
export function maxSpecificity(specificities: readonly Specificity[]): Specificity {
  return specificities.reduce(
    (heaviest, next) => (compareSpecificity(next, heaviest) > 0 ? next : heaviest),
    ZERO,
  )
}

/**
 * The specificity of a functional pseudo-element: a type, plus the argument of `::slotted()`.
 */
function pseudoElementSpecificity(name: string, args: readonly Token[], weigh: Weigh): Specificity {
  if (name !== 'slotted') return ONE_TYPE
  const argument = listSpecificity(parseSelectorTokens(args), {
    ...weigh,
    depth: deeper(weigh.depth),
  })
  return addSpecificity(ONE_TYPE, argument)
}

/**
 * How `&` weighs while a selector is weighed, and how deep inside functional pseudo-classes the
 * weighing is.
 */
interface Weigh {
  readonly amp: Specificity
  readonly depth: number
}

/**
 * The specificity of a functional pseudo-class from its name and the specificity of its
 * argument selector list.
 */
function functionSpecificity(name: string, args: readonly Token[], weigh: Weigh): Specificity {
  if (name === 'where') return ZERO
  const inner = { ...weigh, depth: deeper(weigh.depth) }
  if (ARGUMENT_MAX_PSEUDOS.has(name)) return listSpecificity(parseSelectorTokens(args), inner)
  if (!NTH_PSEUDOS.has(name)) return ONE_CLASS
  const argument = listSpecificity(parseSelectorTokens(tokensAfterOf(args)), inner)
  return addSpecificity(ONE_CLASS, argument)
}

/**
 * The specificity of one simple selector, `&` weighing as `weigh.amp`.
 */
function simpleSpecificity(simple: Simple, weigh: Weigh): Specificity {
  if (simple.kind === 'nesting') return weigh.amp
  if (simple.kind === 'function') return functionSpecificity(simple.name, simple.args, weigh)
  if (simple.kind === 'pseudo-element')
    return pseudoElementSpecificity(simple.name, simple.args, weigh)
  return FIXED_WEIGHTS[simple.kind]
}

/**
 * The specificity of a whole complex selector: every simple selector of every compound.
 */
function complexSpecificity(complex: Complex, weigh: Weigh): Specificity {
  return complex
    .flat()
    .reduce((sum, simple) => addSpecificity(sum, simpleSpecificity(simple, weigh)), ZERO)
}

/**
 * The heaviest specificity among the complex selectors of a list.
 */
function listSpecificity(list: readonly Complex[], weigh: Weigh): Specificity {
  return maxSpecificity(list.map((complex) => complexSpecificity(complex, weigh)))
}

/**
 * Whether the declarations of a compound apply to the element `&` stands for: it holds `&`
 * directly, or through `:is()`/`:where()` with an argument whose own subject does.
 */
function isSubjectOnAmpersandElement(compound: Compound, depth: number): boolean {
  return compound.some((simple) => {
    if (simple.kind === 'nesting') return true
    if (simple.kind !== 'function' || !SUBJECT_TRANSPARENT_PSEUDOS.has(simple.name)) return false
    const inner = deeper(depth)
    return parseSelectorTokens(simple.args).some((arm) =>
      isSubjectOnAmpersandElement(subjectOf(arm), inner),
    )
  })
}

/**
 * Whether the complex selector ends on a pseudo-element: its subject compound holds one,
 * written `::before`, legacy `:before`, or functional `::part(x)`, with or without pseudo-classes after it.
 */
function isComplexEndingInPseudoElement(complex: Complex): boolean {
  return hasPseudoElement(subjectOf(complex))
}

/**
 * Whether the complex selector `complexSelector` ends in a pseudo-element.
 */
// eslint-disable-next-line unicorn/consistent-boolean-name -- the name states the proposition the caller asks
export function endsInPseudoElement(complexSelector: string): boolean {
  return parseSelectorList(complexSelector).some((complex) =>
    isComplexEndingInPseudoElement(complex),
  )
}

/**
 * Whether EVERY complex selector of `selectorList` ends in a pseudo-element.
 */
export function isPseudoElementOnlyList(selectorList: string): boolean {
  const list = parseSelectorList(selectorList)
  return list.length > 0 && list.every((complex) => isComplexEndingInPseudoElement(complex))
}

/**
 * The specificity `&` takes inside a rule whose selector list is `parentSelectorList`: the
 * heaviest of the complex selectors that do not end in a pseudo-element, since `&` never
 * matches through one. `[0, 0, 0]` when every selector ends in one (see
 * `isPseudoElementOnlyList`). A `&` in the parent list itself is the scoping root and weighs
 * as one class.
 */
export function ampersandSpecificity(parentSelectorList: string): Specificity {
  const onElement = parseSelectorList(parentSelectorList).filter(
    (complex) => !isComplexEndingInPseudoElement(complex),
  )
  try {
    return listSpecificity(onElement, { amp: ONE_CLASS, depth: 0 })
  } catch (error) {
    if (error instanceof UnreadableSelector) return ZERO
    throw error
  }
}

/**
 * The specificity of each complex selector of the nested list `selector` whose subject
 * compound is on the same element as `&` (directly, or through `:is()`/`:where()`), given
 * that `&` weighs `amp`. A selector whose subject is elsewhere (a descendant, a sibling, a
 * `&` only inside `:not()` or `:has()`) or is a pseudo-element contributes nothing, and neither
 * does a selector nested too deep to be read (see `MAX_NESTING`).
 */
export function nestedSpecificities(selector: string, amp: Specificity): readonly Specificity[] {
  try {
    return parseSelectorList(selector)
      .filter(
        (complex) =>
          !isComplexEndingInPseudoElement(complex) &&
          isSubjectOnAmpersandElement(subjectOf(complex), 0),
      )
      .map((complex) => complexSpecificity(complex, { amp, depth: 0 }))
  } catch (error) {
    if (error instanceof UnreadableSelector) return []
    throw error
  }
}
