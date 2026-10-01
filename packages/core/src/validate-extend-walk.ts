/**
 * The walk `validateExtendAtoms` (PostCSS-backed) and
 * `validateExtendAtomsHostFree` (the core's own tokenizer) share: which strings of an atom map
 * are checked, and what a refusal says. What "parses as exactly one declaration, selector or
 * condition" MEANS is each caller's own, handed in as `Predicates`, so a host-specific validator
 * owns only its parser while the two can never disagree on the shape of the walk or the error
 * text.
 */
import type { ExtendMap } from './directive/resolve.ts'

export interface Predicates {
  /**
  Whether `prop: value` is exactly one declaration, `prop` unchanged.
   */
  readonly isDeclarationValid: (prop: string, value: string) => boolean
  /**
  Whether `prop` alone is a declaration property, whatever value it is paired with.
   */
  readonly isPropValid: (prop: string) => boolean
  /**
  Whether `key` is exactly one anchored pseudo/attribute selector rule with no declarations.
   */
  readonly isSelectorValid: (key: string) => boolean
  /**
  Whether `condition` is exactly one `@media`/`@container` prelude, with no body.
   */
  readonly isConditionValid: (atName: 'container' | 'media', condition: string) => boolean
}

/**
 * Whether `value` is a non-array object node. Malformed shapes (`null`, an array, a primitive
 * where an object was expected) are deliberately left alone here: the per-use checks in
 * `directive/resolve.ts` already name and refuse those, with their own message, at the point a
 * directive uses the atom. Reproducing that check here would only race it to a worse error.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Throws describing `describedAs` as not parsing as a single CSS declaration, selector or
 * condition, naming the offending string.
 */
function fail(describedAs: string, value: string): never {
  throw new Error(
    `navePlugin({ extend }): ${describedAs} does not parse as a single CSS declaration, ` +
      'selector or condition, and would break out of the rule it is spliced into: ' +
      `${JSON.stringify(value)}. extend is trusted, consumer-authored code, not sanitised ` +
      'input — fix the atom definition.',
  )
}

/**
 * Validates every property/value pair of a `declarations` map, if it is one.
 */
function assertDeclarationsSafe(declarations: unknown, where: string, p: Predicates): void {
  if (!isPlainObject(declarations)) return
  for (const [prop, value] of Object.entries(declarations)) {
    if (typeof prop === 'string' && !p.isPropValid(prop)) {
      fail(`${where}'s declaration property "${prop}"`, prop)
    }
    if (typeof value === 'string' && !p.isDeclarationValid(prop, value)) {
      fail(`${where}'s declaration value for "${prop}"`, value)
    }
  }
}

/**
 * Validates every pseudo selector key, and its own declaration map, in a `pseudos` map, if it
 * is one.
 */
function assertPseudosSafe(pseudos: unknown, where: string, p: Predicates): void {
  if (!isPlainObject(pseudos)) return
  for (const [pseudo, declarations] of Object.entries(pseudos)) {
    if (!p.isSelectorValid(pseudo)) fail(`${where}'s pseudo "${pseudo}"`, pseudo)
    assertDeclarationsSafe(declarations, `${where}'s pseudo "${pseudo}"`, p)
  }
}

/**
 * Validates every `media`/`container` condition string and its nested declarations/pseudos.
 */
function assertAtBlocksSafe(
  blocks: unknown,
  atName: 'container' | 'media',
  where: string,
  p: Predicates,
): void {
  if (!isPlainObject(blocks)) return
  for (const [condition, block] of Object.entries(blocks)) {
    if (!p.isConditionValid(atName, condition))
      fail(`${where}'s ${atName} condition "${condition}"`, condition)
    if (!isPlainObject(block)) continue
    const blockWhere = `${where}'s ${atName} "${condition}"`
    assertDeclarationsSafe(block.declarations, blockWhere, p)
    assertPseudosSafe(block.pseudos, blockWhere, p)
  }
}

/**
 * Validates every consumer-supplied atom in `extend` against `predicates`. Nave's own built-in
 * atoms are never checked: they are this package's own trusted source, not the hardening
 * boundary this exists for. Any field that is not the shape `AtomDefinition` declares is left to
 * the per-use shape checks in `directive/resolve.ts` rather than re-diagnosed here.
 */
export function walkExtendAtoms(extend: ExtendMap, predicates: Predicates): void {
  for (const [name, atom] of Object.entries(extend)) {
    if (!atom) continue
    const where = `atom "${name}"`
    assertDeclarationsSafe(atom.declarations, where, predicates)
    assertPseudosSafe(atom.pseudos, where, predicates)
    assertAtBlocksSafe(atom.media, 'media', where, predicates)
    assertAtBlocksSafe(atom.container, 'container', where, predicates)
  }
}
