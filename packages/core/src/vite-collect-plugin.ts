/**
 * The post-order half of the Vite plugin: it reads every JavaScript module the build compiles,
 * in every environment, for the atoms its `cx()` calls and written classes name; fails the build
 * once, at build end, on anything it cannot read; and reads the HTML entries. It never changes
 * a module: it returns nothing from `transform`.
 */
import type { ModuleRecord } from './vite-state.ts'
import type { PluginLog, RenderContext, TransformContext, TransformMeta } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { isMentioningAtoms, recordModule } from './vite-collect-module.ts'
import { isStylesheetId } from './vite-css-id.ts'
import { checkCxImporters } from './vite-cx-importers.ts'
import { devServing } from './vite-dev.ts'
import { checkServerInvocation } from './vite-emitted.ts'
import { atomsWrittenIn } from './vite-literal-classes.ts'
import { judgeMarkup } from './vite-markup.ts'
import { isNaveOwn } from './vite-module-kind.ts'
import { assertOptions } from './vite-options.ts'
import { checkEnvironmentOrder } from './vite-order.ts'
import { recordsOf } from './vite-state.ts'
import { noteClientEnded, noteServerExternals } from './vite-untransformed.ts'
import { buildReport, moduleReport } from './vite-used-report.ts'
import { isUsed, ownAtomNames } from './vite-used.ts'

interface HtmlHook {
  readonly order: 'pre'
  handler(html: string, context: { readonly filename?: string }): undefined
}

export interface NaveCollectPlugin {
  readonly name: 'nave:collect'
  readonly enforce: 'post'
  transform(
    this: TransformContext,
    code: string,
    id: string,
    meta?: TransformMeta,
  ): Promise<undefined>
  readonly transformIndexHtml: HtmlHook
  buildStart(this: RenderContext): Promise<void>
  buildEnd(this: RenderContext, error?: unknown): Promise<void>
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
    ...(call.unknownLine !== undefined && { unknownLine: call.unknownLine }),
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
    loc: { file: id, line: Math.max(first.line, 1), column: Math.max(first.column - 1, 0) },
  } satisfies PluginLog)
}

/**
 * Whether the post-order half reads the module `id`: any module that is not a stylesheet and not
 * Nave's own, whether a file of the project, of a dependency, or a module a plugin generates.
 */
export function isReadable(context: UsedContext, id: string): boolean {
  return isUsed(context) && !isStylesheetId(id) && !isNaveOwn(id)
}

/**
 * The post-order half. `context` is what it shares with the other half.
 */
export function createCollectPlugin(context: UsedContext): NaveCollectPlugin {
  const plugin: NaveCollectPlugin = {
    name: 'nave:collect',
    enforce: 'post',

    async buildStart() {
      // The names of the consumer's own atoms are known once the `extend` module has loaded, so a
      // list that names one is judged now. A rebuild in watch mode fixes its emitted set again.
      assertOptions(context.options, await ownAtomNames(context))
      if (this.environment.config.consumer !== 'client') return
      context.state.emitted = undefined
      context.state.clientEnded = false
    },

    async transform(code, id, meta) {
      if (!isReadable(context, id)) return
      if (this.environment?.config.consumer === 'server') context.state.serverTransformed = true
      const record = await recordModule(context, this, { code, id, moduleType: meta?.moduleType })
      if (context.command === 'serve') devServing.noteGrowth(context)
      if (!record || context.command !== 'serve' || record.pkg !== undefined) return
      const problems = problemsOf(record, context)
      if (problems.length > 0) failModule(this, id, problems)
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, { filename }) {
        if (!isUsed(context)) return
        context.state.htmlRead = true
        if (filename === undefined || !isMentioningAtoms(html)) return
        context.state.pages.set(filename, atomsWrittenIn(html))
      },
    },

    async buildEnd(error) {
      if (error || !isUsed(context) || context.command !== 'build') return
      const problems = recordsOf(context.state, this.environment.name).flatMap((record) =>
        problemsOf(record, context),
      )
      if (problems.length > 0) this.error(buildReport(problems))
      await checkCxImporters(this, context)
      checkEnvironmentOrder(this, context)
      if (this.environment.config.consumer === 'server') {
        checkServerInvocation(this, context)
        noteServerExternals(this, context)
      } else {
        noteClientEnded(this, context)
        // A builder's process judges once the last environment has built (the first half's
        // `buildApp`); a build of one invocation judges here.
        if (!context.inProcess) judgeMarkup(context, (message) => this.warn(message))
      }
    },
  }
  return plugin
}
