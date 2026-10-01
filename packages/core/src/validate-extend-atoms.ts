/**
 * Validates a `navePlugin({ extend })` atom map before any `@nave` directive can splice its
 * strings into generated CSS. `extend` is authored code in the consumer's own build, so this is
 * defence in depth rather than a trust boundary: a declaration, pseudo selector, or media/
 * container condition that does not parse as exactly the one construct it is meant to be can
 * break out of the declaration or rule it is spliced into and add sibling CSS the author never
 * wrote. Runs at plugin creation for an atom map passed directly, and again after every load of
 * an atom map passed as a module specifier (a dev server can hand it a different module on every
 * rebuild), before either is assigned for use, so a bad atom fails the build immediately rather
 * than only when a `@nave` directive happens to use it.
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

import type { ExtendMap } from './directive/resolve.ts'

import { anchorSelectorList } from './selector-utils.ts'
import { walkExtendAtoms } from './validate-extend-walk.ts'

/**
 * Whether `prop: value` parses as exactly one declaration inside exactly one rule, with `prop`
 * unchanged and the declaration's own serialisation (value plus `!important`, if present)
 * identical to `${prop}:${value}`. That last equality is what catches a value postcss accepts
 * but silently reshapes — a comment split off into a sibling node, for instance — without
 * having to special-case comments itself: reshaped or not, only a value that comes back
 * unchanged round-trips.
 */
function isDeclarationValid(prop: string, value: string): boolean {
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
  return decl.prop === prop && decl.toString() === `${prop}:${value}`.trimEnd()
}

/**
 * Whether `prop` alone parses as a declaration property, independent of whatever value it is
 * paired with. Used to isolate a property-name break-out from a value break-out so the two
 * cases can be told apart in the error message; the value placeholder (`0`) is a syntactically
 * neutral token, never itself the reason a check here fails.
 */
function isPropValid(prop: string): boolean {
  return isDeclarationValid(prop, '0')
}

/**
 * Whether `key` parses as exactly one pseudo/attribute selector rule with no declarations,
 * once anchored the same way the nested-rule builders anchor it (`anchorSelectorList`). A key
 * that opens a second rule, or that `anchorSelectorList` itself refuses (an empty branch), is
 * invalid.
 */
function isSelectorValid(key: string): boolean {
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
function isConditionValid(atName: 'container' | 'media', condition: string): boolean {
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
 * Validates every consumer-supplied atom in `extend` by parsing each string with PostCSS. The
 * walk itself, and what a refusal says, is `validate-extend-walk.ts`'s, shared with the
 * dependency-free validator the Vite plugin uses.
 */
export function validateExtendAtoms(extend: ExtendMap): void {
  walkExtendAtoms(extend, { isDeclarationValid, isPropValid, isSelectorValid, isConditionValid })
}
