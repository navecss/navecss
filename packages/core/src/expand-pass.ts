/**
 * One pass of `navecss-core expand`: read each source, expand it, collect every problem across
 * every file, and write the outputs only when there is none. The result carries what the command
 * prints and the exit code it maps to, so the same pass serves one run and every `--watch` run.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { ExpandedDiagnostic } from './directive/expand-text-diagnostics.ts'
import type { ExtendMap } from './directive/resolve.ts'
import type { ExpandJob, ExpandPair } from './expand-args.ts'

import { splitByteOrderMark } from './byte-order-mark.ts'
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
  /**
   * What to say when an output could not be written: the files before it stay written (they are in
   * `expanded`), and none after it was.
   */
  readonly writeFailure: string | undefined
}

type Outcome =
  | { readonly css: string; readonly kind: 'expanded' }
  | { readonly kind: 'problems'; readonly report: string }
  | { readonly kind: 'unreadable' }

/**
 * The bare-import problems of `css` as diagnostics positioned like `expandText()`'s own: a bare
 * `@import` is a problem only this command reports, since it alone never inlines one. A kept
 * `@import` is loaded from where the output is served, so a file name is looked for beside `out`,
 * and a name that is any `--out` of this run counts as there even before it is written.
 */
function bareImportDiagnostics(
  css: string,
  source: string,
  out: string,
  outputs: ReadonlySet<string>,
): ExpandedDiagnostic[] {
  const directory = path.dirname(path.resolve(out))
  const positionAt = createPositionFinder(css)
  const hasFile = (specifier: string): boolean => {
    const target = path.resolve(directory, specifier)
    return outputs.has(target) || statSync(target, { throwIfNoEntry: false })?.isFile() === true
  }
  return findBareImports(css, hasFile).map((diagnostic) => {
    const position = positionAt(diagnostic.offset)
    return {
      ...diagnostic,
      severity: 'error',
      file: source,
      line: position.line,
      column: position.column + 1,
    }
  })
}

/**
 * One source read, expanded, and judged: its output, or every problem in it as one report, or
 * that it could not be read.
 */
function expandOne(pair: ExpandPair, extend: ExtendMap, outputs: ReadonlySet<string>): Outcome {
  const source = pair.source
  let raw: string
  try {
    raw = readFileSync(source, 'utf8')
  } catch {
    return { kind: 'unreadable' }
  }
  const { bom, text } = splitByteOrderMark(raw)
  try {
    const result = expandText(text, { extend, onUnknown: 'error', from: source })
    const problems = [
      ...result.diagnostics,
      ...bareImportDiagnostics(text, source, pair.out, outputs),
    ]
    const report = foldedText(problems, source, extend)
    return report === undefined
      ? { kind: 'expanded', css: bom + result.css }
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
 * Writes each output in turn, its directory made when it is missing, and stops at the first one
 * that cannot be written: the pairs before it are written, and none after it is.
 */
function writeOutputs(outputs: readonly { css: string; pair: ExpandPair }[]): {
  readonly writeFailure: string | undefined
  readonly written: readonly ExpandPair[]
} {
  const written: ExpandPair[] = []
  for (const { css, pair } of outputs) {
    try {
      mkdirSync(path.dirname(path.resolve(pair.out)), { recursive: true })
      writeFileSync(pair.out, css, 'utf8')
    } catch (error) {
      const reason = (error as Error).message
      return {
        written,
        writeFailure: `Could not write ${pair.out}: ${reason}. No file after it was written.`,
      }
    }
    written.push(pair)
  }
  return { written, writeFailure: undefined }
}

/**
 * Runs the job once against `extend`. `--out` is written (its directory made when it is missing)
 * only when every file expanded with no problem.
 */
export function expandPass(job: ExpandJob, extend: ExtendMap): PassResult {
  const reports: string[] = []
  const unreadable: string[] = []
  const outputs: { css: string; pair: ExpandPair }[] = []
  const outPaths = new Set(job.pairs.map((pair) => path.resolve(pair.out)))
  for (const pair of job.pairs) {
    const outcome = expandOne(pair, extend, outPaths)
    if (outcome.kind === 'unreadable') unreadable.push(pair.source)
    else if (outcome.kind === 'problems') reports.push(outcome.report)
    else outputs.push({ css: outcome.css, pair })
  }
  const status = statusOf(unreadable, reports)
  if (status !== 0) return { expanded: [], reports, status, unreadable, writeFailure: undefined }
  const { written, writeFailure } = writeOutputs(outputs)
  return {
    expanded: written,
    reports,
    status: writeFailure === undefined ? 0 : 2,
    unreadable,
    writeFailure,
  }
}
