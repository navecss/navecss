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
   * written Nave classes name, plus those in `keep` and `keepFor`, and no others, in the build; a
   * `cx()` call whose atoms the build cannot read fails the build.
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
}

export interface ResolvedUsedOptions {
  readonly atomic: 'all' | 'used'
  readonly keep: readonly string[]
  readonly keepFor: Readonly<Record<string, readonly string[]>>
}

/**
 * The sentence for a name that is no atom, shared by every option that lists atoms.
 */
function unknownAtomText(name: string): string {
  const hint = hintFor(name)
  return hint ? ` ${hint}` : ''
}

/**
 * The problem with one listed name, or `undefined` when it is a built-in atom. `where` is how
 * the message names the list (`keep`, `keepFor["@acme/ui"]`).
 */
function problemWithName(
  where: string,
  name: unknown,
  own: ReadonlySet<string>,
): string | undefined {
  if (typeof name === 'string' && isBuiltInAtom(name)) return undefined
  if (typeof name === 'string' && own.has(name)) {
    return `navePlugin(): ${where} names "${name}", an atom of your own; those have no class, so there is nothing to keep.`
  }
  const spelled = typeof name === 'string' ? name : String(name)
  return `navePlugin(): ${where} names an unknown atom "${spelled}".${unknownAtomText(spelled)}`
}

/**
 * Every problem in the atoms listed under `where`.
 */
function problemsInList(where: string, list: unknown, own: ReadonlySet<string>): string[] {
  if (!Array.isArray(list)) return [`navePlugin(): ${where} must be an array of atom names.`]
  // `Array.from` reads a hole as `undefined`, so a sparse list is refused like any other bad name.
  return Array.from(list as unknown[], (name) => problemWithName(where, name, own) ?? []).flat()
}

/**
 * Every problem in `keepFor`'s entries.
 */
function problemsInKeepFor(keepFor: unknown, own: ReadonlySet<string>): string[] {
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
 * The problems in the options, with `own` the names of the consumer's own atoms (known once an
 * `extend` module has been read; empty before).
 */
function problemsInOptions(options: UsedAtomOptions, own: ReadonlySet<string>): string[] {
  const problems: string[] = []
  const { atomic, keep, keepFor } = options as Record<string, unknown>
  if (atomic !== undefined && atomic !== 'all' && atomic !== 'used') {
    problems.push("navePlugin(): atomic must be 'used' or 'all'.")
  }
  if (keep !== undefined) problems.push(...problemsInList('keep', keep, own))
  if (keepFor !== undefined) problems.push(...problemsInKeepFor(keepFor, own))
  return problems
}

/**
 * Throws the first problem in the options, if there is one.
 */
export function assertOptions(options: UsedAtomOptions, own: ReadonlySet<string>): void {
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
  }
}

/**
 * Every atom the options always ship: `keep` and every `keepFor` list.
 */
export function keptAtoms(options: ResolvedUsedOptions): string[] {
  return [...new Set([...options.keep, ...Object.values(options.keepFor).flat()])]
}
