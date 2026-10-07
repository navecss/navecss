/**
 * The words of the build-end error for importers of a listed module that the post-order half did
 * not recognise: a line for each importer, then the remedies in the order they are read. A file of
 * the application is told a spelling to write or an entry to add; a file inside a dependency is
 * not the reader's to change, so its line says so and its package gets one remedy of its own.
 */
import type { ListedImporter } from './vite-cx-module-importers.ts'

import { isRelative } from './vite-cx-modules.ts'
import { compareText, cxModulesArray } from './vite-problems.ts'

/**
 * `'a', 'b'`: the specifiers as the error quotes them.
 */
function quoted(specifiers: readonly string[]): string {
  return specifiers.map((specifier) => `'${specifier}'`).join(', ')
}

interface ApplicationLines {
  readonly none: string[]
  readonly other: string[]
  readonly relative: string[]
}

/**
 * The lines for one importer of the application: one for the relative specifiers it writes, which
 * say what to write in their place, one for the others, or one saying no specifier could be found.
 */
function applicationLinesOf(item: ListedImporter): ApplicationLines {
  const entry = `'${item.entry}'`
  const relative = item.specifiers.filter((specifier) => isRelative(specifier))
  const other = item.specifiers.filter((specifier) => !isRelative(specifier))
  const place = relative.length === 1 ? 'its' : 'their'
  return {
    relative:
      relative.length === 0
        ? []
        : [
            `${item.label}: imports ${entry} as ${quoted(relative)}. Write '${item.replacement}' in ${place} place.`,
          ],
    other: other.length === 0 ? [] : [`${item.label}: imports ${entry} as ${quoted(other)}.`],
    none:
      item.specifiers.length > 0
        ? []
        : [
            `${item.label}: imports ${entry} through a specifier the build could not find in the file.`,
          ],
  }
}

/**
 * The line for one importer inside a dependency: every specifier it writes for the module, relative
 * or not, in the order written, and that the file is not the reader's to change.
 */
function dependencyLineOf(item: ListedImporter): string {
  const entry = `'${item.entry}'`
  const found =
    item.specifiers.length === 0
      ? `imports ${entry} through a specifier the build could not find in the file.`
      : `imports ${entry} as ${quoted(item.specifiers)}.`
  return `${item.label}: ${found} The file is in ${item.pkg}, a dependency, so it is not yours to change.`
}

const RELATIVE_REMEDY =
  'Adding a relative specifier to cxModules would not clear this: a relative entry is read from the project root. Instead of the rewrite'
const NO_SPECIFIER_REMEDY =
  "Where the build could not find the specifier, import the module there by a specifier ending in the listed file's name, or by an alias or package name added to cxModules."

/**
 * The remedy lines for the application's importers, in the order they are read: what a relative
 * specifier cannot do, what to do when no specifier was found, and last the array to paste.
 */
function applicationRemedyOf(
  items: readonly ListedImporter[],
  lines: readonly ApplicationLines[],
  configured: readonly string[],
): string[] {
  const remedy: string[] = []
  const relativeCount = lines.reduce((count, line) => count + line.relative.length, 0)
  if (relativeCount === 1) {
    remedy.push(
      `${RELATIVE_REMEDY} its line gives, the file can import the module through an alias for it, added to cxModules.`,
    )
  } else if (relativeCount > 1) {
    remedy.push(
      `${RELATIVE_REMEDY} each line gives, a file can import the module through an alias for it, added to cxModules.`,
    )
  }
  if (lines.some((line) => line.none.length > 0)) remedy.push(NO_SPECIFIER_REMEDY)
  const added = [
    ...new Set(
      items.flatMap((item) => item.specifiers.filter((specifier) => !isRelative(specifier))),
    ),
  ]
  const array = cxModulesArray(configured, added)
  if (array !== undefined) {
    const each = added.length === 1 ? 'the specifier' : 'each specifier'
    remedy.push(`Add ${each}, as written, to cxModules in navePlugin(): cxModules: ${array}.`)
  }
  return remedy
}

const LASTING_FIX_HERE =
  "The lasting fix there is the package's: import the module by a specifier ending in the listed file's name."

/**
 * The one remedy line of a package whose files import a listed module through a specifier the
 * build does not recognise. `hasKeepFor` is whether the report in the same failure already printed
 * the package's `keepFor` line, which clears these files too, so it is not printed twice.
 */
function packageRemedyOf(pkg: string, files: number, hasKeepFor: boolean): string {
  if (hasKeepFor) {
    const file = files === 1 ? 'a file' : 'files'
    return `${pkg} also imports a module listed in cxModules in ${file} the build did not read; the keepFor entry above clears that too. ${LASTING_FIX_HERE}`
  }
  return `For ${pkg}, list the atoms its calls can produce, from its documentation, under its name in navePlugin(): keepFor: { '${pkg}': ['<atom>'] }. Once the package is listed, its files no longer fail the build here, and the atoms you list stand in for the calls the build did not read. The lasting fix is the package's: import the module by a specifier ending in the listed file's name.`
}

/**
 * The error for the importers `found`: the count, the application's lines then the dependencies'
 * by path, the application's remedies, and last one line for each package. `configured` is the
 * `cxModules` list the array extends, and `report` the text of the report printed before this
 * error in the same failure, if any.
 */
export function importerErrorOf(
  found: readonly ListedImporter[],
  input: { readonly configured: readonly string[]; readonly report: string | undefined },
): string {
  const application = found.filter((item) => item.pkg === undefined)
  const dependencies = found.filter((item) => item.pkg !== undefined)
  const count = new Set(found.map((item) => item.importer)).size
  const first =
    count === 1
      ? '1 file imports a module listed in cxModules through a specifier the build does not recognise, so the build did not read that file for cx() calls.'
      : `${count} files import a module listed in cxModules through a specifier the build does not recognise, so the build did not read those files for cx() calls.`
  const lines = application.map((item) => applicationLinesOf(item))
  const byPackage = Map.groupBy(dependencies, (item) => item.pkg!)
  const packages = byPackage.keys().toArray().toSorted(compareText)
  return [
    first,
    ...lines
      .flatMap((line) => [...line.relative, ...line.other, ...line.none])
      .toSorted(compareText),
    ...dependencies.map((item) => dependencyLineOf(item)).toSorted(compareText),
    ...applicationRemedyOf(application, lines, input.configured),
    ...packages.map((pkg) =>
      packageRemedyOf(
        pkg,
        new Set(byPackage.get(pkg)!.map((item) => item.importer)).size,
        input.report?.includes(`keepFor: { '${pkg}'`) ?? false,
      ),
    ),
  ].join('\n')
}
