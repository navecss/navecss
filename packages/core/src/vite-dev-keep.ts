/**
 * The map `cx.dynamic()` reads in dev. In a build it is the plain map of the atoms in `keep` and
 * every `keepFor` list; in dev it is the same map behind a `Proxy` that says, once per call, when
 * the name asked for is outside it. The texts live here, in what the dev server hands out, so the
 * browser bundle a build writes carries none of them and `@navecss/core` itself holds none.
 */

import type { UsedContext } from './vite-used.ts'

import { atomClassMap } from './atoms.ts'

/**
 * The name of the `define` constant `cx.dynamic()` reads.
 */
export const KEEP_CONSTANT = '__NAVE_KEEP_CLASSES__'

/**
 * The map from each kept atom to its class.
 */
export function keepMap(kept: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    kept
      .filter((atom) => Object.hasOwn(atomClassMap, atom))
      .map((atom) => [atom, atomClassMap[atom as keyof typeof atomClassMap]]),
  )
}

/**
 * `map`, answering as a plain object does, and printing one of two lines to the console when
 * `Object.hasOwn(map, name)` is asked about a name outside it: the name is an atom that is not
 * kept, or it is no atom. `atoms` lists every built-in atom. Self-contained, because its source
 * text becomes the expression of a `define` and is evaluated in the page.
 */
function devKeepMap(
  map: Readonly<Record<string, string>>,
  atoms: readonly string[],
): Readonly<Record<string, string>> {
  return new Proxy(map, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
      if (descriptor === undefined && typeof key === 'string') {
        const quoted = JSON.stringify(key)
        // eslint-disable-next-line no-console -- this function's source runs in the page, where the console is the channel
        console.error(
          atoms.includes(key)
            ? `[nave] cx.dynamic(${quoted}) applied no class: ${quoted} is not kept, so the build does not ship it either. Add ${quoted} to keep in navePlugin(), or, when a dependency makes the call, to its list in keepFor.`
            : `[nave] cx.dynamic(${quoted}) applied no class: ${quoted} is not a Nave atom.`,
        )
      }
      return descriptor
    },
  })
}

/**
 * The expression a dev server's `define` gives for the map: `devKeepMap` applied to the map.
 */
export function devKeepExpression(
  map: Readonly<Record<string, string>>,
  atoms: readonly string[],
): string {
  return `(${devKeepMap.toString()})(${JSON.stringify(map)}, ${JSON.stringify(atoms)})`
}

// The map each dev server put on the global, so closing it takes away its own and no other.
const installed = new WeakMap<UsedContext, object>()

/**
 * Puts the map on the dev server's own global, so a server render in this process (a dependency
 * the server environment leaves external reads the constant from there) gives the same class
 * strings as the page does.
 */
export function installServerKeepMap(context: UsedContext): void {
  if (context.options.atomic !== 'used') return
  const map = devKeepMap(keepMap(context.kept), Object.keys(atomClassMap))
  installed.set(context, map)
  Object.assign(globalThis, { [KEEP_CONSTANT]: map })
}

/**
 * Takes the map off the global when the server that put it there closes.
 */
export function removeServerKeepMap(context: UsedContext): void {
  const map = installed.get(context)
  if (map === undefined) return
  installed.delete(context)
  if ((globalThis as Record<string, unknown>)[KEEP_CONSTANT] === map) {
    Reflect.deleteProperty(globalThis, KEEP_CONSTANT)
  }
}
