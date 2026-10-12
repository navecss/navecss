/**
 * The problems a module's record holds, and the dev server's failure for those of the application.
 */
import type { RecordedModule } from './vite-collect-module.ts'
import type { ModuleRecord } from './vite-state.ts'
import type { PluginLog, TransformContext } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { moduleReport } from './vite-used-report.ts'

/**
 * The atoms that can make a `cx.dynamic()` call of the record apply a class: `keep` in the
 * application, the package's `keepFor` list in a dependency (none without an entry).
 */
function listedAtomsOf(record: ModuleRecord, context: UsedContext): readonly string[] {
  if (record.pkg === undefined) return context.options.keep
  const { keepFor } = context.options
  return Object.hasOwn(keepFor, record.pkg) ? keepFor[record.pkg]! : []
}

/**
 * The `cx.dynamic()` calls a record holds that apply no class: in the application when `keep`
 * is empty, in a dependency when its `keepFor` entry is absent or empty. An empty list maps
 * nothing, so it is no entry, as an empty `keep` is none.
 */
function dynamicProblems(record: ModuleRecord, context: UsedContext): LocatedProblem[] {
  const isCovered = listedAtomsOf(record, context).length > 0
  if (isCovered) return []
  return record.dynamicCalls.map((call) => ({
    kind: 'dynamic',
    offset: 0,
    construct: call.construct,
    text: '',
    file: call.file,
    line: call.line,
    column: call.column,
    pkg: record.pkg,
    ...(call.unknownLine !== undefined && { unknownLine: call.unknownLine }),
  }))
}

/**
 * Every problem a record holds.
 */
export function problemsOf(record: ModuleRecord, context: UsedContext): LocatedProblem[] {
  return [...record.problems, ...dynamicProblems(record, context)]
}

/**
 * Throws the dev server's error for the application problems of one module.
 */
function failModule(
  ctx: TransformContext,
  context: UsedContext,
  input: { readonly id: string; readonly problems: readonly LocatedProblem[] },
): never {
  const { id, problems } = input
  const message = moduleReport(problems, context.options.cxModules)
  const first = problems[0]!
  return ctx.error({
    message,
    id,
    loc: { file: id, line: Math.max(first.line, 1), column: Math.max(first.column - 1, 0) },
  } satisfies PluginLog)
}

/**
 * In the dev server: fails the request for a module of the application that holds a problem.
 */
export function failDevModule(
  ctx: TransformContext,
  context: UsedContext,
  input: { readonly id: string; readonly record: RecordedModule },
): void {
  const { id, record } = input
  if (context.command !== 'serve' || record.pkg !== undefined) return
  const problems = problemsOf(record, context)
  if (problems.length > 0) failModule(ctx, context, { id, problems })
}
