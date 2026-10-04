/**
 * The dev server's part in a file change: the scripts the change reloads are read again, and the
 * modules they newly import with them, ahead of the update, so the set holds what the edit added
 * and the update can carry the stylesheets that outgrew it.
 */
import type { GraphModuleLike, HotUpdateContext, HotUpdateOptions } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { isStylesheetId } from './vite-css-id.ts'
import { transformQuietly, transformReachable } from './vite-dev-read.ts'

type UpdateEnvironment = HotUpdateContext['environment']

/**
 * `environment` as the read of a module asks for it: `transformRequest` is not one every host
 * provides.
 */
function readerOf(environment: UpdateEnvironment): {
  transformRequest(url: string): Promise<unknown>
} {
  return {
    transformRequest: (url) => environment.transformRequest?.(url) ?? Promise.resolve(),
  }
}

/**
 * Reads the changed `scripts` again, ahead of the update that will reload them, and what each
 * newly imports with them, so the set holds what the edit added. A script is invalidated here,
 * which Vite does again when it sends the update.
 */
async function readAhead(
  context: UsedContext,
  environment: UpdateEnvironment,
  scripts: readonly GraphModuleLike[],
): Promise<void> {
  const { state } = context
  const reader = readerOf(environment)
  // The reload noteGrowth would send on the next turn waits: this update sends the stylesheets.
  state.readAhead += 1
  try {
    for (const module of scripts) {
      const known = new Set(module.importedModules)
      environment.moduleGraph.invalidateModule(module as never)
      await transformQuietly(reader, module.url)
      const added = [...module.importedModules.difference(known)]
      await transformReachable(reader, added)
    }
  } finally {
    state.readAhead -= 1
  }
}

/**
 * Takes the stylesheets the set outgrew off the waiting list, marking each as being reloaded, and
 * returns their modules.
 */
function takeStaleModules(context: UsedContext, environment: UpdateEnvironment): GraphModuleLike[] {
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
export async function modulesWithGrownStylesheets(
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
