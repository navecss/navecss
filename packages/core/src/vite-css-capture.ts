/**
 * Keeping the text of each stylesheet that holds the atomic layer, as Vite's own CSS step
 * (`vite:css-post`) receives it. That step takes whatever every normal-order plugin made of the
 * stylesheet, wherever the plugin sits in `plugins`, so a plugin listed after Nave has done its
 * work by then. The text Nave's own transform returns has not, and handing it back later would
 * replace what those plugins did.
 */
import type { PluginLike } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { inspectAtomicLayer } from './vite-prune.ts'
import { moduleKey } from './vite-state.ts'

type Handler = (this: unknown, css: string, id: string) => unknown

// What each wrapped handler was before it was wrapped.
const originals = new WeakMap<Handler, Handler>()

/**
 * The handler of a plugin's `transform`, whether it is a function or an object with a `handler`.
 */
export function transformHandler(plugin: PluginLike): Handler | undefined {
  const { transform } = plugin
  if (typeof transform === 'function') return transform as Handler
  const handler = (transform as { handler?: unknown } | undefined)?.handler
  return typeof handler === 'function' ? (handler as Handler) : undefined
}

/**
 * The handler as Vite wrote it, with any wrapper of ours taken off.
 */
export function unwrapped(handler: Handler): Handler {
  let current = handler
  for (let next = originals.get(current); next; next = originals.get(current)) current = next
  return current
}

/**
 * Keeps the text of a stylesheet that holds the atomic layer, and forgets what an earlier edit of
 * it kept once it holds none.
 */
function remember(context: UsedContext, environment: string, id: string, css: string): void {
  const key = moduleKey(environment, id)
  const isPossible = css.includes('\\') || /layer/i.test(css)
  if (isPossible && inspectAtomicLayer(css).hasLayer) context.state.sheets.set(key, css)
  else context.state.sheets.delete(key)
}

/**
 * Wraps the `transform` of Vite's CSS step so each stylesheet it receives is remembered, in a
 * build under the default. It changes nothing the step is given or returns.
 */
export function captureStylesheets(
  context: UsedContext,
  plugins: readonly PluginLike[] | undefined,
): void {
  const plugin = plugins?.find((candidate) => candidate.name === 'vite:css-post')
  const original = plugin && transformHandler(plugin)
  if (!plugin || !original) return
  const wrapped: Handler = function (this: unknown, css, id) {
    const environment = (this as { environment?: { name: string } }).environment?.name ?? 'client'
    remember(context, environment, id, css)
    return original.call(this, css, id)
  }
  originals.set(wrapped, original)
  const { transform } = plugin
  ;(plugin as { transform: unknown }).transform =
    typeof transform === 'function' ? wrapped : { ...(transform as object), handler: wrapped }
}
