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
 * Expands the `@nave` directives of `root` with the consumer's own atoms `extend`, already read.
 * Under `'ignore'` a problem is skipped; otherwise it is returned as a finding, for the caller to
 * record (`'error'`) or print (`'warn'`).
 */
export async function expandDirectives(
  root: postcss.Root,
  input: {
    readonly extend: ExtendMap | undefined
    readonly from: string | undefined
    readonly onUnknown: NaveOptions['onUnknown']
  },
): Promise<Expansion> {
  const hasDirective = hasNaveDirective(root)
  if (!hasDirective) return { hasDirective, findings: [] }
  const { extend, from, onUnknown } = input
  const plugin = navePlugin({
    ...(extend !== undefined && { extend }),
    onUnknown: onUnknown === 'ignore' ? 'ignore' : 'warn',
  })
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
