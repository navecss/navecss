/**
 * Nave Vite plugin: expands `@nave` directives in every stylesheet Vite compiles, fails the build
 * when one survives into its CSS output, and by default filters the atomic layer of every stylesheet it can reach down to the atoms the build reads a use for.
 *
 * Setup:
 *   import { navePlugin } from '@navecss/core/vite'
 *   export default { plugins: [navePlugin()] }               // Nave atoms only, fails on a problem
 *   navePlugin({ extend: myAtoms })                          // Nave + consumer atoms
 *   navePlugin({ extend: './my-atoms.mjs' })                 // the same, from a module Vite watches
 *   navePlugin({ onUnknown: 'warn' })                        // report a problem and skip it
 *   navePlugin({ keep: ['grid'] })                           // atoms a cx.dynamic() call can take
 *   navePlugin({ cxModules: ['./src/ui/index.ts'] })         // modules that re-export cx
 *   navePlugin({ atomic: 'all' })                            // ship every atom, read no cx() call
 *
 * `navePlugin()` returns two plain Vite plugin objects with no dependency and no peer, in an array
 * that `plugins` takes as one entry. The first runs in Vite's normal order, after Vite's own CSS
 * step, so a stylesheet reached through `@import`, a Sass or Less file, a CSS Module, and a Vue
 * or Svelte style block are all read as the CSS they compile to. It never runs before Vite's CSS
 * step: that order misses `@import`-reached files and breaks Sass `@mixin`. The second runs in
 * post order and reads the JavaScript. Neither adds runtime machinery to the browser bundle.
 */
import type { AtomDefinition } from './atoms.ts'
import type { NaveCollectPlugin } from './vite-collect-plugin.ts'
import type { UsedConfig } from './vite-config-hooks.ts'
import type { UsedAtomOptions } from './vite-options.ts'
import type {
  BuilderLike,
  BundleContext,
  BundleEntry,
  HotUpdateContext,
  HotUpdateOptions,
  RenderContext,
  RenderedChunk,
  ResolvedConfigLike,
  TransformContext,
  TransformResultLike,
} from './vite-types.ts'

import { type Assembled, shareAcrossBuilds } from './vite-builds.ts'
import { createCollectPlugin } from './vite-collect-plugin.ts'
import { usedConfig, usedEnvironmentConfig } from './vite-config-hooks.ts'
import { captureStylesheets } from './vite-css-capture.ts'
import { devServing, serveStylesheet } from './vite-dev.ts'
import { checkAtomicLayers, refeedChunkStylesheets, warnTextImports } from './vite-emit.ts'
import { emittedSet } from './vite-emitted.ts'
import { createExtendSource, type ExtendSource } from './vite-extend.ts'
import { dropLightningNaveWarning } from './vite-logger.ts'
import { assertOptions, resolveUsedOptions } from './vite-options.ts'
import { scanBundle } from './vite-scan.ts'
import { serverHooks } from './vite-server-hooks.ts'
import { createStylesheets } from './vite-stylesheets.ts'
import { configureUsed, createUsedContext, isUsed } from './vite-used.ts'

export interface NaveViteOptions extends UsedAtomOptions {
  /**
   * Consumer-defined atoms merged with Nave built-in atoms. Consumer atoms win on name collision.
   * These atoms resolve via @nave only. No global class. Not available in cx().
   *
   * A string is a path to a module instead, resolved against Vite's project root, whose default
   * export is the atom map. The module is loaded again whenever its bytes change and Vite watches
   * it, so editing it re-runs the stylesheets that use it with no restart. An atom object written
   * inline here is not a file Vite can watch.
   */
  extend?: Record<string, AtomDefinition> | string

  /**
   * Behaviour on a problem in a @nave directive: an unknown atom name, no atom named at all,
   * anything but a name between the names (a comma, a string), a {} block, or a place the
   * directive cannot expand. Under 'error', every such problem in one stylesheet is reported in
   * one error.
   * 'warn'  — log and skip
   * 'error' — fail the build (default)
   * 'ignore' — silently skip
   */
  onUnknown?: 'warn' | 'error' | 'ignore'
}

/**
 * The first plugin object. Its `name` is the public string `nave`, the prefix of every message it
 * prints.
 */
export interface NaveVitePlugin {
  readonly name: 'nave'
  config(config?: unknown, env?: { readonly command?: string }): UsedConfig | undefined
  configEnvironment(
    name: string,
    options: { readonly consumer?: string },
  ): { resolve: { noExternal: string[] } } | undefined
  configResolved(config: ResolvedConfigLike): void
  configureServer(server: unknown): void
  closeBundle(this: { readonly environment?: object }): void
  readonly buildApp: {
    handler(this: { warn(message: string): void }, builder: BuilderLike): Promise<void>
    readonly order: 'post'
  }
  transform(
    this: TransformContext,
    code: string,
    id: string,
  ): Promise<TransformResultLike | undefined>
  hotUpdate(
    this: HotUpdateContext,
    options: HotUpdateOptions,
  ): Promise<never[] | undefined> | never[] | undefined
  renderChunk(this: RenderContext, code: string, chunk: RenderedChunk): Promise<undefined>
  readonly generateBundle: {
    handler(this: BundleContext, options: unknown, bundle: Record<string, BundleEntry>): void
    readonly order: 'post'
  }
}

/**
 * What `navePlugin()` returns: the same two plugin objects whatever the options.
 */
export type NavePlugins = [NaveVitePlugin, NaveCollectPlugin]

/**
 * The pair of plugin halves for one build, which share a context of their own. `extend` is the
 * source of the atom map when it is one object for every build.
 */
function assemble(options: NaveViteOptions, extend: ExtendSource): Assembled {
  const context = createUsedContext(resolveUsedOptions(options), extend)
  const stylesheets = createStylesheets(extend, options.onUnknown ?? 'error')

  const nave: NaveVitePlugin = {
    name: 'nave',

    config: (_config, env) => usedConfig(context, env?.command),

    configEnvironment: (name, environmentOptions) =>
      usedEnvironmentConfig(context, name, environmentOptions),

    configResolved(config) {
      extend.configure?.(config.root)
      configureUsed(context, config)
      stylesheets.configure(config)
      if (context.command === 'build' && isUsed(context))
        captureStylesheets(context, config.plugins)
      if (config.css?.transformer === 'lightningcss') dropLightningNaveWarning(config.logger)
    },

    ...serverHooks(context),

    async transform(code, id) {
      const expanded = await stylesheets.transform(this, code, id)
      if (expanded !== undefined && expanded.code !== code) context.state.directiveExpanded = true
      if (context.command !== 'serve' || !isUsed(context)) return expanded
      const served = await serveStylesheet(context, this, { css: expanded?.code ?? code, id })
      return served ?? expanded
    },

    hotUpdate(hot) {
      const handled = stylesheets.hotUpdate(this, hot)
      if (handled || context.command !== 'serve' || !isUsed(context)) return handled
      return devServing.modulesWithGrown(context, this, hot)
    },

    async renderChunk(_code, chunk) {
      if (!isUsed(context) || this.environment.config.consumer !== 'client') return
      const emitted = emittedSet(context, this.environment, (message) => {
        this.warn(message)
      })
      await refeedChunkStylesheets(this, chunk, context.state, emitted)
      warnTextImports(this, chunk, context, emitted)
    },

    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        if (isUsed(context) && this.environment?.config.consumer === 'client') {
          checkAtomicLayers(
            this,
            bundle,
            emittedSet(context, this.environment, (message) => {
              this.warn(message)
            }),
          )
        }
        scanBundle(this, bundle)
      },
    },
  }
  return { nave, collect: createCollectPlugin(context) }
}

/**
 * The Nave Vite plugin: one entry in `plugins`.
 */
export function navePlugin(options: NaveViteOptions = {}): NavePlugins {
  const ownAtoms = typeof options.extend === 'object' ? options.extend : undefined
  // The names of atoms in a module are known once it has loaded; the other half judges those then.
  const own = typeof options.extend === 'string' ? undefined : new Set(Object.keys(ownAtoms ?? {}))
  assertOptions(options, own)
  // An atom map written inline is snapshotted and checked once; a module is loaded for each build,
  // from the root of that build.
  const inline = typeof options.extend === 'string' ? undefined : createExtendSource(options.extend)
  return shareAcrossBuilds(() => assemble(options, inline ?? createExtendSource(options.extend)))
}

/**
 * A host-loaded entry point also carries a default export, since hosts and every peer library
 * load it that way (`import nave from '@navecss/core/vite'`). `navePlugin` stays the documented,
 * named form.
 * @public
 */
export default navePlugin
