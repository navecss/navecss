/**
 * Reads the installed `@navecss/core`'s atom vocabulary through its public `./atoms` export
 * only: `atomClassMap` (atom name -> emitted class) both ways, so a substituted core tarball with
 * an added atom is picked up with no change to this package.
 *
 * Loaded synchronously, never with a top-level `await`: a consumer's `eslint.config.cjs` loads
 * this plugin through `require()`, which refuses any module graph containing one. The specifier
 * is resolved through core's export map with `import.meta.resolve` (core ships an `import`
 * condition), and the resolved file is then loaded by path with `require()`, which Node allows
 * for an ES module with no top-level `await` of its own.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const atomsPath = fileURLToPath(import.meta.resolve('@navecss/core/atoms'))
const { atomClassMap } = createRequire(import.meta.url)(atomsPath) as {
  atomClassMap: Record<string, string>
}

/**
True when `name` is one of the installed core's own atom names (the map's own keys only).
 */
export function isAtomName(name: string): boolean {
  return Object.hasOwn(atomClassMap, name)
}

const classToAtom = new Map(Object.entries(atomClassMap).map(([atom, cls]) => [cls, atom]))

/**
The atom whose emitted class is `className`, or `undefined` when no atom emits it.
 */
export function atomNameForClass(className: string): string | undefined {
  return classToAtom.get(className)
}
