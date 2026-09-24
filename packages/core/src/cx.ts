/**
 * cx — typed atomic class composer for Nave.
 *
 * Two channels, because the two things they carry are different:
 *
 *   cx(...)      — Nave built-in atoms only. Typed, autocompleted, and an
 *                  unknown name is a compile error.
 *   cx.raw(...)  — any class string, returned untouched. The declared way to
 *                  step outside the system.
 *
 * Both accept falsy arguments (undefined, null, false) and filter them out, so
 * conditional classes work the same on either side. Both return a
 * space-separated class string for className={}.
 *
 * Validation, not just autocomplete:
 *   cx() takes AtomName, so a typo'd name ('interactve'), a name typed from
 *   the CSS side ('sr-only' — the atom key is srOnly and the emitted class is
 *   nave-sr-only; neither spelling is the key), and a class from anywhere
 *   outside Nave are all refused by your own tsc, with nothing installed from
 *   us. This is TypeScript only: a JavaScript consumer gets none of it.
 *
 * Composing with your own classes:
 *   A CSS Module hash is a string, not an atom, so it no longer goes inside
 *   cx(). Compose in the template literal, the way the @nave directive
 *   composes in the rule body:
 *
 *     className={`${cx('interactive', 'focusRing')} ${styles.root}`}
 *
 *   and reach for cx.raw() when the class comes from outside any system Nave
 *   can see — a legacy global class, a third-party widget's class:
 *
 *     className={`${cx('interactive')} ${cx.raw('legacy-card')}`}
 *
 *   A CONDITIONAL class goes inside a call, never into a slot: cx.raw()
 *   filters a falsy argument out, while `${isActive && styles.active}`
 *   interpolates the string 'false' into your className.
 *
 *   An atom name held in a variable needs a literal type. `const n = 'flex'`
 *   is one; a let binding, an array element or an object property widens to
 *   string, so annotate it with the exported AtomName type (or `as const`).
 *
 * Why cx.raw() never maps:
 *   cx() resolves an atom name to that atom's global class, so cx('container')
 *   is 'nave-container'. cx.raw() does not consult the atom map at all, so
 *   cx.raw('container') is the literal 'container'. That is what makes it
 *   impossible for Nave to shadow one of your own class names on this channel,
 *   rather than merely documented — and the names at issue are the ordinary
 *   ones: container, hidden, grid, flex, block, border, rounded, transition,
 *   relative, absolute, gap, truncate, interactive.
 *
 * What is NOT checked:
 *   Nothing here looks at the rest of the className attribute. A bare string
 *   sitting beside these calls is not seen by anything, so cx.raw() is a
 *   DECLARED escape channel (greppable: `grep -r 'cx.raw'`), not an enforced
 *   one.
 *
 * Note on consumer atoms:
 *   Atoms defined via navePlugin({ extend }) are @nave-directive only.
 *   They do not generate global CSS classes and are not available in cx().
 *   cx() covers Nave built-in atoms only.
 */
import type { AtomName } from './atoms.ts'

import { atomClassMap } from './atoms.ts'

export type { AtomName } from './atoms.ts'

type Falsy = false | null | undefined

interface Cx {
  (...args: (AtomName | Falsy)[]): string
  raw: (...args: (Falsy | string)[]) => string
}

export const cx: Cx = (...args: (AtomName | Falsy)[]): string =>
  args
    .filter(Boolean)
    // Object.hasOwn, not bracket access: atomClassMap is a plain object, so
    // an unchecked (JavaScript) caller passing an inherited Object.prototype
    // name ("toString", "constructor") would otherwise resolve the inherited
    // member instead of falling through to the literal `arg`.
    .map((arg) =>
      Object.hasOwn(atomClassMap, arg as AtomName) ? atomClassMap[arg as AtomName] : arg,
    )
    .join(' ')

cx.raw = (...args: (Falsy | string)[]): string => args.filter(Boolean).join(' ')
