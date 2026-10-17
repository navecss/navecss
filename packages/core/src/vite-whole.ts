/**
 * A stylesheet two server environments both write. Astro builds a prerender environment and then
 * a server one, and the second writes a copy of the stylesheet the first wrote and is given the
 * first's file name, so a copy filtered to the second's set would be served under a name a
 * returning visitor's cache already holds, with atoms the cached file lacks. The second leaves
 * such a copy whole, and the check of the layer does not hold that copy to the set.
 */
import type { BundleEntry, EnvironmentLike, RenderedChunk } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { moduleKey } from './vite-state.ts'

/**
 * The stylesheets of `chunk` that `environment` leaves whole: those an earlier server environment
 * of this process also wrote. Only a server environment after a server environment that wrote the
 * first stylesheet does; anywhere else the set is empty.
 */
export function stylesheetsLeftWhole(
  context: UsedContext,
  environment: EnvironmentLike,
  chunk: { readonly modules: RenderedChunk['modules'] },
): Set<string> {
  const { state } = context
  const whole = new Set<string>()
  if (state.firstWriter !== 'server' || environment.config.consumer !== 'server') return whole
  const earlier = [...state.writers]
    .filter(([name, consumer]) => name !== environment.name && consumer === 'server')
    .map(([name]) => name)
  const ids = Object.keys(chunk.modules)
  for (const id of ids) {
    if (earlier.every((name) => !state.sheets.has(moduleKey(name, id)))) continue
    whole.add(id)
    state.whole.add(moduleKey(environment.name, id))
  }
  return whole
}

/**
 * `chunk` without the stylesheets left whole, which is what the plugin hands back to Vite's CSS
 * step.
 */
export function withoutWhole(chunk: RenderedChunk, whole: ReadonlySet<string>): RenderedChunk {
  if (whole.size === 0) return chunk
  return {
    modules: Object.fromEntries(Object.entries(chunk.modules).filter(([id]) => !whole.has(id))),
  }
}

/**
 * What identifies an asset of `environment` across the renaming and rewriting later plugins do
 * to its file: the names it was emitted under and the files it was made from.
 */
function assetKey(environment: string, entry: BundleEntry): string {
  return `${environment}|${(entry.names ?? []).join(',')}|${(entry.originalFileNames ?? []).join(',')}`
}

/**
 * Notes the CSS assets of `environment`'s bundle that were made from a stylesheet it left whole,
 * found through the chunks that import them while the chunks are still there.
 */
export function noteWholeAssets(
  context: UsedContext,
  environment: EnvironmentLike,
  bundle: Readonly<Record<string, BundleEntry>>,
): void {
  const { state } = context
  if (state.whole.size === 0) return
  const chunks = Object.values(bundle).filter((entry) => entry.type === 'chunk')
  for (const entry of chunks) {
    const ids = Object.keys(entry.modules ?? {})
    if (ids.every((id) => !state.whole.has(moduleKey(environment.name, id)))) continue
    const files = entry.viteMetadata?.importedCss ?? new Set<string>()
    for (const file of files) {
      const asset = bundle[file]
      if (asset) state.wholeAssets.add(assetKey(environment.name, asset))
    }
  }
}

/**
 * The bundle without the assets that were left whole.
 */
export function withoutWholeAssets(
  context: UsedContext,
  environment: EnvironmentLike,
  bundle: Readonly<Record<string, BundleEntry>>,
): Record<string, BundleEntry> {
  const { wholeAssets } = context.state
  if (wholeAssets.size === 0) return { ...bundle }
  return Object.fromEntries(
    Object.entries(bundle).filter(
      ([, entry]) =>
        !(entry.type === 'asset' && wholeAssets.has(assetKey(environment.name, entry))),
    ),
  )
}
