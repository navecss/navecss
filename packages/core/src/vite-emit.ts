/**
 * Emitting only the atoms the build read. A stylesheet holding the atomic layer is pruned before
 * Vite's CSS step names the CSS file, by handing the pruned text back to that step, so the file
 * name follows the emitted set and a returning visitor never gets a stale stylesheet. Before the
 * bundle is written, the layers in the CSS assets are checked against the set, and a mismatch
 * (the substitution did not take on this Vite) fails the build.
 */
import { readFileSync } from 'node:fs'

import type { RootState } from './vite-state.ts'
import type { BundleContext, BundleEntry, RenderContext, RenderedChunk } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { transformHandler, unwrapped } from './vite-css-capture.ts'
import { filePathOf, isStylesheetPath } from './vite-css-id.ts'
import { moduleLabel } from './vite-module-kind.ts'
import { inspectAtomicLayer, pruneAtomicLayer, unprunedAtoms } from './vite-prune.ts'

const decoder = new TextDecoder()

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
  await unwrapped(handler).call(ctx, css, id)
}

// What a build has already done once: the stylesheets of HTML pages handed back, and the text
// imports warned about. Each is held against the build's emitted set, which a build fixes anew,
// so a rebuild in watch mode starts from nothing.
const fedPages = new WeakMap<ReadonlySet<string>, Set<string>>()
const warnedText = new WeakMap<ReadonlySet<string>, Set<string>>()

/**
 * The set of ids `book` holds for the build `emitted` belongs to.
 */
function bookFor(
  book: WeakMap<ReadonlySet<string>, Set<string>>,
  emitted: ReadonlySet<string>,
): Set<string> {
  const ids = book.get(emitted) ?? new Set<string>()
  book.set(emitted, ids)
  return ids
}

/**
 * Whether the module `id` is the stylesheet of a `<style>` element or attribute of an HTML page.
 */
function isPageStylesheet(id: string): boolean {
  return /[?&]html-proxy\b/.test(id)
}

/**
 * The inline stylesheets of HTML pages the environment compiled. No chunk holds them: Vite keeps
 * their text for the page itself, so they are handed back whichever chunk is rendered first.
 */
function pageStylesheets(
  ctx: RenderContext,
  state: RootState,
  emitted: ReadonlySet<string>,
): string[] {
  const prefix = `${ctx.environment.name}\0`
  const fed = bookFor(fedPages, emitted)
  const ids = state.sheets
    .keys()
    .filter((key) => key.startsWith(prefix) && isPageStylesheet(key))
    .map((key) => key.slice(prefix.length))
    .filter((id) => !fed.has(id))
    .toArray()
  for (const id of ids) fed.add(id)
  return ids
}

/**
 * Whether the module `id` is a stylesheet imported with `?inline`, whose text Vite makes part of
 * the JavaScript.
 */
function isInlineImport(id: string): boolean {
  return /[?&]inline\b/.test(id) && !isPageStylesheet(id)
}

/**
 * Whether the module `id` is a stylesheet imported with `?raw`: its bytes, as a string.
 */
function isRawImport(id: string): boolean {
  return /[?&]raw\b/.test(id) && isStylesheetPath(id)
}

/**
 * Whether the file behind a `?raw` import holds the atomic layer. Nothing was compiled, so the
 * file itself is read.
 */
function isLayerFile(id: string): boolean {
  try {
    return inspectAtomicLayer(readFileSync(filePathOf(id), 'utf8')).hasLayer
  } catch {
    return false
  }
}

/**
 * Prunes every stylesheet of `chunk` that holds the atomic layer, and hands each back to Vite,
 * together with the inline stylesheets of the pages. `emitted` is the set to keep. A stylesheet
 * imported with `?inline` is left as it is (see `warnTextImports`).
 */
export async function refeedChunkStylesheets(
  ctx: RenderContext,
  chunk: RenderedChunk,
  state: RootState,
  emitted: ReadonlySet<string>,
): Promise<void> {
  const prefix = `${ctx.environment.name}\0`
  for (const id of [...Object.keys(chunk.modules), ...pageStylesheets(ctx, state, emitted)]) {
    const css = state.sheets.get(`${prefix}${id}`)
    if (css === undefined || isInlineImport(id)) continue
    await refeed(ctx, pruneAtomicLayer(css, emitted), id)
  }
}

/**
 * Says, once for each in a build, which stylesheets of `chunk` are imported with `?inline` or
 * `?raw` and hold the atomic layer: their text is part of the JavaScript chunk, where the plugin
 * does not edit it, so every atom in the layer ships.
 */
export function warnTextImports(
  ctx: RenderContext,
  chunk: RenderedChunk,
  context: UsedContext,
  emitted: ReadonlySet<string>,
): void {
  const prefix = `${ctx.environment.name}\0`
  const warned = bookFor(warnedText, emitted)
  for (const id of Object.keys(chunk.modules)) {
    if (warned.has(id)) continue
    const isInline = isInlineImport(id) && context.state.sheets.has(`${prefix}${id}`)
    const isRaw = !isInline && isRawImport(id) && isLayerFile(id)
    if (!isInline && !isRaw) continue
    warned.add(id)
    const query = isInline ? '?inline' : '?raw'
    ctx.warn(
      `${moduleLabel(context.root, id)} is imported with ${query}, so its stylesheet is text in the JavaScript, which the plugin does not filter: every atom in its atomic layer ships, not only the atoms this build emits. Import it without ${query} to have the layer filtered.`,
    )
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
    const extra = unprunedAtoms(css, emitted)
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
