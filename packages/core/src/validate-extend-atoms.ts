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
import type { Refusal } from './validate-extend-walk.ts'

import { anchorSelectorList } from './selector-utils.ts'
import { walkExtendAtoms } from './validate-extend-walk.ts'

/**
 * `text` as PostCSS wrote it with the `<` it escapes (before `style`, `/style` or `!--`) put back.
 */
function unescapeHtml(text: string): string {
  return text.replaceAll(/\\3c (?=\/?style\b|!--)/gi, '<')
}

/**
 * `text` without any whitespace, for telling a string PostCSS wrote back with only its whitespace
 * at an end changed from one it read as something else.
 */
function compact(text: string): string {
  return text.replaceAll(/\s+/g, '')
}

/**
 * Why `prop: value` is not exactly one declaration inside exactly one rule with `prop` unchanged,
 * or `undefined` when it is. A text PostCSS does not read as that one declaration would break out
 * of the rule. One it reads as exactly that, and writes back changed only by escaping a `<` or by
 * keeping a space at the end that the text's own trim would drop, is `'rewritten'`: PostCSS
 * accepts it, but not as given. (The comparison is against what PostCSS wrote, so a `;` of the
 * value's own or a comment it split off is still a break-out.)
 */
function declarationRefusal(prop: string, value: string): Refusal | undefined {
  let root
  try {
    root = postcss.parse(`a{${prop}:${value}}`)
  } catch {
    return 'break-out'
  }
  if (root.nodes.length !== 1) return 'break-out'
  const rule = root.nodes[0] as Rule
  if (rule.type !== 'rule' || rule.nodes.length !== 1) return 'break-out'
  const decl = rule.nodes[0] as Declaration
  if (decl.type !== 'decl' || decl.prop !== prop) return 'break-out'
  const given = `${prop}:${value}`
  const written = decl.toString()
  if (written === given.trimEnd()) return undefined
  return compact(unescapeHtml(written)) === compact(given) ? 'rewritten' : 'break-out'
}

/**
 * Why `prop` alone does not parse as a declaration property, independent of whatever value it is
 * paired with, or `undefined`. Used to isolate a property-name break-out from a value break-out so
 * the two cases can be told apart in the error message; the value placeholder (`0`) is a
 * syntactically neutral token, never itself the reason a check here fails.
 */
function propRefusal(prop: string): Refusal | undefined {
  return declarationRefusal(prop, '0')
}

/**
 * Why `key` does not parse as exactly one pseudo/attribute selector rule with no declarations,
 * once anchored the same way the nested-rule builders anchor it (`anchorSelectorList`), or
 * `undefined`. A key that opens a second rule, or that `anchorSelectorList` itself refuses (an
 * empty branch), would break out.
 */
function selectorRefusal(key: string): Refusal | undefined {
  let selector: string
  try {
    selector = anchorSelectorList(key)
  } catch {
    return 'break-out'
  }
  let root
  try {
    root = postcss.parse(`${selector}{}`)
  } catch {
    return 'break-out'
  }
  if (root.nodes.length !== 1) return 'break-out'
  const rule = root.nodes[0] as Rule
  const isOneEmptyRule = rule.type === 'rule' && rule.selector === selector
  return isOneEmptyRule && rule.nodes.length === 0 ? undefined : 'break-out'
}

/**
 * Why `condition` does not parse as exactly one `@media`/`@container` at-rule of that name, with
 * no body, or `undefined`. One that parses as that at-rule but whose `params` is not the
 * condition's own trimmed text only because PostCSS kept a character at an end that the trim
 * removes and CSS does not count as whitespace is `'rewritten'`; a comment PostCSS lifted out of
 * `params` is not, it reads the text two ways.
 */
function conditionRefusal(atName: 'container' | 'media', condition: string): Refusal | undefined {
  let root
  try {
    root = postcss.parse(`@${atName} ${condition}{}`)
  } catch {
    return 'break-out'
  }
  if (root.nodes.length !== 1) return 'break-out'
  const node = root.nodes[0] as AtRule
  if (node.type !== 'atrule' || node.name !== atName || (node.nodes?.length ?? 0) !== 0) {
    return 'break-out'
  }
  if (node.params === condition.trim()) return undefined
  return compact(node.params) === compact(condition) ? 'rewritten' : 'break-out'
}

/**
 * Validates every consumer-supplied atom in `extend` by parsing each string with PostCSS. The
 * walk itself, and what a refusal says, is `validate-extend-walk.ts`'s, shared with the
 * dependency-free validator the Vite plugin uses.
 */
export function validateExtendAtoms(extend: ExtendMap): void {
  walkExtendAtoms(extend, { declarationRefusal, propRefusal, selectorRefusal, conditionRefusal })
}
