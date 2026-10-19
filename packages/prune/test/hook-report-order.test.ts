import { REPORT_CAUSE } from '@navecss/core/collect'
import { navePlugin } from '@navecss/core/postcss'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { HookConfig } from '../src/hook.ts'
import type { PipelineOptions } from './helpers/plugin-run.ts'
import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import {
  makeProject,
  PAGE_WITH_PROP,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

/**
 * What the promise rejects with, or `undefined` when it resolves.
 */
async function failureOf(task: Promise<void>): Promise<unknown> {
  try {
    await task
  } catch (error) {
    return error
  }
}

interface Printed {
  readonly level: 'error' | 'warn'
  readonly text: string
}

interface Outcome {
  /**
   * Everything the check printed, in the order it was printed.
   */
  readonly printed: Printed[]
  readonly thrown: unknown
}

interface Setup {
  readonly pipeline?: PipelineOptions
  readonly config?: HookConfig
  /**
   * Runs after the plugin and the build's CSS, before the check.
   */
  readonly afterBuild?: (project: Project) => void
}

/**
 * Runs the plugin for a build, writes the layer as the build's CSS, and runs the check, recording
 * what it prints through `console.error` and `console.warn` in order.
 */
async function buildAndCheck(project: Project, setup: Setup = {}): Promise<Outcome> {
  const printed: Printed[] = []
  const collect =
    (level: Printed['level']) =>
    (...args: unknown[]): void => {
      printed.push({ level, text: args.map(String).join(' ') })
    }
  vi.spyOn(console, 'error').mockImplementation(collect('error'))
  vi.spyOn(console, 'warn').mockImplementation(collect('warn'))
  const result = await runAtomic(project, [], {
    phase: 'phase-production-build',
    ...setup.pipeline,
  })
  writeBuildCss(project, result.css)
  setup.afterBuild?.(project)
  printed.length = 0
  const thrown = await failureOf(checkBuild(hookMetadata(project), {}, setup.config ?? {}))
  return { printed, thrown }
}

/**
 * The project with a page that calls `cx(variant)`, which is one problem and names no atom, so the
 * record holds a problem and the build reads no use.
 */
function projectWithProblemAndNoUse(): Project {
  return makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
}

/**
 * The project that names an atom (so the build reads a use) and has one problem in a component.
 */
function projectWithProblemAndUse(): Project {
  return makeProject({
    'app/page.tsx': `import './Prop'\n${pageCalling("'flex'")}`,
    'app/Prop.tsx': PAGE_WITH_PROP,
  })
}

/**
 * Records that `packages` call `cx.dynamic()` in a file a `pages/` entry reaches, as the plugin
 * does for a project that has one.
 */
function recordPagesPackages(project: Project, packages: readonly string[]): void {
  const file = path.join(project.dir, '.next/cache/navecss-prune.json')
  const record = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  writeFileSync(file, JSON.stringify({ ...record, pagesDynamicPackages: packages }))
}

/**
 * Records one Pages Router package that calls `cx.dynamic()`.
 */
function afterBuild(project: Project): void {
  recordPagesPackages(project, ['dyn-lib'])
}

/**
 * Changes the page after the plugin read it.
 */
function editPage(project: Project): void {
  project.write({ 'app/page.tsx': `${PAGE_WITH_PROP}// edited after the build read it\n` })
}

const levels = (printed: readonly Printed[]): string[] => printed.map((entry) => entry.level)

describe('AC-nextjs-used-atoms-27: the report and the Pages Router message are two prints and one throw', () => {
  it('AC-nextjs-used-atoms-27: the report is printed first, the Pages message second, each with its own console.error', async () => {
    const { printed } = await buildAndCheck(projectWithProblemAndUse(), { afterBuild })
    const errors = printed.filter((entry) => entry.level === 'error')
    expect(errors).toHaveLength(2)
    expect(errors[0]!.text.startsWith(`1 problem in 1 file: ${REPORT_CAUSE}`)).toBe(true)
    expect(errors[1]!.text).toContain('dyn-lib')
    expect(errors[1]!.text).toContain('transpilePackages')
    expect(errors[1]!.text).toContain('bundlePagesRouterDependencies')
  })

  it('AC-nextjs-used-atoms-27: the throw counts the report problems and the packages together', async () => {
    const { thrown } = await buildAndCheck(projectWithProblemAndUse(), { afterBuild })
    expect(thrown).toBeInstanceOf(Error)
    const { message, stack } = thrown as Error
    expect(message).toBe('Nave stopped the build: 2 problems, listed above.')
    expect(stack).toBe(message)
  })

  it('AC-nextjs-used-atoms-27: the Pages message alone is one print and a throw of 1 problem', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    const { printed, thrown } = await buildAndCheck(project, { afterBuild })
    expect(levels(printed)).toEqual(['error'])
    expect(printed[0]!.text).toContain('dyn-lib')
    expect((thrown as Error).message).toBe('Nave stopped the build: 1 problem, listed above.')
  })

  it('AC-nextjs-used-atoms-27: control, the package named in transpilePackages or bundled passes', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    await buildAndCheck(project, { afterBuild })
    expect(recordOf(project).pagesDynamicPackages).toEqual(['dyn-lib'])
    const transpiled = await buildAndCheck(makeProject({ 'app/page.tsx': pageCalling("'flex'") }), {
      afterBuild,
      config: { transpilePackages: ['dyn-lib'] },
    })
    expect(transpiled.printed).toEqual([])
    expect(transpiled.thrown).toBeUndefined()
    const bundled = await buildAndCheck(makeProject({ 'app/page.tsx': pageCalling("'flex'") }), {
      afterBuild,
      config: { bundlePagesRouterDependencies: true },
    })
    expect(bundled.printed).toEqual([])
    expect(bundled.thrown).toBeUndefined()
  })
})

describe('AC-nextjs-used-atoms-27: a failure of the record stops the check before the report', () => {
  it('AC-nextjs-used-atoms-27: a stale record prints one message and no report or warning', async () => {
    const { printed, thrown } = await buildAndCheck(projectWithProblemAndNoUse(), {
      afterBuild: editPage,
    })
    expect(levels(printed)).toEqual(['error'])
    expect(printed[0]!.text).not.toContain(REPORT_CAUSE)
    expect(printed[0]!.text).not.toContain('app/page.tsx:4:')
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message.startsWith('Nave stopped the build: ')).toBe(true)
  })

  it('AC-nextjs-used-atoms-27: the stale record also keeps the Pages message from printing', async () => {
    const { printed } = await buildAndCheck(projectWithProblemAndNoUse(), {
      afterBuild: (project) => {
        recordPagesPackages(project, ['dyn-lib'])
        editPage(project)
      },
    })
    expect(levels(printed)).toEqual(['error'])
    expect(printed[0]!.text).not.toContain('transpilePackages')
  })

  it('AC-nextjs-used-atoms-27: both plugins listed prints one message and no report or warning', async () => {
    const { printed, thrown } = await buildAndCheck(projectWithProblemAndNoUse(), {
      pipeline: { before: [navePlugin()] },
    })
    expect(levels(printed)).toEqual(['error'])
    expect(printed[0]!.text).toContain('@navecss/core/postcss')
    expect(printed[0]!.text).not.toContain(REPORT_CAUSE)
    expect(thrown).toBeInstanceOf(Error)
  })

  it('AC-nextjs-used-atoms-27: control, the project of the two cases above has a current record with a problem and no use', async () => {
    const project = projectWithProblemAndNoUse()
    await runAtomic(project, [], { phase: 'phase-production-build' })
    expect(recordOf(project).readsNoUse).toBe(true)
    expect(recordOf(project).problems).toHaveLength(1)
    expect(recordOf(project).hasCorePlugin).toBe(false)
  })
})

describe('AC-nextjs-used-atoms-27: warnings are printed before the report', () => {
  it('AC-nextjs-used-atoms-27: the build that read no use warns once and then prints the report', async () => {
    const { printed } = await buildAndCheck(projectWithProblemAndNoUse())
    expect(levels(printed)).toEqual(['warn', 'error'])
    expect(printed[0]!.text).toContain('read no use')
    expect(printed[1]!.text.startsWith(`1 problem in 1 file: ${REPORT_CAUSE}`)).toBe(true)
  })

  it('AC-nextjs-used-atoms-27: a build that reads a use prints the report without that warning', async () => {
    const project = projectWithProblemAndUse()
    const { printed } = await buildAndCheck(project)
    expect(recordOf(project).readsNoUse).toBe(false)
    expect(levels(printed)).toEqual(['error'])
  })
})
