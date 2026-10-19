/**
 * Expanding `@nave` in a stylesheet with core's own PostCSS plugin, and keeping the problems it
 * finds instead of throwing them: a throw on Turbopack is cached with no file dependencies, so
 * the next build would fail with the stale report after the fix.
 */
import { navePlugin } from '@navecss/core/postcss'
import postcss from 'postcss'

import type { ExtendMap } from './extend.ts'
import type { NaveOptions } from './options.ts'

interface DirectiveFinding {
  readonly text: string
  readonly line: number
  readonly column: number
}

export interface Expansion {
  /**
   * Whether the stylesheet holds a `@nave` directive.
   */
  readonly hasDirective: boolean
  readonly findings: readonly DirectiveFinding[]
}

/**
 * Whether the root holds a `@nave` at-rule, matched as core matches the name.
 */
export function hasNaveDirective(root: postcss.Root): boolean {
  let isFound = false
  root.walkAtRules(/^nave$/i, () => {
    isFound = true
    return false
  })
  return isFound
}

/**
 * Core's PostCSS plugin for one stylesheet, with the consumer's own atoms `extend`, already read.
 * Making it validates the map, so a stylesheet makes one and uses it for the expansion too.
 * Under `'ignore'` a problem is skipped; otherwise it is a warning, which the expansion returns.
 * Core prints a warning instead under Turbopack unless told not to, and then this package would
 * see no problem and core would print its own line beside this package's report.
 */
export function corePluginFor(
  extend: ExtendMap | undefined,
  onUnknown: NaveOptions['onUnknown'],
): postcss.Plugin {
  return navePlugin({
    ...(extend !== undefined && { extend }),
    onUnknown: onUnknown === 'ignore' ? 'ignore' : 'warn',
    printWarnings: false,
  })
}

/**
 * Expands the `@nave` directives of `root` with `plugin`, made by `corePluginFor()`. A problem is
 * returned as a finding, for the caller to record (`'error'`) or print (`'warn'`).
 */
export async function expandDirectives(
  root: postcss.Root,
  input: { readonly from: string | undefined; readonly plugin: postcss.Plugin | undefined },
): Promise<Expansion> {
  const hasDirective = hasNaveDirective(root)
  const { from, plugin } = input
  if (!hasDirective || plugin === undefined) return { hasDirective, findings: [] }
  const expanded = await postcss([plugin]).process(root, { from })
  const findings = expanded.warnings().map((warning) => {
    const start = warning.node.source?.start
    return {
      text: warning.text,
      line: start?.line ?? warning.line,
      column: start?.column ?? warning.column,
    }
  })
  return { hasDirective, findings }
}
