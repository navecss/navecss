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

interface Installed {
  /**
   * The dev server's client environment, which is the same object when its plugins close.
   */
  readonly owner: object
  readonly map: object
}

// The maps the running dev servers put on the global, oldest first, and what the global held
// before the first of them: the newest map still running is the one the global holds.
const installs: Installed[] = []
const baseline: { held: boolean; value: unknown } = { held: false, value: undefined }

/**
 * Puts the newest map still running on the global, or gives it back what it held before any.
 */
function publish(): void {
  const newest = installs.at(-1)
  if (newest !== undefined) Object.assign(globalThis, { [KEEP_CONSTANT]: newest.map })
  else if (baseline.held) Object.assign(globalThis, { [KEEP_CONSTANT]: baseline.value })
  else Reflect.deleteProperty(globalThis, KEEP_CONSTANT)
}

/**
 * Puts the map on the dev server's own global, so a server render in this process (a dependency
 * the server environment leaves external reads the constant from there) gives the same class
 * strings as the page does. `owner` is the server's client environment.
 */
export function installServerKeepMap(context: UsedContext, owner: object): void {
  if (context.options.atomic !== 'used') return
  const map = devKeepMap(keepMap(context.kept), Object.keys(atomClassMap))
  if (installs.length === 0) {
    baseline.held = Object.hasOwn(globalThis, KEEP_CONSTANT)
    baseline.value = (globalThis as Record<string, unknown>)[KEEP_CONSTANT]
  }
  installs.push({ owner, map })
  publish()
}

/**
 * Takes the map of the dev server `owner` off the global when it closes: the global then holds
 * the map of the newest server still running, or what it held before the first.
 */
export function removeServerKeepMap(owner: object | undefined): void {
  const index = installs.findIndex((install) => install.owner === owner)
  if (index === -1) return
  installs.splice(index, 1)
  publish()
}
