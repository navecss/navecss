/**
 * The first half's stylesheet work: expand the directives of every stylesheet Vite compiles, and
 * remember the ones that failed because the `extend` module would not load (so fixing the module
 * reloads them).
 */
import type { ExtendSource } from './vite-extend.ts'
import type {
  HotUpdateContext,
  HotUpdateOptions,
  ResolvedConfigLike,
  TransformContext,
  TransformResultLike,
} from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { canHoldDirective, isStylesheetId } from './vite-css-id.ts'
import { noteNoDirective } from './vite-order-warnings.ts'
import { type TransformInput, transformStylesheet } from './vite-transform.ts'

export interface Stylesheets {
  configure(config: ResolvedConfigLike): void
  transform(
    ctx: TransformContext,
    code: string,
    id: string,
  ): Promise<TransformResultLike | undefined>
  hotUpdate(ctx: HotUpdateContext, hot: HotUpdateOptions): never[] | undefined
}

/**
 * Whether Vite supplies a real source map for stylesheets in this run (see `TransformInput`).
 */
function hasStylesheetMapsFor(config: ResolvedConfigLike): boolean {
  return config.command === 'serve'
    ? config.css?.devSourcemap === true
    : Boolean(config.build?.sourcemap)
}

/**
 * `file` with Vite's forward slashes, which is how it names every path it reports.
 */
function withForwardSlashes(file: string): string {
  return file.replaceAll('\\', '/')
}

/**
 * What the resolved config decides about every stylesheet (see `TransformInput`): whether Vite
 * supplies a real source map, and whether a marker that covers nothing is reported (not under
 * `css.transformer: 'lightningcss'`).
 */
function settingsOf(config: ResolvedConfigLike | undefined): {
  hasStylesheetMaps: boolean
  reportStaleMarkers: boolean
} {
  if (config === undefined) return { hasStylesheetMaps: false, reportStaleMarkers: true }
  return {
    hasStylesheetMaps: hasStylesheetMapsFor(config),
    reportStaleMarkers: config.css?.transformer !== 'lightningcss',
  }
}

/**
 * What the order warnings of a command need: the command, and the warnings already printed in it.
 */
function warningsOf(context: UsedContext): TransformInput['warnings'] {
  return { command: context.command, memory: context.state.orderWarnings }
}

/**
 * The stylesheet half of the first plugin.
 */
export function createStylesheets(
  extend: ExtendSource,
  onUnknown: 'error' | 'ignore' | 'warn',
  context: UsedContext,
): Stylesheets {
  let settings = settingsOf(undefined)
  // The stylesheets whose transform failed because the `extend` module would not load, by
  // environment. Vite links a stylesheet to a file only from a transform that finished, so a
  // stylesheet that failed never hears the module change, whether or not another stylesheet
  // already uses it.
  const failed = new Map<string, Set<string>>()

  /**
   * Expands the directives of one stylesheet, once the `extend` atoms have loaded.
   */
  async function expand(
    ctx: TransformContext,
    code: string,
    id: string,
  ): Promise<TransformResultLike> {
    const environment = ctx.environment?.name ?? 'client'
    let atoms
    try {
      atoms = await extend.current((file) => {
        ctx.addWatchFile(file)
      })
    } catch (error) {
      failed.set(environment, (failed.get(environment) ?? new Set<string>()).add(id))
      throw error
    }
    failed.get(environment)?.delete(id)
    return transformStylesheet({
      ctx,
      code,
      id,
      extend: atoms,
      onUnknown,
      ...settings,
      warnings: warningsOf(context),
    })
  }

  return {
    configure(config) {
      settings = settingsOf(config)
    },

    async transform(ctx, code, id) {
      if (!isStylesheetId(id)) return
      const environment = ctx.environment?.name ?? 'client'
      if (canHoldDirective(code)) return expand(ctx, code, id)
      // A stylesheet edited to hold no directive no longer waits on the module, and has no
      // order warning left to remember.
      failed.get(environment)?.delete(id)
      noteNoDirective(context.state.orderWarnings, id)
    },

    hotUpdate(ctx, hot) {
      const ids = failed.get(ctx.environment.name)
      const file = extend.file?.()
      if (!ids || file === undefined || ids.size === 0) return
      if (hot.file !== withForwardSlashes(file)) return
      const { moduleGraph } = ctx.environment
      for (const id of ids) {
        const module = moduleGraph.getModuleById(id)
        if (module) moduleGraph.invalidateModule(module as never)
      }
      ids.clear()
      ctx.environment.hot.send({ type: 'full-reload' })
      return []
    },
  }
}
