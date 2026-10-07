/**
 * The remedy lines for a dependency's problems: one sentence per package for its calls and uses of
 * `cx`, and, for a re-export of `cx`, the line that clears it: a `cxModules` entry when the
 * consumer has a specifier that resolves to the re-exporting file, the package's `keepFor` line
 * when only the package itself imports that file.
 */
import type { LocatedProblem } from './vite-used-report.ts'

import { compareText, cxModulesArray } from './vite-problems.ts'

/**
 * Whether the problem is a re-export that listing the module in `cxModules` would clear.
 */
export function isListableReexport(problem: LocatedProblem): boolean {
  return problem.kind === 'reexport' && problem.isListable !== false
}

/**
 * The remedy sentence for a dependency's calls and uses of `cx`.
 */
function callsLine(pkg: string, problems: readonly LocatedProblem[], keepFor: string): string {
  if (problems.every((problem) => problem.kind === 'own')) {
    return `${pkg} names atoms of your own, which have no class, so a keepFor entry cannot make its calls produce a Nave class. The fix is the package's: it must name atoms Nave ships.`
  }
  const isOnlyDynamic = problems.every((problem) => problem.kind === 'dynamic')
  if (isOnlyDynamic) {
    const count = problems.length
    const places = count === 1 ? '1 place' : `${count} places`
    return `${pkg} calls cx.dynamic() in ${places} and lists no atoms in keepFor, so none of them applies a class. List the atoms those calls can take, from its documentation, under its name in navePlugin(): ${keepFor}.`
  }
  return `${pkg} is a dependency, so its code is not yours to change. List the atoms its calls can produce, from its documentation, under its name in navePlugin(): ${keepFor}. The lasting fix is the package's: names chosen at run time go through cx.dynamic().`
}

const LASTING_FIX =
  "The lasting fix is the package's: import cx from @navecss/core/cx where it is called, or re-export it from the package's entry."

/**
 * The line for a re-export a `cxModules` entry can name: the specifiers, and the whole list with
 * them added.
 */
function listedLine(
  pkg: string,
  specifiers: readonly string[],
  configured: readonly string[],
): string | undefined {
  const array = cxModulesArray(configured, specifiers)
  const named = specifiers.map((specifier) => `'${specifier}'`).join(', ')
  const it = specifiers.length === 1 ? 'it' : 'them'
  return array === undefined
    ? undefined
    : `${pkg} re-exports cx in ${named}. List ${it} in navePlugin(): cxModules: ${array}.`
}

/**
 * The line for a re-export only the package itself imports, which no entry the consumer could write
 * names. `hasKeepFor` is whether the package's calls already printed its `keepFor` line, which
 * clears this too, so it is printed once.
 */
function internalLine(pkg: string, count: number, keepFor: string, hasKeepFor: boolean): string {
  if (hasKeepFor) {
    return `${pkg} also re-exports cx in a file that only the package itself imports; the keepFor entry above clears that too. The lasting fix there is the package's: import cx from @navecss/core/cx where it is called, or re-export it from the package's entry.`
  }
  const [file, them] = count === 1 ? ['a file that only', 'it'] : ['files that only', 'them']
  return `${pkg} re-exports cx in ${file} the package itself imports, so your code has no specifier for ${them} to list in cxModules. List the atoms its calls can produce, from its documentation, under its name in navePlugin(): ${keepFor}. ${LASTING_FIX}`
}

/**
 * The remedy lines for a dependency's problems, `configured` being the `cxModules` list a line
 * that prints one extends.
 */
export function packageLines(
  pkg: string,
  problems: readonly LocatedProblem[],
  configured: readonly string[],
): string[] {
  const keepFor = `keepFor: { '${pkg}': ['<atom>'] }`
  const reexports = problems.filter((problem) => isListableReexport(problem))
  const rest = problems.filter((problem) => !isListableReexport(problem))
  const named = [...new Set(reexports.flatMap((problem) => problem.specifier ?? []))].toSorted(
    compareText,
  )
  const internal = reexports.filter((problem) => problem.specifier === undefined)
  const lines: string[] = []
  if (rest.length > 0) lines.push(callsLine(pkg, rest, keepFor))
  const listed = named.length > 0 ? listedLine(pkg, named, configured) : undefined
  if (listed !== undefined) lines.push(listed)
  if (internal.length > 0) {
    const files = new Set(internal.map((problem) => problem.file)).size
    const hasKeepFor = rest.some((problem) => problem.kind !== 'own')
    lines.push(internalLine(pkg, files, keepFor, hasKeepFor))
  }
  return lines
}
