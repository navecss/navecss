/**
 * Validates a `navePlugin({ extend })` atom map before any `@nave` directive can splice its
 * strings into generated CSS. `extend` is authored code in the consumer's own build, so this is
 * defence in depth rather than a trust boundary: an atom whose declaration value, pseudo/media
 * condition, or property name carries `{`, `}`, `;` or a `/*` comment opener can break out of the
 * declaration or rule it is spliced into and add sibling CSS the author never wrote. Runs once,
 * at plugin creation, so a bad atom fails the build immediately rather than only when a `@nave`
 * directive happens to use it.
 */
import type { AtomDefinition } from './atoms.ts'

const UNSAFE_PATTERN = /[{};]|\/\*/

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
 * Throws when `value` is a string carrying `{`, `}`, `;` or a `/*` comment opener; a no-op for
 * anything else, so a malformed shape is left to `postcss.ts`'s own per-use checks.
 */
function assertSafe(value: unknown, describedAs: string): void {
  if (typeof value !== 'string' || !UNSAFE_PATTERN.test(value)) return
  throw new Error(
    `navePlugin({ extend }): ${describedAs} contains "{", "}", ";" or a comment opener ("/*"): ` +
      `${JSON.stringify(value)}. These break out of the CSS declaration or rule the string is ` +
      'spliced into. extend is trusted, consumer-authored code, not sanitised input — fix the ' +
      'atom definition.',
  )
}

/**
 * Validates every property/value pair of a `declarations` map, if it is one.
 */
function assertDeclarationsSafe(declarations: unknown, where: string): void {
  if (!isPlainObject(declarations)) return
  for (const [prop, value] of Object.entries(declarations)) {
    assertSafe(prop, `${where}'s declaration property "${prop}"`)
    assertSafe(value, `${where}'s declaration value for "${prop}"`)
  }
}

/**
 * Validates every pseudo selector's own declaration map in a `pseudos` map, if it is one.
 */
function assertPseudosSafe(pseudos: unknown, where: string): void {
  if (!isPlainObject(pseudos)) return
  for (const [pseudo, declarations] of Object.entries(pseudos)) {
    assertDeclarationsSafe(declarations, `${where}'s pseudo "${pseudo}"`)
  }
}

/**
 * Validates every `media`/`container` condition string and its nested declarations/pseudos.
 */
function assertAtBlocksSafe(blocks: unknown, atName: string, where: string): void {
  if (!isPlainObject(blocks)) return
  for (const [condition, block] of Object.entries(blocks)) {
    assertSafe(condition, `${where}'s ${atName} condition "${condition}"`)
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
