/**
 * What the dev server does for a stylesheet that holds the atomic layer, under the default. It
 * serves the layer filtered to the atoms the build would emit, as far as the dev server has read:
 * the first response waits until every module reachable from the roots of the module graph has
 * been transformed (so the set is complete for what the pages load, whichever script each page
 * starts from), and a set that grows afterwards reloads the stylesheets already served, batched,
 * through Vite's own module reload, and, when a page's classes grew it, drops their cached text so
 * the next request filters again. `devServing` is an object, so a test can stand a scratch copy of
 * one step in its place.
 */
import type {
  DevEnvironmentLike,
  GraphModuleLike,
  HotUpdateContext,
  HotUpdateOptions,
  TransformContext,
  TransformResultLike,
} from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { isServedAsStylesheet, judgeWhenServed } from './vite-dev-judge.ts'
import { graphRoots, transformReachable } from './vite-dev-read.ts'
import { modulesWithGrownStylesheets } from './vite-dev-update.ts'
import { inspectAtomicLayer, pruneAtomicLayer } from './vite-prune.ts'
import { servedAtoms } from './vite-state.ts'

/**
 * How long a reload that the page has not answered by asking for the stylesheet again holds back
 * the next one, so a page that is gone does not keep the stylesheet from ever reloading.
 */
const RELOAD_ANSWER_MS = 2000

/**
 * The map of text that was cut apart: it describes nothing, and says so, which is how Vite is
 * told the map is deliberately empty and not forgotten.
 */
const NO_MAP = JSON.stringify({ mappings: '' })

export interface DevServing {
  /**
   * Waits until the modules reachable from the roots of the module graph have been transformed,
   * for a stylesheet `id` that a module imports; one that nothing imports is answered at once.
   */
  hold(environment: DevEnvironmentLike, id: string): Promise<void>
  /**
   * Notes that the set of atoms read may have grown, and reloads the served stylesheets it
   * outgrew.
   */
  noteGrowth(context: UsedContext): void
  /**
   * Notes that a page was read: the served stylesheets its classes outgrew are dropped from the
   * module graph's cache, so the request of a page that is loading filters them again, and the
   * pages already live are told as for any growth.
   */
  notePages(context: UsedContext): void
  /**
   * For a file change: the modules it reloads and the served stylesheets its atoms outgrew, for
   * one update; `undefined` when no stylesheet needs to change.
   */
  modulesWithGrown(
    context: UsedContext,
    ctx: HotUpdateContext,
    hot: HotUpdateOptions,
  ): Promise<never[] | undefined>
}

/**
 * Asks `environment` to reload `module`. A page that is gone has nothing to reload.
 */
async function reloadQuietly(
  environment: DevEnvironmentLike,
  module: GraphModuleLike,
): Promise<void> {
  try {
    await environment.reloadModule(module)
  } catch {
    // No client is listening.
  }
}

/**
 * Asks each stale stylesheet's environment to reload it, and forgets what was waiting.
 */
function reloadStale(context: UsedContext): void {
  const { state } = context
  state.reloadTimer = undefined
  const ids = [...state.stale]
  state.stale.clear()
  for (const id of ids) {
    const sheet = state.served.get(id)
    const module = sheet?.environment.moduleGraph.getModuleById(id)
    if (!sheet || !module) continue
    state.reloading.set(id, Date.now())
    void reloadQuietly(sheet.environment, module)
  }
}

/**
 * Whether a reload of the stylesheet `id` was sent and the page has not asked for it since. The
 * stylesheet it will be given is filtered to the set at that moment, so growth in between needs
 * no reload of its own.
 */
function isReloading(context: UsedContext, id: string): boolean {
  const sent = context.state.reloading.get(id)
  return sent !== undefined && Date.now() - sent < RELOAD_ANSWER_MS
}

export const devServing: DevServing = {
  modulesWithGrown: modulesWithGrownStylesheets,

  async hold(environment, id) {
    const module = environment.moduleGraph.getModuleById(id)
    if (!module) return
    // A stylesheet no module imports (a `<link>` names it) is answered at once.
    if (module.importers.size === 0) return
    // The dependency optimizer holds its first result until the first static imports are done,
    // and the stylesheet being served is one of them. Saying it is not waited on lets the
    // optimizer finish, which the transform of a prebundled dependency below waits for.
    await environment.waitForRequestsIdle(id)
    await transformReachable(environment, graphRoots(environment))
  },

  notePages(context) {
    const { state } = context
    const atoms = servedAtoms(state, context.kept)
    for (const sheet of state.served) {
      const [id, { atoms: served, environment }] = sheet
      if (atoms.isSubsetOf(served)) continue
      const module = environment.moduleGraph.getModuleById(id)
      if (module) environment.moduleGraph.invalidateModule(module)
    }
    devServing.noteGrowth(context)
  },

  noteGrowth(context) {
    const { state } = context
    if (state.served.size === 0) return
    const atoms = servedAtoms(state, context.kept)
    for (const [id, sheet] of state.served) {
      if (!atoms.isSubsetOf(sheet.atoms) && !isReloading(context, id)) state.stale.add(id)
    }
    // The next turn of the event loop, so the modules a burst transforms together send one reload
    // and the reload goes out before the browser has had time to run what grew the set.
    if (state.stale.size > 0 && state.reloadTimer === undefined && state.readAhead === 0) {
      state.reloadTimer = setTimeout(() => {
        reloadStale(context)
      }, 0)
      state.reloadTimer.unref()
    }
  },
}

/**
 * The dev server's filtering of one stylesheet, after its directives were expanded: waits for the
 * graph, judges the markup warning, and returns the text with the atoms outside the dev set
 * removed. A stylesheet that holds no atomic layer, or that is not the client's, is left alone.
 */
export async function serveStylesheet(
  context: UsedContext,
  ctx: TransformContext,
  stylesheet: { readonly css: string; readonly id: string },
): Promise<TransformResultLike | undefined> {
  const { css, id } = stylesheet
  const { environment } = ctx
  if (!environment || !isServedAsStylesheet(id)) return undefined
  const isPossible = css.includes('\\') || /layer/i.test(css)
  if (!isPossible || !inspectAtomicLayer(css).hasLayer) return undefined
  const dev = environment as unknown as DevEnvironmentLike
  if (environment.config.consumer === 'client') await devServing.hold(dev, id)
  judgeWhenServed(context, id)
  if (environment.config.consumer !== 'client') return undefined
  const atoms = servedAtoms(context.state, context.kept)
  context.state.served.set(id, { environment: dev, atoms })
  context.state.reloading.delete(id)
  return { code: pruneAtomicLayer(css, atoms), map: NO_MAP }
}
