/**
 * Nave PostCSS plugin — resolves @nave directives.
 *
 * Inlines atomic utility declarations at build time.
 * Pseudo rules, @media and @container blocks are emitted as native CSS
 * nesting inside the parent rule (`&:focus-visible { … }`), never hoisted
 * out as sibling rules. Browser floor: Baseline 2024.
 * See https://github.com/navecss/navecss/blob/main/docs/04-adr/0001-native-css-nesting.md
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
import type { Plugin, AtRule as PostCSSAtRule, Result } from 'postcss'

import postcss from 'postcss'

import { type AtomDefinition, atoms } from './atoms.ts'
import { buildNested, DIRECTIVE, isFollowingNestedNode } from './postcss-nested-builders.ts'
import { isInsideKeyframes, stampSource } from './postcss-node-utils.ts'

export interface NavePluginOptions {
  /**
   * Consumer-defined atoms merged with Nave built-in atoms.
   * Consumer atoms win on name collision — your system owns its vocabulary.
   * These atoms resolve via @nave only. No global class. Not available in cx().
   */
  extend?: Record<string, AtomDefinition>

  /**
   * Behaviour on an unknown atom name, or a @nave directive that names no
   * atom at all.
   * 'warn'  — log and skip
   * 'error' — throw, failing the build (default)
   * 'ignore' — silently skip
   */
  onUnknown?: 'warn' | 'error' | 'ignore'
}

interface UnknownAtomContext {
  atRule: PostCSSAtRule
  onUnknown: NavePluginOptions['onUnknown']
  result: Result
}

/**
 * Reports a directive problem per `onUnknown`, defaulting to a THROW: an
 * unrecognised `onUnknown` value must not select the most permissive mode on
 * the one option whose purpose is to make a mistake fail loudly.
 */
function reportUnknown(msg: string, ctx: UnknownAtomContext): void {
  const { atRule, onUnknown, result } = ctx
  if (onUnknown === 'warn') {
    atRule.warn(result, msg)
    return
  }
  if (onUnknown === 'ignore') return
  throw atRule.error(msg)
}

/**
 * Warns or throws for any atom name not in `validAtomNames`, and for a
 * directive naming no atom at all (a bare `@nave`), per `onUnknown`.
 */
function checkUnknownAtoms(
  names: string[],
  validAtomNames: Set<string>,
  ctx: UnknownAtomContext,
): void {
  if (names.length === 0) {
    reportUnknown('@nave: directive names no atom', ctx)
    return
  }
  for (const name of names) {
    if (validAtomNames.has(name)) continue
    reportUnknown(
      `@nave: unknown atom "${name}". Available: ${[...validAtomNames].join(', ')}`,
      ctx,
    )
  }
}

/**
 * Inserts an atom's declarations at the directive's authored position: bare
 * when nothing precedes them that requires nesting, or wrapped in a single
 * `& { … }` (same trick buildInnerRules uses for at-rule inner blocks) when
 * `isFollowingNested` is true.
 */
function insertDeclarations(
  atRule: PostCSSAtRule,
  declNodes: ReturnType<typeof postcss.decl>[],
  isFollowingNested: boolean,
): void {
  if (declNodes.length === 0) return
  if (!isFollowingNested) {
    for (const decl of declNodes) atRule.before(decl)
    return
  }
  const wrapper = postcss.rule({ selector: '&' })
  if (atRule.source) wrapper.source = atRule.source
  for (const decl of declNodes) wrapper.append(decl)
  atRule.before(wrapper)
}

// ── Plugin factory ────────────────────────────────────────────────────────────

export const navePlugin = (options: NavePluginOptions = {}): Plugin => {
  const { onUnknown = 'error', extend = {} } = options
  const allAtoms: Record<string, AtomDefinition> = { ...atoms, ...extend }
  // A key carrying no definition is not a valid atom name: `Object.keys` alone
  // would admit it, the unknown check would pass it, and `if (!atom) return []`
  // below would then swallow it into a rule with no declarations. A truthiness
  // filter rather than a check against `undefined` alone, because JSON cannot
  // express `undefined`: a JSON-authored atom map spells a missing definition
  // `null`, and that is the spelling a config file can actually produce.
  const validAtomNames = new Set(
    Object.entries(allAtoms)
      .filter(([, definition]) => definition)
      .map(([name]) => name),
  )

  return {
    postcssPlugin: 'postcss-nave',

    AtRule(atRule: PostCSSAtRule, { result }) {
      if (atRule.name !== DIRECTIVE) return

      const ctx: UnknownAtomContext = { atRule, onUnknown, result }

      // @nave must be the direct child of a rule; bare inside @media/
      // @container it used to silently drop the block. Routed through
      // onUnknown like an unknown atom name, so the default now fails.
      const parent = atRule.parent
      if (parent?.type !== 'rule') {
        reportUnknown('@nave must be the direct child of a CSS rule selector block', ctx)
        atRule.remove()
        return
      }

      const rule = parent

      // A keyframe step parses as a Rule, so the check above misses @nave
      // inside @keyframes; `&` is meaningless there. Same onUnknown routing.
      if (isInsideKeyframes(rule)) {
        reportUnknown('@nave cannot be used inside @keyframes', ctx)
        atRule.remove()
        return
      }

      const names = atRule.params.trim().split(/\s+/).filter(Boolean)

      checkUnknownAtoms(names, validAtomNames, ctx)

      // Declarations land at the directive's authored position (bare, or
      // wrapped in `&` when the directive follows a nested node, see
      // isFollowingNestedNode); nested rules are appended to the end of the
      // parent rule, in the order the directives were written. Both hold
      // across multiple @nave directives in one rule, which sibling hoisting
      // could not do.
      const declNodes: ReturnType<typeof postcss.decl>[] = []
      const nested = names.flatMap((name) => {
        // Object.hasOwn, not bracket access: under onUnknown !== 'error' a
        // prototype-chain name ("toString") would otherwise resolve the
        // inherited member and crash below instead of being skipped.
        const atom = Object.hasOwn(allAtoms, name) ? allAtoms[name] : undefined
        if (!atom) return []
        if (
          typeof atom.declarations !== 'object' ||
          atom.declarations === null ||
          Array.isArray(atom.declarations)
        ) {
          throw atRule.error(`@nave: atom "${name}" is registered without a declarations object`)
        }
        for (const [prop, value] of Object.entries(atom.declarations)) {
          const decl = postcss.decl({ prop, value })
          if (atRule.source) decl.source = atRule.source
          declNodes.push(decl)
        }
        return buildNested(atom)
      })

      insertDeclarations(atRule, declNodes, isFollowingNestedNode(rule, atRule))

      atRule.remove()

      for (const node of nested) {
        stampSource(node, atRule.source)
        rule.append(node)
      }
    },
  }
}

navePlugin.postcss = true

export { type AtomDefinition } from './atoms.ts'
