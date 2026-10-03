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
   * The package name when the module lies under `node_modules`.
   */
  readonly pkg?: string | undefined
}

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
  reexport: ["Import cx from '@navecss/core/cx' directly in the module that calls it."],
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
  const where = `${problem.file}:${problem.line}:${problem.column}: `
  if (problem.construct === '') return `${where}${problem.text}`
  const construct = cut(problem.construct)
  return problem.text === '' ? `${where}${construct}` : `${where}${construct}: ${problem.text}`
}

/**
 * The remedy lines for a dependency's problems, one sentence per package.
 */
function packageLine(pkg: string, problems: readonly LocatedProblem[]): string {
  const keepFor = `keepFor: { '${pkg}': ['<atom>'] }`
  if (problems.every((problem) => problem.kind === 'own')) {
    return `${pkg} names atoms of your own, which have no class, so a keepFor entry cannot make its calls produce a Nave class. The fix is the package's: it must name atoms Nave ships.`
  }
  const isOnlyDynamic = problems.every((problem) => problem.kind === 'dynamic')
  if (isOnlyDynamic) {
    const count = problems.length
    const places = count === 1 ? '1 place' : `${count} places`
    return `${pkg} calls cx.dynamic() in ${places} and lists no atoms in keepFor, so none of them applies a class. List the atoms those calls can take, from its documentation, under its name in navePlugin(): ${keepFor}.`
  }
  const isReexportOnly = problems.every((problem) => problem.kind === 'reexport')
  if (isReexportOnly) {
    return `${pkg} re-exports cx. Import cx from '@navecss/core/cx' directly where it is called, or list the atoms its calls can produce under its name in navePlugin(): ${keepFor}.`
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
    if (application.some((problem) => problem.kind === kind)) lines.push(...REMEDIES[kind])
  }
  const byPackage = new Map<string, LocatedProblem[]>()
  for (const problem of problems) {
    if (problem.pkg !== undefined)
      byPackage.set(problem.pkg, [...(byPackage.get(problem.pkg) ?? []), problem])
  }
  for (const pkg of byPackage.keys().toArray().toSorted(compareText)) {
    lines.push(packageLine(pkg, byPackage.get(pkg)!))
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
      rank(a) - rank(b) || compareText(a.file, b.file) || a.line - b.line || a.column - b.column,
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
