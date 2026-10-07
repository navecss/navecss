/**
 * The report a build fails with when it meets a use it cannot read: a first line counting the
 * problems and stating the cause, one line per problem with a 1-based, root-relative position,
 * and the remedy block printed once, last. Under the default nobody set the option, so the first
 * line never names it, and no remedy printed for application code is `atomic: 'all'`: an agent
 * takes the first remedy that clears the error, and that one always does.
 */
import type { Problem, ProblemKind } from './vite-problems.ts'

import { availableLine } from './vite-atom-check.ts'
import { compareText, cut, PROBLEM_KINDS } from './vite-problems.ts'

export interface LocatedProblem extends Problem {
  /**
   * The module's path, relative to the project root, with forward slashes.
   */
  readonly file: string
  readonly line: number
  readonly column: number
  /**
   * Set when the source map does not lead to the authored position: `line` and `column` are then
   * zero and mean nothing, and this is the sentence that ends the problem's line.
   */
  readonly unknownLine?: string | undefined
  /**
   * The package name when the module lies under `node_modules`.
   */
  readonly pkg?: string | undefined
}

export const LINE_UNKNOWN_WITHOUT_MAP =
  " (line unknown: this file's compiled code has no source map in this build; with build.sourcemap set in the Vite config, the report gives the line if the source maps then lead back to it)"
export const LINE_UNKNOWN_UNMAPPED =
  ' (line unknown: no source map leads from the compiled code to this file)'

export const REPORT_CAUSE =
  'the build cannot tell which atoms these apply, and it ships only the atoms it can read.'

const REMEDIES: Readonly<Record<ProblemKind, readonly string[]>> = {
  argument: [
    "Name the atoms at the call: a string literal, a const in the same file, or a condition choosing between them, as in cx(on ? 'flex' : 'grid').",
    "To choose by a value, call cx() once per case and pick between the results: ({ row: cx('flex'), grid: cx('grid') })[variant].",
    'If the name comes from data the build never sees, write cx.dynamic(name) and list every atom it can take in keep in navePlugin().',
  ],
  reference: [
    'Call cx() where the classes are applied, with the atom names as its arguments: the build reads calls, not a cx that is assigned, passed or spread.',
  ],
  // Printed by `reexportRemedy`, which names the modules a `cxModules` entry would clear.
  reexport: [],
  declared: [
    'Re-export cx from @navecss/core/cx in that module unchanged, or remove it from cxModules and import cx from @navecss/core/cx where it is called.',
  ],
  concatenation: [
    'Write cx() with the atom name, or cx.dynamic() with keep for a name chosen at run time.',
  ],
  dynamic: ['List the atoms those calls can take in keep in navePlugin().'],
  unknown: [],
  own: [],
  unreadable: [],
}

/**
 * The line a problem prints: its position, then the construct and the sentence.
 */
function problemLine(problem: LocatedProblem): string {
  const where =
    problem.unknownLine === undefined
      ? `${problem.file}:${problem.line}:${problem.column}: `
      : `${problem.file}: `
  const ending = problem.unknownLine ?? ''
  if (problem.construct === '') return `${where}${problem.text}${ending}`
  const construct = cut(problem.construct)
  return problem.text === ''
    ? `${where}${construct}${ending}`
    : `${where}${construct}: ${problem.text}${ending}`
}

/**
 * Whether the problem is a re-export that listing the module in `cxModules` would clear.
 */
function isListableReexport(problem: LocatedProblem): boolean {
  return problem.kind === 'reexport' && problem.isListable !== false
}

/**
 * The lines for an application's undeclared re-exports: the `cxModules` array that names every
 * module a listing would clear, pasteable whole, then the direct import.
 */
function reexportRemedy(problems: readonly LocatedProblem[]): string[] {
  const modules = problems
    .filter((problem) => isListableReexport(problem))
    .map((problem) => (problem.file.startsWith('.') ? problem.file : `./${problem.file}`))
  const listable = [...new Set(modules)].toSorted(compareText)
  const lines =
    listable.length === 0
      ? []
      : [
          `To keep a module that re-exports cx, list it in navePlugin() as you import it: cxModules: [${listable.map((file) => `'${file}'`).join(', ')}]. Files that import cx from it are then read as if they imported it from @navecss/core/cx. Or import cx from @navecss/core/cx directly where it is called.`,
        ]
  if (problems.some((problem) => problem.kind === 'reexport' && !isListableReexport(problem))) {
    lines.push(
      'Import cx where it is called, from @navecss/core/cx or from a module listed in cxModules, instead of re-exporting a listed module.',
    )
  }
  return lines
}

/**
 * The remedy lines for a dependency's problems: one sentence per package for its calls, and one
 * for a re-export, which a `cxModules` entry clears.
 */
function packageLines(pkg: string, problems: readonly LocatedProblem[]): string[] {
  const keepFor = `keepFor: { '${pkg}': ['<atom>'] }`
  const reexports = problems.filter((problem) => isListableReexport(problem))
  const rest = problems.filter((problem) => !isListableReexport(problem))
  const lines: string[] = []
  if (rest.length > 0) lines.push(callsLine(pkg, rest, keepFor))
  if (reexports.length > 0) {
    lines.push(
      `${pkg} re-exports cx. List the module you import cx from in navePlugin(): cxModules: ['${pkg}'].`,
    )
  }
  return lines
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

/**
 * The remedy block: the application's lines in the fixed order of the kinds present, then each
 * dependency's line sorted by package name, then `Available:` when a unknown name had no hint.
 */
function remedyBlock(problems: readonly LocatedProblem[]): string[] {
  const application = problems.filter((problem) => problem.pkg === undefined)
  const lines: string[] = []
  for (const kind of PROBLEM_KINDS) {
    if (application.every((problem) => problem.kind !== kind)) continue
    lines.push(...(kind === 'reexport' ? reexportRemedy(application) : REMEDIES[kind]))
  }
  const byPackage = new Map<string, LocatedProblem[]>()
  for (const problem of problems) {
    if (problem.pkg !== undefined)
      byPackage.set(problem.pkg, [...(byPackage.get(problem.pkg) ?? []), problem])
  }
  for (const pkg of byPackage.keys().toArray().toSorted(compareText)) {
    lines.push(...packageLines(pkg, byPackage.get(pkg)!))
  }
  if (application.some((problem) => problem.needsAvailable)) lines.push(availableLine())
  return lines
}

/**
 * The problems in the order the report prints them: the application's, then the dependencies',
 * each by path and position.
 */
function inReportOrder(problems: readonly LocatedProblem[]): LocatedProblem[] {
  const rank = (problem: LocatedProblem): number => (problem.pkg === undefined ? 0 : 1)
  return problems.toSorted(
    (a, b) =>
      rank(a) - rank(b) ||
      compareText(a.file, b.file) ||
      Number(a.unknownLine !== undefined) - Number(b.unknownLine !== undefined) ||
      a.line - b.line ||
      a.column - b.column,
  )
}

/**
 * The lines of the problems: the application's, then the calls of `cx.dynamic()` that apply no
 * class in the application under their own count, then the dependencies'.
 */
function problemLines(problems: readonly LocatedProblem[]): string[] {
  const ordered = inReportOrder(problems)
  const isApplicationDynamic = (problem: LocatedProblem): boolean =>
    problem.kind === 'dynamic' && problem.pkg === undefined
  const application = ordered.filter(
    (problem) => problem.pkg === undefined && !isApplicationDynamic(problem),
  )
  const dynamic = ordered.filter((problem) => isApplicationDynamic(problem))
  const dependencies = ordered.filter((problem) => problem.pkg !== undefined)
  const lines = application.map((problem) => problemLine(problem))
  if (dynamic.length > 0) {
    const places = dynamic.length === 1 ? '1 place' : `${dynamic.length} places`
    lines.push(
      `cx.dynamic() is called in ${places} in your code, but keep is empty, so none of them applies a class.`,
      ...dynamic.map((problem) => problemLine(problem)),
    )
  }
  return [...lines, ...dependencies.map((problem) => problemLine(problem))]
}

/**
 * `count` and the word for it, singular or plural.
 */
function noun(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/**
 * The build report for every problem of an environment.
 */
export function buildReport(problems: readonly LocatedProblem[]): string {
  const files = new Set(problems.map((problem) => problem.file)).size
  const first = `${noun(problems.length, 'problem')} in ${noun(files, 'file')}: ${REPORT_CAUSE}`
  return [first, ...problemLines(problems), ...remedyBlock(problems)].join('\n')
}

/**
 * The dev server's error for one module: its problem lines and the same remedy block.
 */
export function moduleReport(problems: readonly LocatedProblem[]): string {
  return [...problemLines(problems), ...remedyBlock(problems)].join('\n')
}
