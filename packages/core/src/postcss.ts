/**
 * Nave PostCSS plugin — resolves @nave directives.
 *
 * A thin adapter over the host-free directive core (`src/directive/`):
 * `plan()` decides what a directive expands to and where it goes, this
 * file only wires the PostCSS plugin lifecycle to `handleAtRule()`
 * (`postcss-at-rule.ts`), which walks the AST to answer `plan()`'s three
 * facts and splices its result back in as PostCSS nodes. Setup, options and
 * observable behaviour are unchanged except where the slice-1 changeset
 * says so (R5).
 *
 * Setup:
 *   import { navePlugin } from '@navecss/core/postcss'
 *   navePlugin()                         // Nave atoms only, fails build on unknown atom
 *   navePlugin({ extend: myAtoms })      // Nave + consumer atoms
 *   navePlugin({ onUnknown: 'warn' })    // Log and skip instead of failing the build
 *
 * Consumer atoms:
 *   import type { AtomDefinition } from '@navecss/core/postcss'
 *   import { media } from '@navecss/tokens/breakpoints'
 *
 *   const myAtoms: Record<string, AtomDefinition> = {
 *     primaryButton: {
 *       declarations: {
 *         background:      'var(--nave-color-action-primary)',
 *         color:           'var(--nave-color-on-action-primary)',
 *         padding:         'var(--nave-spacing-control-md) var(--nave-spacing-control-lg)',
 *         'border-radius': 'var(--nave-radius-control)',
 *       },
 *       pseudos: {
 *         ':hover': { background: 'var(--nave-color-action-primary-hover)' },
 *       },
 *       media: {
 *         [media.phoneOnly]: {
 *           declarations: { width: '100%' },
 *         },
 *       },
 *     },
 *   }
 */
import type { Plugin, AtRule as PostCSSAtRule } from 'postcss'

import type { AtomDefinition } from './atoms.ts'
import type { ExtendMap } from './directive/resolve.ts'
import type { FoldEntry } from './postcss-fold.ts'

import { handleAtRule } from './postcss-at-rule.ts'
import { applyExtendModule, resolveExtendSpecifier } from './postcss-extend-module.ts'
import { foldMessage } from './postcss-fold.ts'

export interface NavePluginOptions {
  /**
   * Consumer-defined atoms merged with Nave built-in atoms.
   * Consumer atoms win on name collision — your system owns its vocabulary.
   * These atoms resolve via @nave only. No global class. Not available in cx().
   *
   * A string is a module specifier instead: resolved against `process.cwd()`
   * at construction (an unresolvable specifier throws right there, naming
   * the specifier and the directory), then loaded for its default export on
   * every run and re-read whenever the file's mtime or size changes. Pass a
   * specifier when your host's build cache needs to see it as a dependency
   * (R15) — an inline object is invisible to a cached host's own cache key.
   * The specifier form makes the plugin async: use `process(css).then(cb)`,
   * not the sync `.css` getter.
   */
  extend?: Record<string, AtomDefinition> | string

  /**
   * Behaviour on an unknown atom name, or a @nave directive that names no
   * atom at all.
   * 'warn'  — log and skip
   * 'error' — throw, failing the build (default)
   * 'ignore' — silently skip
   */
  onUnknown?: 'warn' | 'error' | 'ignore'
}

export const navePlugin = (options: NavePluginOptions = {}): Plugin => {
  const { onUnknown = 'error', extend: extendOption } = options
  // R15: a string `extend` resolves to an absolute path at construction, so
  // an unresolvable specifier fails when the host's config loads rather than
  // on the first stylesheet (round-3 decision 11).
  const extendFile =
    typeof extendOption === 'string' ? resolveExtendSpecifier(extendOption) : undefined
  const staticExtend: ExtendMap = typeof extendOption === 'object' ? extendOption : {}
  const loadCache = new Map<string, Promise<ExtendMap>>()

  return {
    postcssPlugin: 'postcss-nave',

    // Per-run state lives here, not in the factory closure above: PostCSS
    // calls `prepare(result)` once per `Result`, so two stylesheets sharing
    // one `navePlugin()` instance never share a `fold` or a resolved
    // `extend`, however their async hooks interleave (R6 concurrency defect,
    // found while implementing this R15 seam).
    prepare(result) {
      const fold: FoldEntry[] = []
      let extend: ExtendMap = staticExtend

      return {
        Once() {
          fold.length = 0
          if (extendFile === undefined) return
          // Pushed before the load, unconditionally, so a host's dependency
          // graph sees the module whether or not this stylesheet errors.
          result.messages.push({
            type: 'dependency',
            plugin: 'postcss-nave',
            file: extendFile,
            parent: result.opts.from,
          })
          return applyExtendModule(extendFile, loadCache, (value) => {
            extend = value
          })
        },

        AtRule(atRule: PostCSSAtRule) {
          handleAtRule(atRule, { onUnknown, result, extend, fold })
        },

        OnceExit() {
          if (fold.length === 0) return
          const first = fold[0]!
          throw first.atRule.error(
            foldMessage(fold),
            first.index === undefined ? {} : { index: first.index },
          )
        },
      }
    },
  }
}

navePlugin.postcss = true

/**
 * R22: a host-loaded entry point also carries a default export, since
 * hosts and every peer library load it that way (`import nave from
 * '@navecss/core/postcss'`). `navePlugin` stays the documented, named form.
 * @public
 */
export default navePlugin

export { type AtomDefinition } from './atoms.ts'
