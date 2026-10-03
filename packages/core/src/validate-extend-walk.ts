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
 * Whether `value` is a non-array object node.
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
 * `value` as text for an error, for a value JSON can fail to print (a BigInt, a circular array):
 * the refusal must stay this validator's own, never a serialisation error.
 */
function printable(value: unknown): string {
  try {
    return JSON.stringify(value) ?? typeof value
  } catch {
    return `a ${typeof value} value that cannot be printed`
  }
}

/**
 * Refuses an atom, or a nested map inside one, that is present but not a plain object. A function
 * is refused as well: it can answer a property read differently the second time, so what is
 * checked is not what is spliced. `directive/resolve.ts` reads such a
 * value with `Object.entries`, so an array or a string would be rendered as declarations without
 * the per-string checks ever seeing it. (The atom's own top-level `declarations` is left to
 * `resolve()`, which throws on it by name.)
 */
function assertShape(value: unknown, describedAs: string): void {
  if (value === undefined || value === null || isPlainObject(value)) return
  fail(describedAs, printable(value))
}

/**
 * Validates every property/value pair of a `declarations` map, if it is one.
 */
function assertDeclarationsSafe(
  declarations: unknown,
  where: string,
  p: Predicates,
  isNested = false,
): void {
  if (isNested) assertShape(declarations, `${where}'s declarations`)
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
  assertShape(pseudos, `${where}'s pseudos`)
  if (!isPlainObject(pseudos)) return
  for (const [pseudo, declarations] of Object.entries(pseudos)) {
    if (!p.isSelectorValid(pseudo)) fail(`${where}'s pseudo "${pseudo}"`, pseudo)
    assertDeclarationsSafe(declarations, `${where}'s pseudo "${pseudo}"`, p, true)
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
  assertShape(blocks, `${where}'s ${atName} map`)
  if (!isPlainObject(blocks)) return
  for (const [condition, block] of Object.entries(blocks)) {
    if (!p.isConditionValid(atName, condition))
      fail(`${where}'s ${atName} condition "${condition}"`, condition)
    const blockWhere = `${where}'s ${atName} "${condition}"`
    assertShape(block, `${blockWhere} block`)
    if (!isPlainObject(block)) continue
    assertDeclarationsSafe(block.declarations, blockWhere, p, true)
    assertPseudosSafe(block.pseudos, blockWhere, p)
  }
}

/**
 * Validates every consumer-supplied atom in `extend` against `predicates`. Nave's own built-in
 * atoms are never checked: they are this package's own trusted source, not the hardening
 * boundary this exists for. An atom, or a nested map inside one, that is not a plain object is
 * refused here by name; an atom's own `declarations` that is not a map is left to the per-use shape
 * check in `directive/resolve.ts` rather than re-diagnosed here.
 */
export function walkExtendAtoms(extend: ExtendMap, predicates: Predicates): void {
  for (const [name, atom] of Object.entries(extend)) {
    // `null` and `undefined` are a registered-but-empty key, read as an unknown atom where a
    // directive uses it. Anything else that is not a plain object is refused here, used or not.
    if (atom === null || atom === undefined) continue
    const where = `atom "${name}"`
    assertShape(atom, where)
    assertDeclarationsSafe(atom.declarations, where, predicates)
    assertPseudosSafe(atom.pseudos, where, predicates)
    assertAtBlocksSafe(atom.media, 'media', where, predicates)
    assertAtBlocksSafe(atom.container, 'container', where, predicates)
  }
}
