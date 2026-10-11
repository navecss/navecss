/**
 * The remedy lines for the `cx` exports a module the consumer can change takes from a package whose
 * modules give Nave's `cx` out: a take of a listed package's module, a take of a dependency's
 * re-export of a listed module's `cx`, and the calls other dependencies make through that
 * re-export. Each names who takes what, since the act is theirs.
 */
import type { Take } from './vite-cx-takes.ts'

import { compareText } from './vite-problems.ts'

const IDENTIFIER = /^[$\p{ID_Start}_][$\p{ID_Continue}]*$/u

/**
 * A name an importer takes as the line writes it: `default` as the default export, an identifier
 * as it is, any other name in single quotes with the backslash and the quote escaped.
 */
function takenName(name: string): string {
  if (name === 'default') return 'the default export'
  if (IDENTIFIER.test(name)) return name
  return `'${name.replaceAll('\\', String.raw`\\`).replaceAll("'", String.raw`\'`)}'`
}

/**
 * What one take is, in the words the line puts in parentheses.
 */
function takeWhat(take: Take): string {
  const names = take.names.map((name) => takenName(name)).join(', ')
  switch (take.shape) {
    case 'dynamic-import': {
      return names === '' ? 'import()' : `import() reading ${names}`
    }
    case 'names': {
      return names
    }
    case 'namespace': {
      return names === '' ? 'a namespace import' : `a namespace import reading ${names}`
    }
    case 'star': {
      return 'export *'
    }
    case 'unreadable': {
      return 'a require() or other import the build cannot read'
    }
  }
}

const FIX =
  ' The lasting fix is upstream: import cx from @navecss/core/cx where it is called, and re-export it from there, only under the name cx, in each module that gives it out.'

/**
 * The clauses the lines for takes share: the list of takers and what each takes, the clause that
 * points at the files, and the clauses for a take of a module whole and for a re-export.
 */
function clausesOf(takes: readonly Take[]): { files: string; listed: string; whole: string } {
  const entries = takes
    .map((take) => ({
      taker: take.taker,
      text: `${take.taker} (${takeWhat(take)})`,
      shape: take.shape,
    }))
    .toSorted((a, b) => compareText(a.taker, b.taker) || compareText(a.text, b.text))
  const listed = [...new Set(entries.map((entry) => entry.text))].join(', ')
  const files =
    new Set(entries.map((entry) => entry.taker)).size === 1
      ? 'in that file'
      : 'in each of those files'
  const isWhole = entries.some((entry) => entry.shape !== 'names')
  const wholeClause = isWhole
    ? '; where a file takes a module whole (a namespace import, export *, import() or an import the build cannot read), import by name what it uses from that module, and cx from @navecss/core/cx'
    : ''
  const passedOn = takes.some((take) => take.isPassedOn === true)
    ? '; where a file re-exports what it takes, import cx from @navecss/core/cx in the files that call it, call cx there in its place, and drop the re-export'
    : ''
  return { files, listed, whole: `${wholeClause}${passedOn}` }
}

/**
 * The line for the takes of a listed package's `cx` exports that only an application module can
 * end, by importing `cx` from Nave instead: a take through a forward (a module of the package or of
 * another dependency that only re-exports the export), a take of a module with no clearing
 * specifier (it gives `cx` out under another name, or no specifier resolving from Vite's root
 * reaches it), and a take the build cannot read. The package's `keepFor` entry stands in only for
 * the package's own calls, and the package is already listed, so the line offers neither that entry
 * nor a `cxModules` one, and says why it prints no `cxModules` entry. `hasPackageFix` is whether a
 * module behind the takes gives `cx` out under another name or is reached through a forward, the
 * cases where a module upstream has a lasting fix to make.
 */
export function takenLine(pkg: string, takes: readonly Take[], hasPackageFix: boolean): string {
  const { files, listed, whole } = clausesOf(takes)
  const fix = hasPackageFix ? FIX : ''
  return `${pkg} re-exports cx, and your code takes that cx, from the package or through another package that re-exports it, in ${listed}. The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: ${files}, import cx from @navecss/core/cx instead and call cx in its place${whole}. The build prints no cxModules entry for this, since it found none of these takes made, by an import it can read and a specifier that resolves from Vite's root, from a module that re-exports cx from @navecss/core/cx itself and only under the name cx. Once your code makes none of these takes, the keepFor entry clears this.${fix}`
}

/**
 * The line for a dependency module that re-exports the `cx` of a module `cxModules` lists, when an
 * application module takes it. The package may not be listed, and a re-export is not a call, so no
 * `keepFor` entry is offered, and the lasting fix is always upstream.
 */
export function forwardLine(pkg: string, takes: readonly Take[]): string {
  const { files, listed, whole } = clausesOf(takes)
  return `${pkg} re-exports the cx of a module listed in cxModules, and your code takes that cx, from ${pkg} or through another package that re-exports it, in ${listed}. The build follows a listed module one step, so it does not read calls made through what your code takes there: ${files}, import cx from @navecss/core/cx instead and call cx in its place${whole}.${FIX}`
}

/**
 * The line for a dependency module that re-exports the `cx` of a module `cxModules` lists, when
 * other dependencies call through it: `callers` are their modules, root-relative, in code-unit
 * order. Only the package's `keepFor` entry stands in for those calls, so it is offered, and the
 * line never says the re-exporting module makes any.
 */
export function callsThroughLine(pkg: string, callers: readonly string[]): string {
  const [make, owner, its] =
    callers.length === 1 ? ['makes', "a dependency's", 'its'] : ['make', "dependencies'", 'their']
  return `${pkg} re-exports the cx of a module listed in cxModules, and the build follows a listed module one step, so it does not read the calls that ${callers.join(', ')} ${make} through that re-export. That code is ${owner}, not yours to change: list the atoms those calls can produce, from ${its} documentation, under the name of ${pkg}, which holds the re-export, in navePlugin(): keepFor: { '${pkg}': ['<atom>'] }. The lasting fix is upstream: ${pkg} can re-export cx from @navecss/core/cx itself, or the code that calls through it can import cx from there.`
}
