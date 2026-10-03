/**
 * Emitting only the atoms the build read. A stylesheet holding the atomic layer is pruned before
 * Vite's CSS step names the CSS file, by handing the pruned text back to that step, so the file
 * name follows the emitted set and a returning visitor never gets a stale stylesheet. Before the
 * bundle is written, the layers in the CSS assets are checked against the set, and a mismatch
 * (the substitution did not take on this Vite) fails the build.
 */
import type { RootState } from './vite-state.ts'
import type {
  BundleContext,
  BundleEntry,
  PluginLike,
  RenderContext,
  RenderedChunk,
} from './vite-types.ts'

import { inspectAtomicLayer, pruneAtomicLayer } from './vite-prune.ts'

const decoder = new TextDecoder()

/**
 * The handler of a plugin's `transform`, whether it is a function or an object with a `handler`.
 */
function transformHandler(plugin: PluginLike): ((...args: unknown[]) => unknown) | undefined {
  const { transform } = plugin
  if (typeof transform === 'function') return transform as (...args: unknown[]) => unknown
  const handler = (transform as { handler?: unknown } | undefined)?.handler
  return typeof handler === 'function' ? (handler as (...args: unknown[]) => unknown) : undefined
}

/**
 * Hands the pruned `css` of the stylesheet `id` back to Vite's own CSS step for this environment,
 * which keeps it for the chunk and names the file after it.
 */
async function refeed(ctx: RenderContext, css: string, id: string): Promise<void> {
  const plugin = ctx.environment.plugins.find((candidate) => candidate.name === 'vite:css-post')
  const handler = plugin && transformHandler(plugin)
  if (!handler) {
    ctx.error(
      "nave: this version of Vite has no CSS step the plugin knows how to hand a stylesheet back to, so it cannot remove the unused atoms. Ship every atom with atomic: 'all' in navePlugin() until the plugin supports this version of Vite.",
    )
  }
  await handler.call(ctx, css, id)
}

/**
 * Prunes every stylesheet of `chunk` that holds the atomic layer, and hands each back to Vite.
 * `emitted` is the set to keep.
 */
export async function refeedChunkStylesheets(
  ctx: RenderContext,
  chunk: RenderedChunk,
  state: RootState,
  emitted: ReadonlySet<string>,
): Promise<void> {
  const prefix = `${ctx.environment.name}\0`
  for (const id of Object.keys(chunk.modules)) {
    const css = state.sheets.get(`${prefix}${id}`)
    if (css === undefined) continue
    await refeed(ctx, pruneAtomicLayer(css, emitted), id)
  }
}

/**
 * The text of a CSS asset, whether Rollup holds it as a string or as bytes.
 */
function textOf(entry: BundleEntry): string {
  const { source } = entry
  if (source === undefined) return ''
  return typeof source === 'string' ? source : decoder.decode(source)
}

/**
 * What is wrong with the atomic layers of the CSS assets, in words: a rule for an atom that was
 * not emitted, in any asset, and an emitted atom that no asset carrying a layer has a rule for
 * (a layer may be split across assets, and a layer of the consumer's own holds no atom at all).
 */
function mismatchLines(
  assets: readonly { css: string; fileName: string }[],
  emitted: ReadonlySet<string>,
): string[] {
  const lines: string[] = []
  const seenAnywhere = new Set<string>()
  let hasLayer = false
  for (const { fileName, css } of assets) {
    const seen = inspectAtomicLayer(css)
    if (!seen.hasLayer) continue
    hasLayer = true
    for (const atom of seen.atoms) seenAnywhere.add(atom)
    const extra = [...seen.atoms.difference(emitted)]
    if (extra.length > 0) {
      lines.push(
        `${fileName}: the atomic layer holds a rule for ${extra.join(', ')}, which the build did not emit.`,
      )
    }
  }
  const missing = [...emitted.difference(seenAnywhere)]
  if (hasLayer && missing.length > 0) {
    lines.push(`the atomic layers hold no rule for ${missing.join(', ')}, which the build emitted.`)
  }
  return lines
}

/**
 * Fails the build when a CSS asset's atomic layer does not hold exactly the emitted atoms: the
 * substitution did not take on this Vite, and the stylesheet would ship wrong. Text outside
 * `@layer atomic` is not examined.
 */
export function checkAtomicLayers(
  ctx: BundleContext,
  bundle: Readonly<Record<string, BundleEntry>>,
  emitted: ReadonlySet<string>,
): void {
  const assets = Object.values(bundle)
    .filter((entry) => entry.type === 'asset' && entry.fileName.toLowerCase().endsWith('.css'))
    .map((entry) => ({ fileName: entry.fileName, css: textOf(entry) }))
  const lines = mismatchLines(assets, emitted)
  if (lines.length === 0) return
  ctx.error({
    message: [
      'nave: the built CSS does not hold exactly the atoms the build emitted, so the plugin could not remove the unused ones on this version of Vite.',
      ...lines,
      "Ship every atom with atomic: 'all' in navePlugin() until the plugin supports this version of Vite.",
    ].join('\n'),
  })
}
