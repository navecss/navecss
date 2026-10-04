/**
 * One pass of `navecss-core expand`: read each source, expand it, collect every problem across
 * every file, and write the outputs only when there is none. The result carries what the command
 * prints and the exit code it maps to, so the same pass serves one run and every `--watch` run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { ExpandedDiagnostic } from './directive/expand-text-diagnostics.ts'
import type { ExtendMap } from './directive/resolve.ts'
import type { ExpandJob, ExpandPair } from './expand-args.ts'

import { findBareImports } from './directive/bare-imports.ts'
import { createPositionFinder } from './directive/expand-text-diagnostics.ts'
import { expandText } from './directive/expand-text.ts'
import { foldedText } from './directive/report-text.ts'

export interface PassResult {
  /**
   * Every file that was written, as `source to out`, for the command to say so.
   */
  readonly expanded: readonly ExpandPair[]
  /**
   * Each stylesheet's problems as one report, in the order the files were given.
   */
  readonly reports: readonly string[]
  readonly status: 0 | 1 | 2
  /**
   * Every `--source` that could not be read.
   */
  readonly unreadable: readonly string[]
}

type Outcome =
  | { readonly css: string; readonly kind: 'expanded' }
  | { readonly kind: 'problems'; readonly report: string }
  | { readonly kind: 'unreadable' }

/**
 * The bare-import problems of `css` as diagnostics positioned like `expandText()`'s own: a bare
 * `@import` is a problem only this command reports, since it alone never inlines one.
 */
function bareImportDiagnostics(css: string, source: string): ExpandedDiagnostic[] {
  const directory = path.dirname(path.resolve(source))
  const positionAt = createPositionFinder(css)
  return findBareImports(css, (specifier) => existsSync(path.resolve(directory, specifier))).map(
    (diagnostic) => {
      const position = positionAt(diagnostic.offset)
      return {
        ...diagnostic,
        severity: 'error',
        file: source,
        line: position.line,
        column: position.column + 1,
      }
    },
  )
}

/**
 * One source read, expanded, and judged: its output, or every problem in it as one report, or
 * that it could not be read.
 */
function expandOne(source: string, extend: ExtendMap): Outcome {
  let css: string
  try {
    css = readFileSync(source, 'utf8')
  } catch {
    return { kind: 'unreadable' }
  }
  try {
    const result = expandText(css, { extend, onUnknown: 'error', from: source })
    const problems = [...result.diagnostics, ...bareImportDiagnostics(css, source)]
    const report = foldedText(problems, source, extend)
    return report === undefined
      ? { kind: 'expanded', css: result.css }
      : { kind: 'problems', report }
  } catch (error) {
    // An atom registered without a declarations object is a throw, outside `onUnknown`.
    return { kind: 'problems', report: `${source}: ${(error as Error).message}` }
  }
}

/**
 * The exit code a pass answers: `2` when a source could not be read, else `1` for a problem.
 */
function statusOf(unreadable: readonly string[], reports: readonly string[]): 0 | 1 | 2 {
  if (unreadable.length > 0) return 2
  return reports.length > 0 ? 1 : 0
}

/**
 * Runs the job once against `extend`. `--out` is written (its directory made when it is missing)
 * only when every file expanded with no problem.
 */
export function expandPass(job: ExpandJob, extend: ExtendMap): PassResult {
  const reports: string[] = []
  const unreadable: string[] = []
  const outputs: { css: string; pair: ExpandPair }[] = []
  for (const pair of job.pairs) {
    const outcome = expandOne(pair.source, extend)
    if (outcome.kind === 'unreadable') unreadable.push(pair.source)
    else if (outcome.kind === 'problems') reports.push(outcome.report)
    else outputs.push({ css: outcome.css, pair })
  }
  const status = statusOf(unreadable, reports)
  if (status === 0) {
    for (const { css, pair } of outputs) {
      mkdirSync(path.dirname(path.resolve(pair.out)), { recursive: true })
      writeFileSync(pair.out, css, 'utf8')
    }
  }
  return {
    expanded: status === 0 ? outputs.map(({ pair }) => pair) : [],
    reports,
    status,
    unreadable,
  }
}
