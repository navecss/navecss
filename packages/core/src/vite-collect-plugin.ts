/**
 * The post-order half of the Vite plugin: it reads every JavaScript module the build compiles,
 * in every environment, for the atoms its `cx()` calls and written classes name; fails the build
 * once, at build end, on anything it cannot read; and reads the HTML entries. It never changes
 * a module: it returns nothing from `transform`.
 */
import type { ModuleRecord } from './vite-state.ts'
import type { PluginLog, RenderContext, TransformContext } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { isMentioningAtoms, recordModule } from './vite-collect-module.ts'
import { isStylesheetId } from './vite-css-id.ts'
import { checkServerInvocation } from './vite-emitted.ts'
import { atomsWrittenIn } from './vite-literal-classes.ts'
import { isFileId, isNaveOwn } from './vite-module-kind.ts'
import { checkEnvironmentOrder } from './vite-order.ts'
import { recordsOf } from './vite-state.ts'
import { noteClientEnded, noteServerExternals } from './vite-untransformed.ts'
import { buildReport, moduleReport } from './vite-used-report.ts'
import { isUsed } from './vite-used.ts'

interface HtmlHook {
  readonly order: 'pre'
  handler(html: string, context: { readonly filename?: string }): undefined
}

export interface NaveCollectPlugin {
  readonly name: 'nave:collect'
  readonly enforce: 'post'
  transform(this: TransformContext, code: string, id: string): Promise<undefined>
  readonly transformIndexHtml: HtmlHook
  buildEnd(this: RenderContext, error?: unknown): void
}

/**
 * The `cx.dynamic()` calls a record holds that apply no class: in the application when `keep`
 * is empty, in a dependency when no `keepFor` entry names it.
 */
function dynamicProblems(record: ModuleRecord, context: UsedContext): LocatedProblem[] {
  const isCovered =
    record.pkg === undefined
      ? context.options.keep.length > 0
      : Object.hasOwn(context.options.keepFor, record.pkg)
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
  }))
}

/**
 * Every problem a record holds.
 */
function problemsOf(record: ModuleRecord, context: UsedContext): LocatedProblem[] {
  return [...record.problems, ...dynamicProblems(record, context)]
}

/**
 * Throws the dev server's error for the application problems of one module.
 */
function failModule(ctx: TransformContext, id: string, problems: readonly LocatedProblem[]): never {
  const message = moduleReport(problems)
  const first = problems[0]!
  return ctx.error({
    message,
    id,
    loc: { file: id, line: first.line, column: first.column - 1 },
  } satisfies PluginLog)
}

/**
 * The post-order half. `context` is what it shares with the other half.
 */
export function createCollectPlugin(context: UsedContext): NaveCollectPlugin {
  const plugin: NaveCollectPlugin = {
    name: 'nave:collect',
    enforce: 'post',

    async transform(code, id) {
      if (!isUsed(context) || !isFileId(id) || isStylesheetId(id) || isNaveOwn(id)) return
      const record = await recordModule(context, this, code, id)
      if (!record || context.command !== 'serve' || record.pkg !== undefined) return
      const problems = problemsOf(record, context)
      if (problems.length > 0) failModule(this, id, problems)
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, { filename }) {
        if (filename === undefined || !isUsed(context) || !isMentioningAtoms(html)) return
        context.state.pages.set(filename, atomsWrittenIn(html))
      },
    },

    buildEnd(error) {
      if (error || !isUsed(context) || context.command !== 'build') return
      const problems = recordsOf(context.state, this.environment.name).flatMap((record) =>
        problemsOf(record, context),
      )
      if (problems.length > 0) this.error(buildReport(problems))
      checkEnvironmentOrder(this, context)
      if (this.environment.config.consumer === 'server') {
        checkServerInvocation(this, context)
        noteServerExternals(this, context)
      } else {
        noteClientEnded(this, context)
      }
    },
  }
  return plugin
}
