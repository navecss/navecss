/**
 * Next.js sets `TURBOPACK` in the process that runs PostCSS on its default bundler, and there
 * core's PostCSS plugin prints a `'warn'`-mode `@nave` problem itself, in place of the PostCSS
 * warning, unless it is told not to. A stylesheet's `@nave` problems reach this package only as
 * those warnings, so it tells core not to print: under Turbopack each problem is still a finding,
 * and core prints no line of its own beside this package's report.
 */
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { corePluginFor, expandDirectives } from '../src/directive.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('a @nave problem under Turbopack', () => {
  it.each(['warn', 'error'] as const)(
    'with onUnknown %s is a finding, and core prints nothing',
    async (onUnknown) => {
      vi.stubEnv('TURBOPACK', '1')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const from = '/proj/app/g.css'
      const root = postcss.parse('.c {\n  @nave interactve;\n}\n', { from })

      const expansion = await expandDirectives(root, {
        from,
        plugin: corePluginFor(undefined, onUnknown),
      })

      expect(expansion.findings.map(({ line, column }) => [line, column])).toEqual([[2, 3]])
      expect(expansion.findings[0]?.text).toMatch(/unknown atom "interactve"/)
      expect(warn).not.toHaveBeenCalled()
    },
  )
})
