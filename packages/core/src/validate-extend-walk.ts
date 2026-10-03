/**
 * The walk `validateExtendAtoms` (PostCSS-backed) and
 * `validateExtendAtomsHostFree` (the core's own tokenizer) share: which strings of an atom map
 * are checked, and what a refusal says. What "parses as exactly one declaration, selector or
 * condition" MEANS is each caller's own, handed in as `Predicates`, so a host-specific validator
 * owns only its parser while the two can never disagree on the shape of the walk or the error
 * text. A refusal carries one of three reasons, and the text says which: the string would break
 * out of the rule it is spliced into, the value is not a plain object, or the string parses but
 * would not be written back exactly as given.
 */
import type { ExtendMap } from './directive/resolve.ts'
import type { Splice } from './validate-extend-breakout.ts'

import { boxedPrimitiveKind, isPlainObject, unboxedPrimitive } from './directive/plain-object.ts'
import { isInsideRule } from './validate-extend-breakout.ts'

/**
 * Why a validator refused a string: it does not parse as the one construct it is meant to be
 * (`'break-out'`), or it parses as that one construct but would not be written back exactly as
 * given (`'rewritten'`). A validator answers `undefined` for a string it accepts.
 */
export type Refusal = 'break-out' | 'rewritten'

export interface Predicates {
  /**
  Why `prop: value` is not exactly one declaration with `prop` unchanged, or `undefined` when it is.
   */
  readonly declarationRefusal: (prop: string, value: string) => Refusal | undefined
  /**
  Why `prop` alone is not a declaration property, whatever value it is paired with, or `undefined`.
   */
  readonly propRefusal: (prop: string) => Refusal | undefined
  /**
  Why `key` is not exactly one anchored pseudo/attribute selector rule with no declarations, or `undefined`.
   */
  readonly selectorRefusal: (key: string) => Refusal | undefined
  /**
  Why `condition` is not exactly one `@media`/`@container` prelude, with no body, or `undefined`.
   */
  readonly conditionRefusal: (
    atName: 'container' | 'media',
    condition: string,
  ) => Refusal | undefined
}

/**
 * Throws `describedAs` followed by `clause`, then the sentence every refusal ends with.
 */
function refuse(describedAs: string, clause: string): never {
  throw new Error(
    `navePlugin({ extend }): ${describedAs} ${clause} extend is trusted, consumer-authored ` +
      'code, not sanitised input — fix the atom definition.',
  )
}

/**
 * The CSS escape for `<` that the text of a refusal tells the reader to write.
 */
const ESCAPED_LESS_THAN = String.raw`\3c`

/**
 * Throws for a string a validator refused, with the clause for its reason. `splice` says where the
 * string sits, so the expander's own output for it tells a string that breaks out of its rule from
 * one that is not exactly one construct but stays inside it.
 */
function fail(describedAs: string, reason: Refusal, value: string, splice: Splice): never {
  if (reason === 'rewritten') {
    refuse(
      describedAs,
      `parses, but would not be written back exactly as given: ${JSON.stringify(value)}. ` +
        `A "<" before "style", "/style" or "!--" is written back escaped: write the "<" as ${ESCAPED_LESS_THAN} ` +
        `with a space after it (${ESCAPED_LESS_THAN} /style), or as %3C inside a URL. ` +
        'Whitespace at either end of it is not written back as given: remove it.',
    )
  }
  const clause = 'does not parse as a single CSS declaration, selector or condition, '
  if (isInsideRule(splice)) {
    refuse(
      describedAs,
      `${clause}though it would stay inside the rule it is spliced into: ${JSON.stringify(value)}. ` +
        'Write exactly one, with nothing else in it: no ";" or second declaration, no comment, ' +
        'and no trailing backslash.',
    )
  }
  refuse(
    describedAs,
    `${clause}and would break out of the rule it is spliced into: ${JSON.stringify(value)}.`,
  )
}

/**
 * `value` with the article its kind is named with in an error: `a function`, `an array`,
 * `a string`, `a number`, `a boolean`, or for a boxed primitive `a String object`.
 */
function kindOf(value: unknown): string {
  if (Array.isArray(value)) return 'an array'
  const boxed = boxedPrimitiveKind(value)
  return boxed === undefined ? `a ${typeof value}` : `a ${boxed} object`
}

/**
 * `value` as it is quoted in an error, or `undefined` when it is not worth quoting: a function,
 * or a value JSON cannot print (a BigInt, a circular array). A refusal prints the value once, and
 * never fails on printing it.
 */
function quoted(value: unknown): string | undefined {
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'number') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

/**
 * `value` as it is quoted in an error. A boxed primitive is quoted as the primitive it stands for.
 */
function printable(value: unknown): string | undefined {
  const isBoxed = boxedPrimitiveKind(value) !== undefined
  return quoted(isBoxed ? unboxedPrimitive(value as object) : value)
}

/**
 * Throws for a value that is not a plain object, naming its kind. An atom is told to be written as
 * `{ declarations: { ... } }`; a nested map or block is told to be a plain object.
 */
function failShape(describedAs: string, value: unknown, isAtom: boolean): never {
  const printed = printable(value)
  const shown = printed === undefined ? '' : `: ${printed}`
  const advice = isAtom
    ? 'Write an atom as { declarations: { ... } }.'
    : 'Write it as a plain object ({ ... }).'
  refuse(describedAs, `is ${kindOf(value)}, not a plain object${shown}. ${advice}`)
}

/**
 * Refuses a nested map or block that is truthy but not a plain object. A falsy one (`null`,
 * `undefined`, `false`, `0`, `''`) is skipped, as it always was, so `pseudos: hasHover && { ... }`
 * keeps building. `directive/resolve.ts` reads a map with `Object.entries`, so an array or a
 * string would be rendered as declarations without the per-string checks ever seeing it.
 */
function assertShape(value: unknown, describedAs: string): void {
  if (!value || isPlainObject(value)) return
  failShape(describedAs, value, false)
}

/**
 * Validates every property/value pair of a `declarations` map, if it is one.
 */
function assertDeclarationsSafe(declarations: unknown, where: string, p: Predicates): void {
  assertShape(declarations, `${where}'s declarations`)
  if (!isPlainObject(declarations)) return
  for (const [prop, value] of Object.entries(declarations)) {
    const propRefusal = p.propRefusal(prop)
    if (propRefusal) {
      fail(`${where}'s declaration property "${prop}"`, propRefusal, prop, {
        declarations: { [prop]: '0' },
        kind: 'declarations',
      })
    }
    if (typeof value !== 'string') continue
    const valueRefusal = p.declarationRefusal(prop, value)
    if (valueRefusal) {
      fail(`${where}'s declaration value for "${prop}"`, valueRefusal, value, {
        declarations: { [prop]: value },
        kind: 'declarations',
      })
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
    const refusal = p.selectorRefusal(pseudo)
    if (refusal) {
      fail(`${where}'s pseudo "${pseudo}"`, refusal, pseudo, { key: pseudo, kind: 'pseudo' })
    }
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
  assertShape(blocks, `${where}'s ${atName} map`)
  if (!isPlainObject(blocks)) return
  for (const [condition, block] of Object.entries(blocks)) {
    const refusal = p.conditionRefusal(atName, condition)
    if (refusal) {
      fail(`${where}'s ${atName} condition "${condition}"`, refusal, condition, {
        atName,
        condition,
        kind: 'condition',
      })
    }
    const blockWhere = `${where}'s ${atName} "${condition}"`
    assertShape(block, `${blockWhere} block`)
    if (!isPlainObject(block)) continue
    assertDeclarationsSafe(block.declarations, blockWhere, p)
    assertPseudosSafe(block.pseudos, blockWhere, p)
  }
}

/**
 * Validates every consumer-supplied atom in `extend` against `predicates`. Nave's own built-in
 * atoms are never checked: they are this package's own trusted source, not the hardening
 * boundary this exists for. A falsy atom (`null`, `undefined`, `false`, `0`, `''`) is a
 * registered-but-empty key: it is skipped here and read as an unknown atom where a directive uses
 * it. Any other atom, or map inside one (its own `declarations` included), that is not a plain
 * object is refused here by name, used or not.
 */
export function walkExtendAtoms(extend: ExtendMap, predicates: Predicates): void {
  for (const [name, atom] of Object.entries(extend)) {
    if (!atom) continue
    const where = `atom "${name}"`
    if (!isPlainObject(atom)) failShape(where, atom, true)
    assertDeclarationsSafe(atom.declarations, where, predicates)
    assertPseudosSafe(atom.pseudos, where, predicates)
    assertAtBlocksSafe(atom.media, 'media', where, predicates)
    assertAtBlocksSafe(atom.container, 'container', where, predicates)
  }
}
