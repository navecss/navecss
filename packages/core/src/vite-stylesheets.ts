/**
 * The first half's stylesheet work: expand the directives of every stylesheet Vite compiles,
 * remember the ones that failed because the `extend` module would not load (so fixing the module
 * reloads them), and keep the text of each stylesheet that holds the atomic layer for the step
 * that prunes it before Vite names the CSS file.
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
import { moduleKey } from './vite-state.ts'
import { transformStylesheet } from './vite-transform.ts'
import { isUsed } from './vite-used.ts'

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
 * Whether `code` is a stylesheet holding an `@layer atomic` block.
 */
function isHoldingAtomicLayer(code: string): boolean {
  return /@layer\s+atomic\s*\{/.test(code)
}

/**
 * Keeps the text of a stylesheet that holds the atomic layer, in a build under the default.
 */
function rememberLayer(context: UsedContext, key: string, text: string): void {
  if (context.command !== 'build' || !isUsed(context) || !isHoldingAtomicLayer(text)) return
  context.state.sheets.set(key, text)
}

/**
 * The stylesheet half of the first plugin.
 */
export function createStylesheets(
  context: UsedContext,
  extend: ExtendSource,
  onUnknown: 'error' | 'ignore' | 'warn',
): Stylesheets {
  let hasStylesheetMaps = false
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
    return transformStylesheet({ ctx, code, id, extend: atoms, onUnknown, hasStylesheetMaps })
  }

  return {
    configure(config) {
      hasStylesheetMaps = hasStylesheetMapsFor(config)
    },

    async transform(ctx, code, id) {
      if (!isStylesheetId(id)) return
      const environment = ctx.environment?.name ?? 'client'
      const hasDirective = canHoldDirective(code)
      // A stylesheet edited to hold no directive no longer waits on the module.
      if (!hasDirective) failed.get(environment)?.delete(id)
      const result = hasDirective ? await expand(ctx, code, id) : undefined
      rememberLayer(context, moduleKey(environment, id), result?.code ?? code)
      return result
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
