/**
 * cx — typed atomic class composer for Nave.
 *
 * Two channels, because the two things they carry are different:
 *
 *   cx(...)      — Nave built-in atoms only. Typed, autocompleted, and an
 *                  unknown name is a compile error.
 *   cx.raw(...)  — any class string, returned untouched. The declared way to
 *                  step outside the system.
 *   cx.dynamic(name) — one atom chosen at run time, for a name the Vite plugin's build
 *                  cannot read (listed in the plugin's `keep` option).
 *
 * cx() and cx.raw() accept falsy arguments (undefined, null, false) and filter
 * them out, so conditional classes work the same on either side. Both return a
 * space-separated class string for className={}. cx.dynamic() takes one atom
 * name, or a falsy value, and returns that atom's class, or an empty string.
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
 *   Nothing here looks at the rest of the className attribute. @navecss/eslint-plugin does:
 *   install it for an ENFORCED escape channel, reporting an undeclared literal class written
 *   in className and requiring a reason on a cx.raw() call that carries one (a class the
 *   project declares as its own passes by design). Without it, cx.raw() is only a DECLARED
 *   escape channel (greppable: `grep -r 'cx.raw'`).
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
  /**
   * One atom chosen at run time, for a name the build cannot read. Under the Vite plugin the
   * name must be one the plugin ships: list every atom it can take in `keep` (or, for a package,
   * in `keepFor`). Without the plugin it maps through every atom, like `cx()`, except that a
   * name that is no atom returns `''` instead of passing through, so it never carries a class
   * from outside Nave.
   */
  dynamic: (name: AtomName | Falsy) => string
}

/**
 * The atoms the Vite plugin ships for `cx.dynamic()`: the plugin hands the map of the atoms in
 * `keep` and in every `keepFor` list to the bundler as a constant, static data folded into the
 * bundle. Undefined without the plugin, and under `atomic: 'all'`.
 */
declare const __NAVE_KEEP_CLASSES__: Readonly<Record<string, string>> | undefined

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

cx.dynamic = (name: AtomName | Falsy): string => {
  if (!name) return ''
  // `typeof`, not a comparison: without the plugin the constant is not declared at all, and
  // reading an undeclared name throws where `typeof` does not.
  // eslint-disable-next-line unicorn/no-typeof-undefined
  const map = typeof __NAVE_KEEP_CLASSES__ === 'undefined' ? atomClassMap : __NAVE_KEEP_CLASSES__
  return Object.hasOwn(map, name) ? map[name] : ''
}
