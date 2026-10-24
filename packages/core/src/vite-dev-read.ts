/**
 * How the dev server reads ahead of a stylesheet: which modules of the graph it starts from, and
 * the transform of everything reachable from them. A read is a request for the module's
 * transform, so what a module names reaches the collected set the way it does when the page asks.
 */
import type { DevEnvironmentLike, GraphModuleLike } from './vite-types.ts'

import { isCssModuleId, isStylesheetId, isUnreadStylesheet } from './vite-css-id.ts'

/**
 * Every module of the environment's graph that no module imports, a stylesheet apart: the entry
 * scripts of every page the browser has asked for, whether or not the stylesheet's own graph
 * holds them.
 */
export function graphRoots(
  environment: Pick<DevEnvironmentLike, 'moduleGraph'>,
): GraphModuleLike[] {
  return environment.moduleGraph.idToModuleMap
    .values()
    .filter(
      (module) => module.importers.size === 0 && (module.id === null || !isStylesheetId(module.id)),
    )
    .toArray()
}

/**
 * Transforms the module at `url`. One that fails is left to say so when the page asks for it.
 */
export async function transformQuietly(
  environment: Pick<DevEnvironmentLike, 'transformRequest'>,
  url: string,
): Promise<void> {
  try {
    await environment.transformRequest(url)
  } catch {
    // The error belongs to the request that asks for the module.
  }
}

/**
 * Whether the read of `module` ends with its own transform. A CSS Module is read for its class
 * map, and what it imports is the client and the files its stylesheet depends on (a module it
 * composes from, a partial it imports): no page runs them, and the build never reads them on their
 * own, so a read that followed them would ship atoms the build does not.
 */
export function isEndOfRead(module: GraphModuleLike): boolean {
  return module.id !== null && isCssModuleId(module.id)
}

/**
 * Transforms every module reachable from `roots`, a level at a time. A stylesheet is never
 * requested (the one being served is mid-transform, and requesting it would wait on itself), a CSS
 * Module apart: it is transformed for the Nave classes it composes, is never held, and its imports
 * are not followed.
 */
export async function transformReachable(
  environment: Pick<DevEnvironmentLike, 'transformRequest'>,
  roots: readonly GraphModuleLike[],
): Promise<void> {
  const seen = new Set<GraphModuleLike>(roots)
  let level = [...roots]
  while (level.length > 0) {
    const next: GraphModuleLike[] = []
    await Promise.all(
      level.map(async (module) => {
        if (module.id !== null && isUnreadStylesheet(module.id)) return
        await transformQuietly(environment, module.url)
        if (isEndOfRead(module)) return
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
