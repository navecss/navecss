/**
 * Expanding `@nave` in a stylesheet with core's own PostCSS plugin, and keeping the problems it
 * finds instead of throwing them: a throw on Turbopack is cached with no file dependencies, so
 * the next build would fail with the stale report after the fix.
 */
import { navePlugin } from '@navecss/core/postcss'
import path from 'node:path'
import postcss from 'postcss'

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
function hasNaveDirective(root: postcss.Root): boolean {
  let isFound = false
  root.walkAtRules(/^nave$/i, () => {
    isFound = true
    return false
  })
  return isFound
}

/**
 * A path-valued `extend` read against the project directory, not the process's.
 */
function extendFor(options: NaveOptions, dir: string): NaveOptions['extend'] {
  const { extend } = options
  return typeof extend === 'string' ? path.resolve(dir, extend) : extend
}

/**
 * Expands the `@nave` directives of `root`. Under `'ignore'` a problem is skipped; otherwise it
 * is returned as a finding, for the caller to record (`'error'`) or print (`'warn'`).
 */
export async function expandDirectives(
  root: postcss.Root,
  input: { readonly dir: string; readonly from: string | undefined; readonly options: NaveOptions },
): Promise<Expansion> {
  const hasDirective = hasNaveDirective(root)
  if (!hasDirective) return { hasDirective, findings: [] }
  const { options, dir, from } = input
  const extend = extendFor(options, dir)
  const plugin = navePlugin({
    ...(extend !== undefined && { extend }),
    onUnknown: options.onUnknown === 'ignore' ? 'ignore' : 'warn',
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
