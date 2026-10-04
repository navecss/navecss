/**
 * What the dev server does for a stylesheet that holds the atomic layer, under the default. It
 * serves the layer filtered to the atoms the build would emit, as far as the dev server has read:
 * the first response waits until every module reachable from the roots of the graph that imports
 * the stylesheet has been transformed (so the set is complete for what the page loads), and a set
 * that grows afterwards reloads the stylesheets already served, batched, through Vite's own module
 * reload. `devServing` is an object, so a test can stand a scratch copy of one step in its place.
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

import { isStylesheetId } from './vite-css-id.ts'
import { judgeMarkup } from './vite-markup.ts'
import { inspectAtomicLayer, pruneAtomicLayer } from './vite-prune.ts'
import { collectedAtoms } from './vite-state.ts'

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
   * Waits until the modules reachable from the roots of the graph that imports the stylesheet
   * `id` have been transformed.
   */
  hold(environment: DevEnvironmentLike, id: string): Promise<void>
  /**
   * Notes that the set of atoms read may have grown, and reloads the served stylesheets it
   * outgrew.
   */
  noteGrowth(context: UsedContext): void
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
 * The modules at the roots of the graph `module` belongs to: those no module imports.
 */
function rootsOf(module: GraphModuleLike): GraphModuleLike[] {
  const roots: GraphModuleLike[] = []
  const seen = new Set<GraphModuleLike>([module])
  const queue = [module]
  for (let next = queue.shift(); next; next = queue.shift()) {
    const fresh = [...next.importers.difference(seen)]
    for (const importer of fresh) seen.add(importer)
    queue.push(...fresh)
    if (next !== module && next.importers.size === 0) roots.push(next)
  }
  return roots
}

/**
 * Transforms the module at `url`. One that fails is left to say so when the page asks for it.
 */
async function transformQuietly(environment: DevEnvironmentLike, url: string): Promise<void> {
  try {
    await environment.transformRequest(url)
  } catch {
    // The error belongs to the request that asks for the module.
  }
}

/**
 * Transforms every module reachable from `roots`, a level at a time. A stylesheet is never
 * requested (the one being served is mid-transform, and requesting it would wait on itself).
 */
async function transformReachable(
  environment: DevEnvironmentLike,
  roots: readonly GraphModuleLike[],
): Promise<void> {
  const seen = new Set<GraphModuleLike>(roots)
  let level = [...roots]
  while (level.length > 0) {
    const next: GraphModuleLike[] = []
    await Promise.all(
      level.map(async (module) => {
        if (module.id !== null && isStylesheetId(module.id)) return
        await transformQuietly(environment, module.url)
        for (const imported of module.importedModules) {
          if (seen.has(imported)) continue
          seen.add(imported)
          next.push(imported)
        }
      }),
    )
    level = next
  }
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

/**
 * Reads the changed `scripts` again, ahead of the update that will reload them, so the set holds
 * what the edit added. A script is invalidated here, which Vite does again when it sends the
 * update.
 */
async function readAhead(
  context: UsedContext,
  environment: HotUpdateContext['environment'],
  scripts: readonly GraphModuleLike[],
): Promise<void> {
  const { state } = context
  // The reload noteGrowth would send on the next turn waits: this update sends the stylesheets.
  state.readAhead += 1
  try {
    for (const module of scripts) {
      environment.moduleGraph.invalidateModule(module as never)
      await transformQuietlyWith(environment, module.url)
    }
  } finally {
    state.readAhead -= 1
  }
}

/**
 * `transformRequest` of a hot-update environment, which not every host provides.
 */
async function transformQuietlyWith(
  environment: HotUpdateContext['environment'],
  url: string,
): Promise<void> {
  try {
    await environment.transformRequest?.(url)
  } catch {
    // The error belongs to the request that asks for the module.
  }
}

/**
 * Takes the stylesheets the set outgrew off the waiting list, marking each as being reloaded, and
 * returns their modules.
 */
function takeStaleModules(
  context: UsedContext,
  environment: HotUpdateContext['environment'],
): GraphModuleLike[] {
  const { state } = context
  const ids = [...state.stale]
  state.stale.clear()
  clearTimeout(state.reloadTimer)
  state.reloadTimer = undefined
  const sheets: GraphModuleLike[] = []
  for (const id of ids) {
    const module = environment.moduleGraph.getModuleById(id) as GraphModuleLike | undefined
    if (!module) continue
    state.reloading.set(id, Date.now())
    sheets.push(module)
  }
  return sheets
}

/**
 * The modules a file change reloads, with the stylesheets its atoms outgrew added, so the page
 * receives them in one update and applies the rules before it runs what uses them. `undefined`
 * when no served stylesheet needs to change.
 */
async function modulesWithGrownStylesheets(
  context: UsedContext,
  ctx: HotUpdateContext,
  hot: HotUpdateOptions,
): Promise<never[] | undefined> {
  const { environment } = ctx
  if (environment.config?.consumer !== 'client' || context.state.served.size === 0) return
  const scripts = (hot.modules ?? []).filter((m) => m.id !== null && !isStylesheetId(m.id))
  if (scripts.length === 0) return
  await readAhead(context, environment, scripts)
  const sheets = takeStaleModules(context, environment)
  // Vite's own module nodes, which `hotUpdate` returns as an array of its own type.
  return sheets.length === 0 ? undefined : ([...(hot.modules ?? []), ...sheets] as never[])
}

export const devServing: DevServing = {
  modulesWithGrown: modulesWithGrownStylesheets,

  async hold(environment, id) {
    const module = environment.moduleGraph.getModuleById(id)
    if (!module) return
    const roots = rootsOf(module)
    if (roots.length === 0) return
    // The dependency optimizer holds its first result until the first static imports are done,
    // and the stylesheet being served is one of them. Saying it is not waited on lets the
    // optimizer finish, which the transform of a prebundled dependency below waits for.
    await environment.waitForRequestsIdle(id)
    await transformReachable(environment, roots)
  },

  noteGrowth(context) {
    const { state } = context
    if (state.served.size === 0) return
    const atoms = collectedAtoms(state, context.kept)
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
 * Whether the stylesheet `id` is one the dev server filters: not a `?inline` import, whose text
 * is part of the JavaScript, as in a build.
 */
function isServedAsStylesheet(id: string): boolean {
  return isStylesheetId(id) && !/[?&]inline\b/.test(id)
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
  judgeMarkup(context, (message) => context.logger?.warn(message))
  if (environment.config.consumer !== 'client') return undefined
  const atoms = collectedAtoms(context.state, context.kept)
  context.state.served.set(id, { environment: dev, atoms })
  context.state.reloading.delete(id)
  return { code: pruneAtomicLayer(css, atoms), map: NO_MAP }
}
