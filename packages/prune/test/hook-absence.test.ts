/**
 * When the wrapper is there and the plugin never ran, the build holds the full atom layer and no
 * record says otherwise: the check stops the build and names the PostCSS entry to add, unless the
 * output holds no built-in atom rule at all.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import {
  coreOutput,
  inProject,
  makeProject,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { ATOMIC_CSS } from './helpers/project.ts'

registerIsolation()

const ENTRY = "'@navecss/prune/postcss': {}"
const ATOMIC_FILE = 'node_modules/@navecss/core/dist/atomic.css'
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
async function check(project: Project, options: NaveOptions = {}): Promise<Printed> {
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
 * Expects one message that names the entry to add, no problem report, and the one-line throw.
 */
function expectPluginMissing(printed: Printed): void {
  expect(printed.error).toBeInstanceOf(Error)
  expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
  expect(printed.error?.stack).toBe(printed.error?.message)
  expect(printed.errors).toHaveLength(1)
  const [message = ''] = printed.errors
  expect(message).toContain(ENTRY)
  expect(message).toContain('withNave()')
  expect(message).toContain('@navecss/core/postcss')
  expect(message).not.toContain(REPORT_CAUSE)
}

/**
 * The atom layer as core's own plugin leaves it, whole: what the build holds when the Nave plugin
 * did not run.
 */
function wholeLayer(project: Project): Promise<string> {
  return coreOutput(ATOMIC_CSS, inProject(project, ATOMIC_FILE))
}

describe('AC-nextjs-used-atoms-25: the wrapper with no plugin stops the build and names the PostCSS entry', () => {
  it("AC-nextjs-used-atoms-25: W1, core's plugin in place of the package's, fails with one message naming the entry", async () => {
    const project = makeProject(FILES)
    writeBuildCss(project, await wholeLayer(project))
    const printed = await check(project)
    expect(printed.warnings).toEqual([])
    expectPluginMissing(printed)
  })

  it('AC-nextjs-used-atoms-25: W2, no Nave entry in the PostCSS config, fails the same way and leaves no record', async () => {
    const project = makeProject({
      ...FILES,
      'postcss.config.mjs': 'export default { plugins: {} }\n',
    })
    writeBuildCss(project, ATOMIC_CSS)
    const printed = await check(project)
    expect(existsSync(path.join(project.dir, '.next/cache'))).toBe(false)
    expectPluginMissing(printed)
    expect(printed.warnings).toEqual([])
  })

  it('AC-nextjs-used-atoms-25: W3, no Nave stylesheet in the output, passes and prints nothing', async () => {
    const project = makeProject(FILES)
    writeBuildCss(project, 'body {\n  margin: 0;\n}\n')
    const printed = await check(project)
    expect(printed).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-25: control, the same project with the whole layer in its output fails', async () => {
    const project = makeProject(FILES)
    writeBuildCss(project, 'body {\n  margin: 0;\n}\n')
    const before = await check(project)
    writeBuildCss(project, await wholeLayer(project))
    const after = await check(project)
    expect(before.error).toBeUndefined()
    expect(after.error).toBeInstanceOf(Error)
  })

  it('AC-nextjs-used-atoms-25: an output with no static directory passes and prints nothing', async () => {
    const project = makeProject(FILES)
    const printed = await check(project)
    expect(printed).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-25: the layer order statement alone, with no atom rule, passes', async () => {
    const project = makeProject(FILES)
    writeBuildCss(project, '@layer tokens, reset, atomic, components, overrides;\n')
    const printed = await check(project)
    expect(printed).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-25: an atomic layer holding only rules that are not built-in atoms passes', async () => {
    const project = makeProject(FILES)
    writeBuildCss(project, '@layer atomic {\n  .brand-x {\n    color: red;\n  }\n}\n')
    const printed = await check(project)
    expect(printed).toEqual({ error: undefined, errors: [], warnings: [] })
  })
})

describe('AC-nextjs-used-atoms-06: after the stale-cache message, the deleted cache leaves the no-plugin message', () => {
  it.each([
    [
      'the entry swapped for the core one',
      "export default { plugins: { '@navecss/core/postcss': {} } }\n",
    ],
    ['the entry removed', 'export default { plugins: {} }\n'],
  ])(
    'AC-nextjs-used-atoms-06: %s names postcss.config.mjs, then the entry once .next/cache is gone',
    async (_name, config) => {
      const project = makeProject(FILES)
      await runAtomic(project)
      writeFileSync(path.join(project.dir, 'postcss.config.mjs'), config)
      writeBuildCss(project, await wholeLayer(project))

      const stale = await check(project)
      expect(stale.error).toBeInstanceOf(Error)
      expect(stale.errors).toHaveLength(1)
      expect(stale.errors[0]).toContain('postcss.config.mjs')
      expect(stale.errors[0]).toContain('.next/cache')

      rmSync(path.join(project.dir, '.next/cache'), { recursive: true, force: true })
      expectPluginMissing(await check(project))
    },
  )
})
