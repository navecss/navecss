/**
 * What a build reports of an importer whose only `cx` comes from a listed module that is itself a
 * problem. The build reads the importer's calls as Nave's, but the listed module's `cx` is not
 * Nave's, so what it says of those calls (an atom it does not know, a name it cannot read) is the
 * listed module's own problem seen from the other side: it stops being true once that module is
 * fixed or taken off the list. Only the listed module's problem is reported, so the reader sees the
 * cause and not its echo. A listed module that also exports Nave's own `cx` leaves its importers a
 * `cx` that is Nave's, so what the build says of their calls is their own problem and stays.
 */
import type { ProblemKind } from './vite-problems.ts'
import type { LocatedProblem } from './vite-used-report.ts'

import { fileOf } from './vite-cx-modules.ts'

/**
 * The kinds that judge a use of `cx`: what a call names, and how the binding is used.
 */
const ECHO_KINDS: ReadonlySet<ProblemKind> = new Set([
  'argument',
  'dynamic',
  'own',
  'reference',
  'unknown',
])

export interface ModuleProblems {
  /**
   * The listed files the module reads a `cx` from, when it reads no other `cx`.
   */
  readonly onlyVia?: ReadonlySet<string> | undefined
  readonly problems: readonly LocatedProblem[]
}

/**
 * The problems of `modules` without the echoes of a listed module's own problem.
 */
export function withoutEchoes(modules: readonly ModuleProblems[]): LocatedProblem[] {
  const broken = new Set(
    modules.flatMap((module) =>
      module.problems.flatMap((problem) =>
        problem.kind === 'declared' && problem.moduleId !== undefined && !problem.hasNaveCx
          ? [fileOf(problem.moduleId)]
          : [],
      ),
    ),
  )
  const isEcho = (module: ModuleProblems): boolean =>
    module.onlyVia !== undefined && [...module.onlyVia].every((file) => broken.has(file))
  return modules.flatMap((module) =>
    isEcho(module)
      ? module.problems.filter((problem) => !ECHO_KINDS.has(problem.kind))
      : module.problems,
  )
}
