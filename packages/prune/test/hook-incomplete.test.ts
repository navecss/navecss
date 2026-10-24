/**
 * A record that says the plugin stopped before it finished is incomplete: the check stops the
 * build with one message naming each failure and the cache directory to delete.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { describe, expect, it, vi } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const BROKEN: NaveOptions = { extend: './nope.mjs' }
const FILES = { 'app/page.tsx': pageCalling("'flex'") }
const SHEET = { css: '.card {\n  @nave flex;\n}\n', file: 'app/globals.css' }

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
async function check(project: Project, options: NaveOptions): Promise<Printed> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errors.mockClear()
  warnings.mockClear()
  let error: Error | undefined
  try {
    await checkBuild(hookMetadata(project), options, {})
  } catch (error_) {
    error = error_ as Error
  }
  return { error, errors: linesOf(errors.mock.calls), warnings: linesOf(warnings.mock.calls) }
}

/**
 * Runs the plugin over `sheets` and writes the CSS of the last one as the build's output. The
 * plugin prints what it stops on; the test does not read it.
 */
async function built(
  project: Project,
  sheets: (typeof SHEET)[],
  options: NaveOptions,
): Promise<void> {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const results = await runSheets(project, [...sheets, ATOMIC_SHEET], { options })
  writeBuildCss(project, results.at(-1)!.css)
}

describe('AC-nextjs-used-atoms-06: a record holding a failure stops the build', () => {
  it('AC-nextjs-used-atoms-06: control, the same project with working options passes', async () => {
    const project = makeProject(FILES)
    await built(project, [], {})
    expect(recordOf(project).failures).toEqual([])
    expect(await check(project, {})).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-06: a run that stopped before trimming fails with one message naming the failure and .next/cache', async () => {
    const project = makeProject(FILES)
    await built(project, [], BROKEN)
    const failures = [...new Set(recordOf(project).failures)]
    expect(failures.length).toBeGreaterThan(0)

    const printed = await check(project, BROKEN)
    expect(printed.error).toBeInstanceOf(Error)
    expect(printed.error?.message).toMatch(
      /^Nave stopped the build: \d+ problems?, listed above\.$/u,
    )
    expect(printed.error?.stack).toBe(printed.error?.message)
    expect(printed.errors).toHaveLength(1)
    const [message = ''] = printed.errors
    for (const failure of failures) expect(message).toContain(failure)
    expect(message).toContain('.next/cache')
    expect(message).not.toContain(REPORT_CAUSE)
    expect(printed.warnings).toEqual([])
  })

  it('AC-nextjs-used-atoms-06: a stylesheet that stopped too adds its failure to the same message', async () => {
    const project = makeProject(FILES)
    await built(project, [SHEET], BROKEN)
    const failures = [...new Set(recordOf(project).failures)]
    expect(failures.length).toBeGreaterThan(1)

    const printed = await check(project, BROKEN)
    expect(printed.error).toBeInstanceOf(Error)
    expect(printed.error?.message).toMatch(
      /^Nave stopped the build: \d+ problems?, listed above\.$/u,
    )
    expect(printed.errors).toHaveLength(1)
    const [message = ''] = printed.errors
    for (const failure of failures) expect(message).toContain(failure)
    expect(message).toContain('.next/cache')
  })

  it("AC-nextjs-used-atoms-06: a failure from a stylesheet's own record alone is one problem", async () => {
    const project = makeProject(FILES)
    await built(project, [], {})
    expect(recordOf(project).failures).toEqual([])
    // The stylesheet is not a file on disk, so its record counts.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await runSheets(project, [SHEET], { options: BROKEN })
    const { failures } = recordOf(project)
    expect(failures).toHaveLength(1)

    const printed = await check(project, {})
    expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
    expect(printed.errors).toHaveLength(1)
    expect(printed.errors[0]).toContain(failures[0])
    expect(printed.errors[0]).toContain('.next/cache')
  })
})
