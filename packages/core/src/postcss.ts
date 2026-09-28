/**
 * Nave PostCSS plugin — resolves @nave directives.
 *
 * A thin adapter over the host-free directive core (`src/directive/`):
 * `plan()` decides what a directive expands to and where it goes, this
 * file only wires the PostCSS plugin lifecycle to `handleAtRule()`
 * (`postcss-at-rule.ts`), which walks the AST to answer `plan()`'s three
 * facts and splices its result back in as PostCSS nodes. Setup, options and
 * observable behaviour are unchanged except where this package's CHANGELOG
 * says so.
 *
 * Setup:
 *   import { navePlugin } from '@navecss/core/postcss'
 *   navePlugin()                         // Nave atoms only, fails build on unknown atom
 *   navePlugin({ extend: myAtoms })      // Nave + consumer atoms
 *   navePlugin({ onUnknown: 'warn' })    // Log and skip instead of failing the build
 *
 * `extend` is trusted, consumer-authored code, run at build time in the same file that could
 * already run arbitrary JavaScript — it is not sanitised input. `validateExtendAtoms` still
 * parses every declaration, pseudo selector key, and media/container condition an atom carries,
 * and rejects any that does not parse as exactly that one construct, since a typo there is
 * otherwise silent CSS injection into the generated output rather than a build error at the
 * point of the mistake.
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
import { foldMessage, sortFoldBySourceOrder } from './postcss-fold.ts'
import { validateExtendAtoms } from './validate-extend-atoms.ts'

export interface NavePluginOptions {
  /**
   * Consumer-defined atoms merged with Nave built-in atoms.
   * Consumer atoms win on name collision — your system owns its vocabulary.
   * These atoms resolve via @nave only. No global class. Not available in cx().
   *
   * A string is a path to a module instead, resolved against `process.cwd()`
   * at construction (a path that names no file throws right there, naming
   * the path and the directory; a package name is not looked up), then
   * loaded for its default export on every run and re-read whenever the
   * file's own bytes change (the modules it imports are not). Pass a
   * path when your host's build cache needs to see it as a dependency: an
   * inline object is invisible to a cached host's own cache key. A path
   * makes the plugin async: use `process(css).then(cb)`, not the sync `.css`
   * getter.
   */
  extend?: Record<string, AtomDefinition> | string

  /**
   * Behaviour on a problem in a @nave directive: an unknown atom name, no
   * atom named at all, anything but a name between the names (a comma, a
   * string), a {} block, or a place the directive cannot expand. Under
   * 'error', every such problem in one stylesheet is reported in one error.
   * 'warn'  — log and skip
   * 'error' — throw, failing the build (default)
   * 'ignore' — silently skip
   */
  onUnknown?: 'warn' | 'error' | 'ignore'
}

/**
 * A frozen-in-time copy of `map`'s own enumerable string-keyed entries:
 * validation and lookup both read only this, never the caller's own object,
 * so a key added, hidden (non-enumerable) or answered only through a Proxy
 * trap after this snapshot is taken can never reach a directive's output —
 * `Object.entries` is what a live `Object.hasOwn`/`[name]` lookup on the
 * original object would not have refused the same way.
 */
function snapshotExtendMap(map: ExtendMap): ExtendMap {
  return Object.fromEntries(Object.entries(map))
}

export const navePlugin = (options: NavePluginOptions = {}): Plugin => {
  const { onUnknown = 'error', extend: extendOption } = options
  // A string `extend` resolves to an absolute path at construction, so
  // an unresolvable specifier fails when the host's config loads rather than
  // on the first stylesheet.
  const extendFile =
    typeof extendOption === 'string' ? resolveExtendSpecifier(extendOption) : undefined
  const staticExtend: ExtendMap =
    typeof extendOption === 'object' ? snapshotExtendMap(extendOption) : {}
  // The object form is trusted, consumer-authored code that can splice raw
  // strings into generated CSS: validate it once, at construction, same as
  // before this option grew a second (module-specifier) shape. The
  // specifier form has nothing to validate yet at this point — it is
  // validated after every load, below, since a dev server can hand it a
  // different object on every rebuild.
  validateExtendAtoms(staticExtend)
  const loadCache = new Map<string, Promise<ExtendMap>>()

  return {
    postcssPlugin: 'postcss-nave',

    // Per-run state lives here, not in the factory closure above: PostCSS
    // calls `prepare(result)` once per `Result`, so two stylesheets sharing
    // one `navePlugin()` instance never share a `fold` or a resolved
    // `extend`, however their async hooks interleave (otherwise one
    // stylesheet's problems, or its loaded `extend`, could leak into another's).
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
            // Snapshotted and validated after every load, not once at
            // construction: a specifier's default export can change on
            // every rebuild, and each one is trusted, consumer-authored
            // code the same way the object form is. Runs before `extend`
            // is assigned, so a bad edit fails this run rather than
            // splicing into generated CSS first, and only the snapshot —
            // never the loaded module's own object — is kept for lookups.
            const snapshot = snapshotExtendMap(value)
            validateExtendAtoms(snapshot)
            extend = snapshot
          })
        },

        AtRule(atRule: PostCSSAtRule) {
          handleAtRule(atRule, { onUnknown, result, extend, fold })
        },

        OnceExit() {
          if (fold.length === 0) return
          const ordered = sortFoldBySourceOrder(fold)
          const first = ordered[0]!
          throw first.atRule.error(
            foldMessage(ordered),
            first.index === undefined ? {} : { index: first.index },
          )
        },
      }
    },
  }
}

navePlugin.postcss = true

/**
 * A host-loaded entry point also carries a default export, since
 * hosts and every peer library load it that way (`import nave from
 * '@navecss/core/postcss'`). `navePlugin` stays the documented, named form.
 * @public
 */
export default navePlugin

export { type AtomDefinition } from './atoms.ts'
