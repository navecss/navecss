/**
 * Nave Vite plugin: expands `@nave` directives in every stylesheet Vite compiles, then fails
 * the build when one survives into its CSS output.
 *
 * Setup:
 *   import { navePlugin } from '@navecss/core/vite'
 *   export default { plugins: [navePlugin()] }               // Nave atoms only, fails on a problem
 *   navePlugin({ extend: myAtoms })                          // Nave + consumer atoms
 *   navePlugin({ extend: './my-atoms.mjs' })                 // the same, from a module Vite watches
 *   navePlugin({ onUnknown: 'warn' })                        // report a problem and skip it
 *
 * A plain Vite plugin object with no dependency and no peer. Its transform runs in Vite's normal
 * order, after Vite's own CSS step, so a stylesheet reached through `@import`, a Sass or Less
 * file, a CSS Module, and a Vue or Svelte style block are all read as the CSS they compile to.
 * It never runs before Vite's CSS step: that order misses `@import`-reached files and breaks
 * Sass `@mixin`. It adds nothing to the browser bundle.
 */
import type { AtomDefinition } from './atoms.ts'
import type {
  BundleContext,
  BundleEntry,
  HotUpdateContext,
  HotUpdateOptions,
  ResolvedConfigLike,
  TransformContext,
  TransformResultLike,
} from './vite-types.ts'

import { canHoldDirective, isStylesheetId } from './vite-css-id.ts'
import { createExtendSource } from './vite-extend.ts'
import { dropLightningNaveWarning } from './vite-logger.ts'
import { scanBundle } from './vite-scan.ts'
import { transformStylesheet } from './vite-transform.ts'

export interface NaveViteOptions {
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
 * The plugin object. Its `name` is the public string `nave`, the prefix of every message it
 * prints.
 */
export interface NaveVitePlugin {
  readonly name: 'nave'
  configResolved(config: ResolvedConfigLike): void
  transform(
    this: TransformContext,
    code: string,
    id: string,
  ): Promise<TransformResultLike | undefined>
  hotUpdate(this: HotUpdateContext, options: HotUpdateOptions): never[] | undefined
  readonly generateBundle: {
    handler(this: BundleContext, options: unknown, bundle: Record<string, BundleEntry>): void
    readonly order: 'post'
  }
}

/**
 * Whether Vite supplies a real source map for stylesheets in this run (see `TransformInput`).
 */
function hasStylesheetMapsFor(config: ResolvedConfigLike): boolean {
  return config.command === 'serve'
    ? config.css?.devSourcemap === true
    : Boolean(config.build?.sourcemap)
}

/**
 * `file` with Vite's forward slashes, which is how it names every path it reports.
 */
function withForwardSlashes(file: string): string {
  return file.replaceAll('\\', '/')
}

/**
 * The Nave Vite plugin: one entry in `plugins`.
 */
export function navePlugin(options: NaveViteOptions = {}): NaveVitePlugin {
  const { onUnknown = 'error' } = options
  const extend = createExtendSource(options.extend)
  let hasStylesheetMaps = false
  // The stylesheets whose transform failed because the `extend` module would not load, by
  // environment. Vite links a stylesheet to a file only from a transform that finished, so a
  // stylesheet that failed never hears the module change, whether or not another stylesheet
  // already uses it.
  const failed = new Map<string, Set<string>>()

  return {
    name: 'nave',

    configResolved(config) {
      extend.configure?.(config.root)
      hasStylesheetMaps = hasStylesheetMapsFor(config)
      if (config.css?.transformer === 'lightningcss') dropLightningNaveWarning(config.logger)
    },

    async transform(code, id) {
      if (!isStylesheetId(id) || !canHoldDirective(code)) return
      const environment = this.environment?.name ?? 'client'
      let atoms
      try {
        atoms = await extend.current((file) => {
          this.addWatchFile(file)
        })
      } catch (error) {
        const ids = failed.get(environment) ?? new Set<string>()
        failed.set(environment, ids.add(id))
        throw error
      }
      failed.get(environment)?.delete(id)
      return transformStylesheet({
        ctx: this,
        code,
        id,
        extend: atoms,
        onUnknown,
        hasStylesheetMaps,
      })
    },

    hotUpdate(hot) {
      const ids = failed.get(this.environment.name)
      const file = extend.file?.()
      if (!ids || file === undefined || ids.size === 0) return
      if (hot.file !== withForwardSlashes(file)) return
      const { moduleGraph } = this.environment
      for (const id of ids) {
        const module = moduleGraph.getModuleById(id)
        if (module) moduleGraph.invalidateModule(module as never)
      }
      ids.clear()
      this.environment.hot.send({ type: 'full-reload' })
      return []
    },

    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        scanBundle(this, bundle)
      },
    },
  }
}

/**
 * A host-loaded entry point also carries a default export, since hosts and every peer library
 * load it that way (`import nave from '@navecss/core/vite'`). `navePlugin` stays the documented,
 * named form.
 * @public
 */
export default navePlugin
