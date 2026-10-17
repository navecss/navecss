/**
 * Reading where the `'use client'` directive sits in the package's modules: the part modules carry
 * it, the entry modules (each subpath's `index` and the root) do not, and no module that carries it
 * holds an `export *`, which Next.js rejects inside a client boundary.
 */

/**
 * Whether a module's first statement is the `'use client'` directive: leading whitespace and
 * comments are skipped one at a time, so no pattern has to match across them.
 */
export const hasDirective = (code: string): boolean => {
  let rest = code.trimStart()
  while (rest.startsWith('//') || rest.startsWith('/*')) {
    const end = rest.startsWith('//') ? rest.indexOf('\n') : rest.indexOf('*/') + 1
    rest = end <= 0 ? '' : rest.slice(end + 1).trimStart()
  }
  return /^(['"])use client\1/.test(rest)
}

/**
 * Whether a module holds an `export *` statement of either form (`export * from`,
 * `export * as Name from`), read per line.
 */
export const hasExportStar = (code: string): boolean =>
  code.split('\n').some((line) => /^\s*export\s*\*/.test(line))

export type ModuleKind = 'entry' | 'part' | 'unclassified'

/**
 * The part modules are the helper `part` and each subpath's `parts.generated`; the entry modules
 * are each subpath's `index` and the root `index`. A module path is relative, without extension.
 */
export const kindOf = (module: string): ModuleKind => {
  if (module === 'part' || module.endsWith('/parts.generated')) {
    return 'part'
  }
  if (module === 'index' || module.endsWith('/index')) {
    return 'entry'
  }
  return 'unclassified'
}

/**
 * What is wrong with a set of modules, by module path to source text: a module that is neither a
 * part nor an entry, a part without the directive, an entry with it, and a module with the
 * directive that holds an `export *`.
 */
export const boundaryProblems = (modules: ReadonlyMap<string, string>): string[] =>
  modules
    .entries()
    .flatMap(([module, code]) => {
      const kind = kindOf(module)
      const directive = hasDirective(code)
      return [
        ...(kind === 'unclassified'
          ? [`${module}: neither a part module nor an entry module`]
          : []),
        ...(kind === 'part' && !directive
          ? [`${module}: a part module without the directive`]
          : []),
        ...(kind === 'entry' && directive ? [`${module}: an entry module with the directive`] : []),
        ...(directive && hasExportStar(code) ? [`${module}: the directive and an export *`] : []),
      ]
    })
    .toArray()
