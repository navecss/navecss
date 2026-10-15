/**
 * What the plugin does when an environment's bundle is generated: settle whether the environment
 * wrote a stylesheet holding the atomic layer, read every such stylesheet against the set the
 * environment filtered with, and scan every CSS asset for a directive that survived. It reads
 * twice. Once before any other plugin's `generateBundle`, while every stylesheet Astro will inline
 * or rename is still in the bundle; and once after them all, for what other plugins add late. The
 * first pass only records what it read, and the second raises, so a failure is the post-ordered
 * plugin's, as it always was, and a stylesheet both passes read is one asset, not two.
 */
import type { Finding } from './directive/findings.ts'
import type { LayerReading } from './vite-emit.ts'
import type { BundleContext, BundleEntry, EnvironmentLike } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { formatFinding } from './directive/findings.ts'
import { layerMessage, mismatchLines, readLayers } from './vite-emit.ts'
import { canWriteStylesheets, emittedSet } from './vite-emitted.ts'
import { scanAssets, scanMessage } from './vite-scan.ts'
import { noteWholeAssets, withoutWholeAssets } from './vite-whole.ts'

/**
 * What the first pass read of one bundle.
 */
interface Read {
  readonly layer: LayerReading
  readonly findings: Map<string, Finding>
  readonly assets: Set<string>
  /**
   * Whether a stylesheet holding the layer was in the bundle in either pass.
   */
  wrote: boolean
}

// Keyed by the output options both passes of one generate step are given: the bundle is not the
// same object in both.
const reads = new WeakMap<object, Read>()

/**
 * The text of a CSS asset's source.
 */
function sourceText(entry: BundleEntry): string {
  return typeof entry.source === 'string' ? entry.source : new TextDecoder().decode(entry.source)
}

/**
 * Whether a CSS asset of the bundle holds the atomic layer.
 */
function hasLayerAsset(bundle: Readonly<Record<string, BundleEntry>>): boolean {
  return Object.values(bundle).some(
    (entry) =>
      entry.type === 'asset' &&
      entry.fileName.toLowerCase().endsWith('.css') &&
      /@layer\s+atomic\b/.test(sourceText(entry)),
  )
}

/**
 * One generate step of one output: its bundle, and the key both passes of it share.
 */
interface Step {
  readonly bundle: Readonly<Record<string, BundleEntry>>
  readonly output: object
}

/**
 * Whether `environment` wrote a stylesheet holding the layer, in either pass. If it did it is a
 * writer; a server environment that fixed the first set and then wrote none was not the writer
 * after all, so the next environment to write decides the case.
 */
function didWrite(context: UsedContext, environment: EnvironmentLike, step: Step): boolean {
  const { state } = context
  if (reads.get(step.output)?.wrote === true || hasLayerAsset(step.bundle)) {
    state.writers.set(environment.name, environment.config.consumer)
    return true
  }
  if (state.emittedBy === environment.name && environment.config.consumer !== 'client') {
    state.emitted = undefined
    state.emittedBy = undefined
    state.firstWriter = undefined
    state.fixed.delete(environment.name)
  }
  return false
}

/**
 * Adds what the bundle holds now to what an earlier pass read of it.
 */
function accumulate(step: Step, layer: LayerReading | undefined, isWriter: boolean): Read {
  const { bundle, output } = step
  const before = reads.get(output) ?? {
    layer: new Map<string, LayerReading extends Map<string, infer A> ? A : never>(),
    findings: new Map<string, Finding>(),
    assets: new Set<string>(),
    wrote: false,
  }
  reads.set(output, before)
  before.wrote ||= isWriter
  // An asset still in the bundle is read as it is now; one a plugin took out since stands as the
  // first pass read it.
  if (layer) for (const [name, asset] of layer) before.layer.set(name, asset)
  const scanned = scanAssets(bundle)
  for (const finding of scanned.findings) before.findings.set(formatFinding(finding), finding)
  for (const name of scanned.names) before.assets.add(name)
  return before
}

/**
 * What the environment's stylesheets say of the layer against the set it filtered with, when it
 * wrote any.
 */
function readWritten(
  ctx: BundleContext,
  context: UsedContext,
  step: Step,
): { readonly emitted: ReadonlySet<string>; readonly layer: LayerReading } | undefined {
  const { environment } = ctx
  if (environment === undefined || context.options.atomic !== 'used') return undefined
  if (!canWriteStylesheets(context, environment)) return undefined
  if (!didWrite(context, environment, step)) return undefined
  noteWholeAssets(context, environment, step.bundle)
  const emitted = emittedSet(context, environment, (message) => {
    ctx.warn(message)
  })
  return {
    emitted,
    layer: readLayers(withoutWholeAssets(context, environment, step.bundle), emitted),
  }
}

/**
 * Fails the build when the layers say something is wrong.
 */
function failOnMismatch(ctx: BundleContext, lines: readonly string[]): void {
  if (lines.length > 0) ctx.error({ message: layerMessage(lines) })
}

/**
 * Fails the build when a directive survived into any CSS asset either pass read.
 */
function failOnFindings(ctx: BundleContext, read: Read): void {
  if (read.findings.size === 0) return
  ctx.error({ message: scanMessage(read.findings.values().toArray(), read.assets.size) })
}

/**
 * The second pass's verdict: what both passes read, against the set the environment filtered with.
 */
function raise(
  ctx: BundleContext,
  seen: {
    readonly emitted: ReadonlySet<string> | undefined
    readonly output: object
    readonly read: Read
  },
): void {
  reads.delete(seen.output)
  if (seen.emitted) failOnMismatch(ctx, mismatchLines(seen.read.layer, seen.emitted))
  failOnFindings(ctx, seen.read)
}

/**
 * The generate step of the plugin, for one environment's `bundle`, in the pass `pass`. `options`
 * are the output options both passes are given; a host that gives none is read by the bundle itself.
 */
export function checkBundle(
  ctx: BundleContext,
  context: UsedContext,
  step: {
    readonly bundle: Readonly<Record<string, BundleEntry>>
    readonly options: unknown
    readonly pass: 'post' | 'pre'
  },
): void {
  const { bundle, options, pass } = step
  const output = typeof options === 'object' && options !== null ? options : bundle
  const written = readWritten(ctx, context, { bundle, output })
  const read = accumulate({ bundle, output }, written?.layer, written !== undefined)
  if (pass === 'post') raise(ctx, { emitted: written?.emitted, output, read })
}
