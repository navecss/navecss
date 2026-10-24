/**
 * Core's PostCSS plugin and the Nave plugin listed together, in either order: the build stops with
 * one message naming the core entry to remove, and builds again once it is gone.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { navePlugin } from '@navecss/core/postcss'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const FILES = { 'app/page.tsx': pageCalling("'flex'") }

interface Printed {
  readonly error: Error | undefined
  readonly errors: string[]
  readonly warnings: string[]
}

/**
 * One text per call: the arguments of the call joined.
 */
function linesOf(calls: readonly (readonly unknown[])[]): string[] {
  return calls.map((call) => call.map(String).join(' '))
}

/**
 * Runs the check and returns what it threw and what it printed.
 */
async function check(project: Project): Promise<Printed> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errors.mockClear()
  warnings.mockClear()
  let error: Error | undefined
  try {
    await checkBuild(hookMetadata(project), {}, {})
  } catch (error_) {
    error = error_ as Error
  }
  return { error, errors: linesOf(errors.mock.calls), warnings: linesOf(warnings.mock.calls) }
}

/**
 * Runs the plugin with core's plugin beside it (or alone) and writes the CSS the build would hold.
 */
async function build(
  project: Project,
  run: { readonly after?: 'core'; readonly before?: 'core' } = {},
): Promise<void> {
  const result = await runAtomic(project, [], {
    before: run.before === undefined ? [] : [navePlugin()],
    after: run.after === undefined ? [] : [navePlugin()],
  })
  writeBuildCss(project, result.css)
}

describe('AC-nextjs-used-atoms-26: both PostCSS entries listed stop the build, naming the core entry', () => {
  it.each([
    ['before', { before: 'core' as const }],
    ['after', { after: 'core' as const }],
  ])(
    "AC-nextjs-used-atoms-26: core's plugin listed %s the Nave plugin fails with one message naming the entry to remove",
    async (_order, run) => {
      const project = makeProject(FILES)
      await build(project, run)
      expect(recordOf(project).hasCorePlugin).toBe(true)

      const printed = await check(project)
      expect(printed.error).toBeInstanceOf(Error)
      expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
      expect(printed.error?.stack).toBe(printed.error?.message)
      expect(printed.errors).toHaveLength(1)
      const [message = ''] = printed.errors
      expect(message).toContain('@navecss/core/postcss')
      expect(message).toContain('Remove')
      expect(message).not.toContain(REPORT_CAUSE)
      expect(printed.warnings).toEqual([])
    },
  )

  it.each([
    ['before', { before: 'core' as const }],
    ['after', { after: 'core' as const }],
  ])(
    'AC-nextjs-used-atoms-26: with the core entry removed (it was listed %s) and the plugin run again, the check passes',
    async (_order, run) => {
      const project = makeProject(FILES)
      await build(project, run)
      const stopped = await check(project)

      await build(project)
      expect(recordOf(project).hasCorePlugin).toBe(false)
      const printed = await check(project)

      expect(stopped.error).toBeInstanceOf(Error)
      expect(printed).toEqual({ error: undefined, errors: [], warnings: [] })
    },
  )

  it('AC-nextjs-used-atoms-26: control, the Nave plugin alone passes', async () => {
    const project = makeProject(FILES)
    await build(project)
    const printed = await check(project)
    expect(printed).toEqual({ error: undefined, errors: [], warnings: [] })
  })
})
