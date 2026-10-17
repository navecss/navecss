/**
 * What the registry's browser criteria need before the page opens, made from the registry the build
 * wrote: the copies on disk with their variants and the facts about each styled part (paint and
 * layers), and the consumer app built twice (build). A step that cannot be made is reported, never
 * thrown, so the criteria fail with its message and the rest of the browser suite still runs.
 */
import type { RegistryApps, RegistryCopies } from './browser-paths.ts'

import { buildApp, layerNames } from './browser-app.ts'
import { paintPlan } from './browser-plan.ts'
import { moduleName, withoutGuards, writeCopies } from './browser-write.ts'
import { fileOf, type LoadedRegistry, loadRegistry } from './load.ts'

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
Writes the registry's copies and says what the paint and layer criteria need to know.
 */
export const prepareCopies = (read: () => LoadedRegistry = loadRegistry): RegistryCopies => {
  try {
    const registry = read()
    writeCopies(registry)
    return { error: undefined, paint: paintPlan(registry) }
  } catch (error) {
    return { error: messageOf(error), paint: [] }
  }
}

/**
Builds the consumer app with the Dialog copy as the registry served it, and again with the copy's
reduced-motion blocks removed from its module.
 */
export const prepareApps = (read: () => LoadedRegistry = loadRegistry): RegistryApps => {
  try {
    const dialog = read().items.get('base-ui-dialog')
    if (dialog === undefined) throw new Error('the registry has no base-ui-dialog item')
    const moduleCss = fileOf(dialog, moduleName(dialog))
    return {
      error: undefined,
      guardRemoved: buildApp({ dialog, moduleCss: withoutGuards(moduleCss), name: 'no-guard' }),
      layerNames: layerNames(),
      moduleCss,
      normal: buildApp({ dialog, moduleCss, name: 'normal' }),
    }
  } catch (error) {
    return {
      error: messageOf(error),
      guardRemoved: undefined,
      layerNames: [],
      moduleCss: '',
      normal: undefined,
    }
  }
}
