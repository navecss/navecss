/**
 * The post-order half of the Vite plugin: it reads every JavaScript module the build compiles,
 * in every environment, for the atoms its `cx()` calls and written classes name; fails the build
 * once, at build end, on anything it cannot read; and reads the HTML entries. In a build it
 * returns each module with its calls turned into the strings they return (`vite-rewrite-*.ts`);
 * in the dev server it changes nothing.
 */
import type { ResolvedServerImport, ServerImport } from './vite-server-takes.ts'
import type {
  BundleContext,
  BundleEntry,
  RenderContext,
  TransformContext,
  TransformMeta,
  TransformResultLike,
} from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { checkBundle } from './vite-bundle.ts'
import { isMentioningAtoms, recordModule } from './vite-collect-module.ts'
import { failDevModule, problemsOf } from './vite-collect-problems.ts'
import { isUnreadStylesheet } from './vite-css-id.ts'
import { checkCxImporters } from './vite-cx-importers.ts'
import { declaredImporterError } from './vite-cx-module-importers.ts'
import { forgetDeclared } from './vite-cx-modules.ts'
import { withoutEchoes } from './vite-declared-echoes.ts'
import { withClearingSpecifiers } from './vite-dependency-reexports.ts'
import { devServing } from './vite-dev.ts'
import { checkServerInvocation } from './vite-emitted.ts'
import { decideReexports, type Prepared, prepareReexports } from './vite-listed-takes.ts'
import { atomsWrittenIn } from './vite-literal-classes.ts'
import { judgeAfterLastEnvironment } from './vite-markup.ts'
import { isNaveOwn } from './vite-module-kind.ts'
import { assertOptions } from './vite-options.ts'
import { checkEnvironmentOrder } from './vite-order.ts'
import { applyEdits } from './vite-rewrite-edit.ts'
import {
  graphOf,
  judgeable,
  readServerImports,
  recordedSentence,
  serverImportsOf,
  warnUnknown,
  writeServerImports,
} from './vite-server-takes.ts'
import { recordsOf } from './vite-state.ts'
import { noteClientEnded, noteServerExternals } from './vite-untransformed.ts'
import { isSecondHop, withoutRemoved } from './vite-used-package-lines.ts'
import { buildReport } from './vite-used-report.ts'
import { isUsed, ownAtomNames } from './vite-used.ts'
import { forgetWriters } from './vite-writers.ts'

/**
 * Where a Vite project writes the options, as the report's remedy lines name it.
 */
const OPTIONS_HOME = 'navePlugin()'

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
  ): Promise<TransformResultLike | undefined>
  readonly transformIndexHtml: HtmlHook
  buildStart(this: RenderContext): Promise<void>
  buildEnd(this: RenderContext, error?: unknown): Promise<void>
  readonly generateBundle: {
    handler(this: BundleContext, options: unknown, bundle: Record<string, BundleEntry>): void
    readonly order: 'pre'
  }
}

/**
 * Whether the post-order half reads the module `id`: any module that is not a stylesheet and not
 * Nave's own, whether a file of the project, of a dependency, or a module a plugin generates. A
 * CSS Module is read although it is a stylesheet: its JavaScript is a class map.
 */
export function isReadable(context: UsedContext, id: string): boolean {
  return isUsed(context) && !isUnreadStylesheet(id) && !isNaveOwn(id)
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
  serverImports: readonly ResolvedServerImport[],
): Promise<{ prepared: Prepared[]; problems: LocatedProblem[] }> {
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
  // A dependency's re-export of a listed module's `cx` is judged by what takes it, listed or not.
  const standingIn = [
    ...records.flatMap((record) => record.suppressed),
    ...kept.filter((problem) => isSecondHop(problem)),
  ]
  const rest = kept.filter((problem) => !isSecondHop(problem))
  const prepared = await prepareReexports(ctx, context, standingIn)
  return { problems: [...rest, ...decideReexports(prepared, serverImports)], prepared }
}

/**
 * The report of the problems, ending with the sentence that says so when a take in it comes from
 * what an earlier server build recorded.
 */
function reportOf(context: UsedContext, problems: readonly LocatedProblem[]): string {
  const report = buildReport(problems, context.options.cxModules, OPTIONS_HOME)
  const recorded = problems
    .flatMap((problem) => problem.takes ?? [])
    .filter((take) => take.isRecorded === true)
    .map((take) => take.taker)
  const note = recordedSentence(recorded)
  return note === undefined ? report : `${report}\n${note}`
}

/**
 * What the build fails with at its end: the report of what it cannot read, then the check of the
 * listed modules' importers, which tells apart what the report already says, in one failure.
 */
async function failuresOf(
  ctx: RenderContext,
  context: UsedContext,
  serverImports: readonly ResolvedServerImport[],
): Promise<{ failures: string[]; prepared: Prepared[] }> {
  const { problems, prepared } = await problemsOfBuild(ctx, context, serverImports)
  const report = problems.length > 0 ? reportOf(context, problems) : undefined
  const importers = await declaredImporterError(ctx, context, {
    configured: withoutRemoved(problems, context.options.cxModules),
    home: OPTIONS_HOME,
    report,
  })
  return { failures: [report, importers].filter((failure) => failure !== undefined), prepared }
}

/**
 * The imports server environments made of a listed package they leave external, which the client
 * environment judges at its end: those of this process, or those server commands left.
 */
function serverImportsForClient(
  ctx: RenderContext,
  context: UsedContext,
  graph: ReadonlySet<string>,
): { known: ResolvedServerImport[]; unknown: ServerImport[] } {
  if (ctx.environment.config.consumer !== 'client') return { known: [], unknown: [] }
  const imports = context.inProcess ? context.state.serverImports : readServerImports(context)
  return judgeable(graph, imports)
}

/**
 * At a server environment's build end: records its imports of a listed package it leaves external.
 * In one process the client judges them when it ends, or, if it has ended, they are judged now
 * against its graph; with separate commands the next client command judges them.
 */
function noteServerImports(ctx: RenderContext, context: UsedContext): void {
  const imports = serverImportsOf(ctx, context)
  if (!context.inProcess) {
    writeServerImports(ctx, context, imports)
    return
  }
  context.state.serverImports.push(...imports)
  const { client } = context.state
  if (client === undefined || imports.length === 0) return
  const { known, unknown } = judgeable(client.graph, imports)
  const problems = decideReexports(client.prepared, known)
  if (problems.length > 0) ctx.error(reportOf(context, problems))
  warnUnknown(ctx, context, unknown)
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
      if (this.environment.config.consumer === 'client') context.state.clientEnded = false
      // Only the environment that fixed the set forgets it: in one process, a client environment
      // that starts after a server one wrote the first stylesheet leaves that set standing.
      const isWriter = context.inProcess
        ? context.state.emittedBy === this.environment.name
        : this.environment.config.consumer === 'client'
      if (isWriter) forgetWriters(context.state)
    },

    async transform(code, id, meta) {
      if (!isReadable(context, id)) return
      if (this.environment?.config.consumer === 'server') context.state.serverTransformed = true
      const record = await recordModule(context, this, { code, id, moduleType: meta?.moduleType })
      if (context.command === 'serve') devServing.noteGrowth(context)
      if (record?.edits) return applyEdits(code, id, record.edits)
      if (record) failDevModule(this, context, { home: OPTIONS_HOME, id, record })
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

    generateBundle: {
      order: 'pre',
      handler(options, bundle) {
        checkBundle(this, context, { bundle, options, pass: 'pre' })
      },
    },

    async buildEnd(error) {
      if (error || !isUsed(context) || context.command !== 'build') return
      const graph = graphOf(this)
      const server = serverImportsForClient(this, context, graph)
      const { failures, prepared } = await failuresOf(this, context, server.known)
      if (failures.length > 0) this.error(failures.join('\n\n'))
      await checkCxImporters(this, context)
      checkEnvironmentOrder(this, context)
      if (this.environment.config.consumer === 'server') {
        checkServerInvocation(this, context)
        noteServerExternals(this, context)
        noteServerImports(this, context)
      } else {
        noteClientEnded(this, context)
        warnUnknown(this, context, server.unknown)
        context.state.client = { graph, prepared }
      }
      judgeAfterLastEnvironment(context, this.environment, (message) => this.warn(message))
    },
  }
  return plugin
}
