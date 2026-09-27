/**
 * Reads the installed `@navecss/core`'s atom vocabulary through its public `./atoms` export
 * only (R1): `atomClassMap` (atom name -> emitted class) both ways, so a substituted core
 * tarball with an added atom is picked up with no change to this package. A top-level `await`
 * against a dynamic `import()`: `@navecss/core` ships no `require` condition (ESM only), so a
 * synchronous `require()` cannot reach it, and every ESLint rule's own setup (`create()`) runs
 * synchronously — the module graph itself is where the one async load has to happen, and ESLint's
 * own flat-config loader already awaits the whole plugin module before linting starts.
 */
const { atomClassMap } = (await import('@navecss/core/atoms')) as {
  atomClassMap: Record<string, string>
}

/**
 *
 */
export function isAtomName(name: string): boolean {
  return Object.hasOwn(atomClassMap, name)
}

const classToAtom = new Map(Object.entries(atomClassMap).map(([atom, cls]) => [cls, atom]))

/**
 *
 */
export function atomNameForClass(className: string): string | undefined {
  return classToAtom.get(className)
}
