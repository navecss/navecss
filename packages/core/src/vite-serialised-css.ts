/**
 * A module whose whole text is a stylesheet a host serialised into JavaScript. Astro's dev server
 * keeps the CSS a page needs in a module of that shape, and the raw-class match would read every
 * `.nave-*` selector in it as a class an element carries, so the dev server would serve every
 * atom the stylesheet has a rule for. The test is of the text, not of a host's module id: every
 * mention of a built-in atom's class in the module is a selector (a class after a dot, in front of
 * the rest of a selector and the `{` of its rule), and the module names no atom otherwise. A
 * module that also writes a class as ordinary code is read, the safe direction.
 */
import { atomOfClass } from './vite-literal-classes.ts'

const IDENTIFIER = /^[\w-]+/
// What can follow a class in a selector, up to the brace of its rule: no quote, no `;`, no `}`.
// A line break in a string is the two characters `\n`, which a selector list may hold.
const SELECTOR_REST = /^(?:[^{};'"`\\]|\\[nrt])*\{/

/**
 * Whether `code` is a stylesheet written out as text.
 */
export function isSerialisedStylesheet(code: string): boolean {
  let mentions = 0
  for (let at = code.indexOf('nave-'); at !== -1; at = code.indexOf('nave-', at + 5)) {
    const before = code[at - 1]
    if (before !== undefined && /[\w-]/.test(before)) continue
    const name = IDENTIFIER.exec(code.slice(at, at + 64))?.[0]
    if (name === undefined || atomOfClass(name) === undefined) continue
    mentions += 1
    if (before !== '.' || !SELECTOR_REST.test(code.slice(at + name.length, at + name.length + 600)))
      return false
  }
  return mentions > 0
}
