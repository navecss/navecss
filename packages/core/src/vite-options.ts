/**
 * The options that choose which atoms the Vite plugin ships, and their validation. A value a
 * type would refuse in TypeScript is refused here too, so a JavaScript config gets the same
 * answer; every text opens `navePlugin(): `, the prefix of the plugin's config-level messages.
 */
import type { AtomName } from './atoms.ts'

import { hintFor, isBuiltInAtom } from './vite-atom-check.ts'

export interface UsedAtomOptions {
  /**
   * Which atoms the build ships. `'used'` (the default): the atoms your `cx()` calls and your
   * written Nave classes name, plus those in `keep` and `keepFor`. Under the default the build
   * filters the atomic layer of every stylesheet it can reach, and the dev server serves the same
   * set as far as it has read; a stylesheet imported with `?inline` or `?raw` ships every atom
   * with a warning; a `cx()` call whose atoms the build cannot read fails the build, and is an
   * error in the dev server.
   * `'all'`: every atom, and no `cx()` call is read, as with the PostCSS plugin.
   */
  atomic?: 'all' | 'used'

  /**
   * Atoms always shipped: every atom your own `cx.dynamic()` calls can take.
   */
  keep?: readonly AtomName[]

  /**
   * By package name: the atoms a dependency's `cx()` calls can produce, for a package whose calls
   * the build cannot read. They ship as if they were in `keep`. The package's calls are not
   * changed, so any other atom they apply has no rule. A package in your own workspace is your
   * code, not a dependency.
   */
  keepFor?: Readonly<Record<string, readonly AtomName[]>>

  /**
   * Modules that re-export `cx` from `@navecss/core/cx` unchanged, as
   * `export { cx } from '@navecss/core/cx'`, in your code or in a dependency: a file that imports
   * `cx` from one is read as if it imported it from `@navecss/core/cx`. The build follows a listed
   * module one step. A relative entry (`'./src/ui/index.ts'`) is a path from Vite's `root`. Any
   * other entry (a package name or subpath, an alias, a `#` import, an absolute path) matches an
   * import written the same way. Every entry also matches an import that resolves to its file
   * through a specifier naming that file or, for an `index` file, its directory; in your code, an
   * import that reaches the file through any other specifier fails the build instead. A relative
   * entry that resolves to no file is ignored, and so is an entry naming `@navecss/core/cx`, which
   * the build always reads. The same setting, with the same entries, as `@navecss/eslint-plugin`'s
   * `cxModules`, which reads a relative entry from the working directory instead of Vite's `root`.
   */
  cxModules?: readonly string[]
}

export interface ResolvedUsedOptions {
  readonly atomic: 'all' | 'used'
  readonly keep: readonly string[]
  readonly keepFor: Readonly<Record<string, readonly string[]>>
  readonly cxModules: readonly string[]
}

/**
 * The sentence for a name that is no atom, shared by every option that lists atoms.
 */
function unknownAtomText(name: string): string {
  const hint = hintFor(name)
  return hint ? ` ${hint}` : ''
}

/**
 * The problem with one listed name, or `undefined` when it is a built-in atom (or, while `own` is
 * not known yet, a string a module of the consumer's own atoms may still define). `where` is how
 * the message names the list (`keep`, `keepFor["@acme/ui"]`).
 */
function problemWithName(
  where: string,
  name: unknown,
  own: ReadonlySet<string> | undefined,
): string | undefined {
  if (typeof name === 'string' && isBuiltInAtom(name)) return undefined
  if (typeof name === 'string' && own === undefined) return undefined
  if (typeof name === 'string' && own?.has(name)) {
    return `navePlugin(): ${where} names "${name}", an atom of your own; those have no class, so there is nothing to keep.`
  }
  const spelled = typeof name === 'string' ? name : String(name)
  return `navePlugin(): ${where} names an unknown atom "${spelled}".${unknownAtomText(spelled)}`
}

/**
 * Every problem in the atoms listed under `where`.
 */
function problemsInList(
  where: string,
  list: unknown,
  own: ReadonlySet<string> | undefined,
): string[] {
  if (!Array.isArray(list)) return [`navePlugin(): ${where} must be an array of atom names.`]
  // `Array.from` reads a hole as `undefined`, so a sparse list is refused like any other bad name.
  return Array.from(list as unknown[], (name) => problemWithName(where, name, own) ?? []).flat()
}

/**
 * Every problem in `keepFor`'s entries.
 */
function problemsInKeepFor(keepFor: unknown, own: ReadonlySet<string> | undefined): string[] {
  if (typeof keepFor !== 'object' || keepFor === null || Array.isArray(keepFor)) {
    return ['navePlugin(): keepFor must be an object from package names to arrays of atom names.']
  }
  const problems: string[] = []
  for (const [pkg, list] of Object.entries(keepFor)) {
    const where = `keepFor["${pkg}"]`
    if (Array.isArray(list) && list.length === 0) {
      problems.push(
        `navePlugin(): ${where} lists no atoms. List the atoms its calls can produce, or remove the entry.`,
      )
    } else {
      problems.push(...problemsInList(where, list, own))
    }
  }
  return problems
}

/**
 * Every problem in `cxModules`, which holds no atom names and so needs no atom set.
 */
function problemsInCxModules(cxModules: unknown): string[] {
  if (!Array.isArray(cxModules)) {
    return ['navePlugin(): cxModules must be an array of module paths or specifiers.']
  }
  // `Array.from` reads a hole as `undefined`, so a sparse list is refused like any other bad entry.
  return Array.from(cxModules as unknown[], (entry, index) =>
    typeof entry === 'string'
      ? []
      : `navePlugin(): cxModules[${index}] must be a string: a module path or a specifier.`,
  ).flat()
}

/**
 * The problems in the options, with `own` the names of the consumer's own atoms (`undefined`
 * while an `extend` module has not been read: a name that is no built-in atom is then judged
 * later, and every other problem now).
 */
function problemsInOptions(
  options: UsedAtomOptions | ResolvedUsedOptions,
  own: ReadonlySet<string> | undefined,
): string[] {
  const problems: string[] = []
  const { atomic, keep, keepFor, cxModules } = options as Record<string, unknown>
  if (atomic !== undefined && atomic !== 'all' && atomic !== 'used') {
    problems.push("navePlugin(): atomic must be 'used' or 'all'.")
  }
  if (keep !== undefined) problems.push(...problemsInList('keep', keep, own))
  if (keepFor !== undefined) problems.push(...problemsInKeepFor(keepFor, own))
  if (cxModules !== undefined) problems.push(...problemsInCxModules(cxModules))
  return problems
}

/**
 * Throws the first problem in the options, if there is one.
 */
export function assertOptions(
  options: UsedAtomOptions | ResolvedUsedOptions,
  own: ReadonlySet<string> | undefined,
): void {
  const [first] = problemsInOptions(options, own)
  if (first !== undefined) throw new Error(first)
}

/**
 * The options with their defaults filled in.
 */
export function resolveUsedOptions(options: UsedAtomOptions): ResolvedUsedOptions {
  return {
    atomic: options.atomic ?? 'used',
    keep: [...(options.keep ?? [])],
    keepFor: Object.fromEntries(
      Object.entries(options.keepFor ?? {}).map(([pkg, list]) => [pkg, [...list]]),
    ),
    cxModules: [...(options.cxModules ?? [])],
  }
}

/**
 * Every atom the options always ship: `keep` and every `keepFor` list.
 */
export function keptAtoms(options: ResolvedUsedOptions): string[] {
  return [...new Set([...options.keep, ...Object.values(options.keepFor).flat()])]
}
