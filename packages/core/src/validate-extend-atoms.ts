/**
 * Validates a `navePlugin({ extend })` atom map before any `@nave` directive can splice its
 * strings into generated CSS. `extend` is authored code in the consumer's own build, so this is
 * defence in depth rather than a trust boundary: a declaration, pseudo selector, or media/
 * container condition that does not parse as exactly the one construct it is meant to be can
 * break out of the declaration or rule it is spliced into and add sibling CSS the author never
 * wrote. Runs once, at plugin creation, so a bad atom fails the build immediately rather than
 * only when a `@nave` directive happens to use it.
 *
 * Validation is parse-based, not a character blocklist: each string is fed to `postcss.parse`
 * (or `anchorSelectorList`, for a pseudo key) wrapped in the minimal construct it is meant to
 * be, and accepted only if the result is exactly that one construct with nothing left over.
 * A declaration value carrying a literal `;`, `{` or `/*` inside a string or `url()` is
 * therefore fine — it never leaves the declaration — while a string that would open a second
 * rule, declaration or at-rule is refused, whether or not it uses those characters.
 */
import type { AtRule, Declaration, Rule } from 'postcss'

import postcss from 'postcss'

import type { AtomDefinition } from './atoms.ts'
import { anchorSelectorList } from './selector-utils.ts'

/**
 * Whether `value` is a non-array object node. Malformed shapes (`null`, an array, a primitive
 * where an object was expected) are deliberately left alone here: `postcss.ts`'s own per-use
 * checks already name and refuse those, with their own message, at the point a directive uses
 * the atom. Reproducing that check here would only race it to a worse error.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether `prop: value` parses as exactly one declaration inside exactly one rule, with `prop`
 * unchanged and the declaration's own serialisation (value plus `!important`, if present)
 * identical to `${prop}:${value}`. That last equality is what catches a value postcss accepts
 * but silently reshapes — a comment split off into a sibling node, for instance — without
 * having to special-case comments itself: reshaped or not, only a value that comes back
 * unchanged round-trips.
 */
function declarationIsValid(prop: string, value: string): boolean {
  let root
  try {
    root = postcss.parse(`a{${prop}:${value}}`)
  } catch {
    return false
  }
  if (root.nodes.length !== 1) return false
  const rule = root.nodes[0] as Rule
  if (rule.type !== 'rule' || rule.nodes.length !== 1) return false
  const decl = rule.nodes[0] as Declaration
  if (decl.type !== 'decl') return false
  return decl.prop === prop && decl.toString() === `${prop}:${value}`
}

/**
 * Whether `prop` alone parses as a declaration property, independent of whatever value it is
 * paired with. Used to isolate a property-name break-out from a value break-out so the two
 * cases can be told apart in the error message; the value placeholder (`0`) is a syntactically
 * neutral token, never itself the reason a check here fails.
 */
function propIsValid(prop: string): boolean {
  return declarationIsValid(prop, '0')
}

/**
 * Whether `key` parses as exactly one pseudo/attribute selector rule with no declarations,
 * once anchored the same way the nested-rule builders anchor it (`anchorSelectorList`). A key
 * that opens a second rule, or that `anchorSelectorList` itself refuses (an empty branch), is
 * invalid.
 */
function selectorIsValid(key: string): boolean {
  let selector: string
  try {
    selector = anchorSelectorList(key)
  } catch {
    return false
  }
  let root
  try {
    root = postcss.parse(`${selector}{}`)
  } catch {
    return false
  }
  if (root.nodes.length !== 1) return false
  const rule = root.nodes[0] as Rule
  return rule.type === 'rule' && rule.selector === selector && rule.nodes.length === 0
}

/**
 * Whether `condition` parses as exactly one `@media`/`@container` at-rule of that name, with no
 * body, whose `params` is the condition's own trimmed text.
 */
function conditionIsValid(atName: 'container' | 'media', condition: string): boolean {
  let root
  try {
    root = postcss.parse(`@${atName} ${condition}{}`)
  } catch {
    return false
  }
  if (root.nodes.length !== 1) return false
  const node = root.nodes[0] as AtRule
  return (
    node.type === 'atrule' &&
    node.name === atName &&
    node.params === condition.trim() &&
    (node.nodes?.length ?? 0) === 0
  )
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
function assertDeclarationsSafe(declarations: unknown, where: string): void {
  if (!isPlainObject(declarations)) return
  for (const [prop, value] of Object.entries(declarations)) {
    if (typeof prop === 'string' && !propIsValid(prop)) {
      fail(`${where}'s declaration property "${prop}"`, prop)
    }
    if (typeof value === 'string' && !declarationIsValid(prop, value)) {
      fail(`${where}'s declaration value for "${prop}"`, value)
    }
  }
}

/**
 * Validates every pseudo selector key, and its own declaration map, in a `pseudos` map, if it
 * is one.
 */
function assertPseudosSafe(pseudos: unknown, where: string): void {
  if (!isPlainObject(pseudos)) return
  for (const [pseudo, declarations] of Object.entries(pseudos)) {
    if (!selectorIsValid(pseudo)) fail(`${where}'s pseudo "${pseudo}"`, pseudo)
    assertDeclarationsSafe(declarations, `${where}'s pseudo "${pseudo}"`)
  }
}

/**
 * Validates every `media`/`container` condition string and its nested declarations/pseudos.
 */
function assertAtBlocksSafe(blocks: unknown, atName: 'container' | 'media', where: string): void {
  if (!isPlainObject(blocks)) return
  for (const [condition, block] of Object.entries(blocks)) {
    if (!conditionIsValid(atName, condition)) fail(`${where}'s ${atName} condition "${condition}"`, condition)
    if (!isPlainObject(block)) continue
    const blockWhere = `${where}'s ${atName} "${condition}"`
    assertDeclarationsSafe(block.declarations, blockWhere)
    assertPseudosSafe(block.pseudos, blockWhere)
  }
}

/**
 * Validates every consumer-supplied atom in `extend`. Nave's own built-in atoms are never
 * checked: they are this package's own trusted source, not the hardening boundary this exists
 * for. Any field that is not the shape `AtomDefinition` declares is left to the existing
 * per-use shape checks in `postcss.ts` rather than re-diagnosed here.
 */
export function validateExtendAtoms(extend: Record<string, AtomDefinition>): void {
  for (const [name, atom] of Object.entries(extend)) {
    if (!atom) continue
    const where = `atom "${name}"`
    assertDeclarationsSafe(atom.declarations, where)
    assertPseudosSafe(atom.pseudos, where)
    assertAtBlocksSafe(atom.media, 'media', where)
    assertAtBlocksSafe(atom.container, 'container', where)
  }
}
