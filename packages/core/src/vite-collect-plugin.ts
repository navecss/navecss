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
import { declaredImporterError } from './vite-cx-module-importers.ts'
import { forgetDeclared } from './vite-cx-modules.ts'
import { withoutEchoes } from './vite-declared-echoes.ts'
import { withClearingSpecifiers } from './vite-dependency-reexports.ts'
import { devServing } from './vite-dev.ts'
import { checkServerInvocation } from './vite-emitted.ts'
import { takenReexports } from './vite-listed-takes.ts'
import { atomsWrittenIn } from './vite-literal-classes.ts'
import { judgeAfterLastEnvironment } from './vite-markup.ts'
import { isNaveOwn } from './vite-module-kind.ts'
import { assertOptions } from './vite-options.ts'
import { checkEnvironmentOrder } from './vite-order.ts'
import { recordsOf } from './vite-state.ts'
import { noteClientEnded, noteServerExternals } from './vite-untransformed.ts'
import { withoutRemoved } from './vite-used-package-lines.ts'
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
function problemsOf(record: ModuleRecord, context: UsedContext): LocatedProblem[] {
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
 * Whether the post-order half reads the module `id`: any module that is not a stylesheet and not
 * Nave's own, whether a file of the project, of a dependency, or a module a plugin generates.
 */
export function isReadable(context: UsedContext, id: string): boolean {
  return isUsed(context) && !isStylesheetId(id) && !isNaveOwn(id)
}

/**
 * The problems the build fails with. Those of a package `keepFor` lists are only the ones its
 * listing does not stand in for: a listed module of the package that exports a `cx` the build does
 * not follow, and a `cx` export that a module the consumer can change takes (`vite-listed-takes.ts`).
 * What importers take is known at build end, so the suppressed re-exports are judged here.
 */
async function problemsOfBuild(
  ctx: RenderContext,
  context: UsedContext,
): Promise<LocatedProblem[]> {
  const records = recordsOf(context.state, ctx.environment.name)
  const kept = await withClearingSpecifiers(
    ctx,
    context,
    withoutEchoes(
      records.map((record) => ({
        onlyVia: record.onlyVia,
        problems: [
          ...problemsOf(record, context),
          ...record.suppressed.filter((problem) => problem.kind === 'declared'),
        ],
      })),
    ),
  )
  const standingIn = records.flatMap((record) => record.suppressed)
  return [...kept, ...(await takenReexports(ctx, context, standingIn))]
}

/**
 * What the build fails with at its end: the report of what it cannot read, then the check of the
 * listed modules' importers, which tells apart what the report already says, in one failure.
 */
async function failuresOf(ctx: RenderContext, context: UsedContext): Promise<string[]> {
  const problems = await problemsOfBuild(ctx, context)
  const report = problems.length > 0 ? buildReport(problems, context.options.cxModules) : undefined
  const importers = await declaredImporterError(ctx, context, {
    configured: withoutRemoved(problems, context.options.cxModules),
    report,
  })
  return [report, importers].filter((failure) => failure !== undefined)
}

/**
 * The post-order half. `context` is what it shares with the other half.
 */
export function createCollectPlugin(context: UsedContext): NaveCollectPlugin {
  const plugin: NaveCollectPlugin = {
    name: 'nave:collect',
    enforce: 'post',

    async buildStart() {
      // The resolutions of one build are all made before any environment starts.
      context.state.started = true
      // The names of the consumer's own atoms are known once the `extend` module has loaded, so a
      // list that names one is judged now. A rebuild in watch mode fixes its emitted set again.
      assertOptions(context.options, await ownAtomNames(context))
      forgetDeclared(context.state, this.environment.name)
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
      if (problems.length > 0) failModule(this, context, { id, problems })
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, { filename }) {
        if (!isUsed(context)) return
        context.state.htmlRead = true
        if (filename === undefined || !isMentioningAtoms(html)) return
        context.state.pages.set(filename, atomsWrittenIn(html))
        if (context.command === 'serve') devServing.notePages(context)
      },
    },

    async buildEnd(error) {
      if (error || !isUsed(context) || context.command !== 'build') return
      const failures = await failuresOf(this, context)
      if (failures.length > 0) this.error(failures.join('\n\n'))
      await checkCxImporters(this, context)
      checkEnvironmentOrder(this, context)
      if (this.environment.config.consumer === 'server') {
        checkServerInvocation(this, context)
        noteServerExternals(this, context)
      } else {
        noteClientEnded(this, context)
      }
      judgeAfterLastEnvironment(context, this.environment, (message) => this.warn(message))
    },
  }
  return plugin
}
