/**
 * The report of what the plugin could not read, written by core's formatter with `withNave()` as
 * the place the options live, from the problems of a record.
 */
import type { LocatedProblem } from '@navecss/core/collect'

import { buildReport } from '@navecss/core/collect'

import type { NaveOptions } from './options.ts'
import type { PruneRecord } from './record.ts'

import { postcssConfigIn } from './config-files.ts'
import { UNRESOLVED_TEXT } from './graph-parts.ts'
import { ALIAS_REMEDY } from './texts.ts'

const HOME = 'withNave()'

export interface Report {
  readonly text: string
  /**
   * The problems in it.
   */
  readonly count: number
}

/**
 * A problem that has a position and no construct to quote.
 */
function placed(file: string, line: number, column: number, text: string): LocatedProblem {
  return { kind: 'own', offset: 0, construct: '', text, file, line, column }
}

/**
 * Every problem of the record, in the form the formatter takes.
 */
function problemsOf(record: PruneRecord, dir: string): LocatedProblem[] {
  const config = postcssConfigIn(dir)
  return [
    ...record.problems,
    ...record.directiveProblems.map((problem) =>
      placed(problem.file, problem.line, problem.column, problem.text),
    ),
    ...record.entryProblems.map((text) => placed(config, 1, 1, text)),
  ]
}

/**
 * The alias line, when an import of the application cannot be resolved.
 */
function hostRemedies(application: readonly LocatedProblem[]): string[] {
  return application.some((problem) => problem.text === UNRESOLVED_TEXT) ? [ALIAS_REMEDY] : []
}

/**
 * The report of the record's problems, or `undefined` when it holds none.
 * @param record What the plugin recorded.
 * @param options The options `withNave()` was called with.
 * @param dir The project directory.
 */
export function reportOf(
  record: PruneRecord,
  options: NaveOptions,
  dir: string,
): Report | undefined {
  const problems = problemsOf(record, dir)
  if (problems.length === 0) return undefined
  const text = buildReport(problems, options.cxModules ?? [], HOME, hostRemedies)
  return { text, count: problems.length }
}
