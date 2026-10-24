import { REPORT_CAUSE } from '@navecss/core/collect'
import { describe, expect, it, vi } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Sheet } from './helpers/plugin-run.ts'
import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { atomsIn } from './helpers/layer.ts'
import {
  coreThrown,
  inProject,
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

/**
 * The stylesheet with an unknown atom on line 3, column 3.
 */
const GLOBALS: Sheet = {
  css: '/* styles */\n.card {\n  @nave interactve;\n}\n',
  file: 'app/globals.css',
}

interface Outcome {
  /**
   * What each `console.error` call was given, as text.
   */
  readonly errors: string[]
  readonly warnings: string[]
  readonly thrown: unknown
  /**
   * The atoms the build's layer holds.
   */
  readonly atoms: string[]
}

interface Build {
  readonly options?: NaveOptions
  readonly entryOptions?: object
}

/**
 * Runs the plugin over the stylesheets and the atom layer for a build, writes the layer as the
 * build's CSS, and runs the check with the same options.
 */
async function buildAndCheck(
  project: Project,
  sheets: readonly Sheet[],
  build: Build = {},
): Promise<Outcome> {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const options = build.options ?? {}
  const result = await runAtomic(project, sheets, {
    options,
    phase: 'phase-production-build',
    ...(build.entryOptions !== undefined && { entryOptions: build.entryOptions }),
  })
  writeBuildCss(project, result.css)
  error.mockClear()
  warn.mockClear()
  const thrown = await failureOf(checkBuild(hookMetadata(project), options, {}))
  return {
    errors: error.mock.calls.map((call) => call.map(String).join(' ')),
    warnings: warn.mock.calls.map((call) => call.map(String).join(' ')),
    thrown,
    atoms: atomsIn(result.css),
  }
}

/**
 * The project with the page that calls `cx(variant)` on line 4.
 */
function projectWithPropPage(): Project {
  return makeProject({ 'app/page.tsx': PAGE_WITH_PROP })
}

/**
 * The project whose page reads cleanly, so the stylesheet's rule is the only problem it can have.
 */
function projectWithCleanPage(): Project {
  return makeProject({ 'app/page.tsx': pageCalling("'flex'") })
}

describe('AC-nextjs-used-atoms-03: an @nave problem is reported where application problems are', () => {
  it('AC-nextjs-used-atoms-03: the report counts 2 problems in 2 files and the throw says 2 problems', async () => {
    const { errors, thrown } = await buildAndCheck(projectWithPropPage(), [GLOBALS])
    expect(errors).toHaveLength(1)
    expect(errors[0]!.split('\n', 1)[0]).toBe(`2 problems in 2 files: ${REPORT_CAUSE}`)
    expect((thrown as Error).message).toBe('Nave stopped the build: 2 problems, listed above.')
  })

  it('AC-nextjs-used-atoms-03: one line opens with the stylesheet position and one with the page position', async () => {
    const { errors } = await buildAndCheck(projectWithPropPage(), [GLOBALS])
    const lines = (errors[0] ?? '').split('\n')
    expect(lines.filter((line) => line.startsWith('app/globals.css:3:3: '))).toHaveLength(1)
    expect(lines.filter((line) => line.startsWith('app/page.tsx:4:'))).toHaveLength(1)
  })

  it("AC-nextjs-used-atoms-03: the @nave line's text is the text core's plugin throws", async () => {
    const project = projectWithPropPage()
    const { errors } = await buildAndCheck(project, [GLOBALS])
    const thrown = await coreThrown(GLOBALS.css, inProject(project, GLOBALS.file))
    expect(thrown.text).toContain('interactve')
    expect((errors[0] ?? '').split('\n')).toContain(`app/globals.css:3:3: ${thrown.text}`)
  })

  it('AC-nextjs-used-atoms-03: the stylesheet problem alone fails the build under the default', async () => {
    const { errors, thrown } = await buildAndCheck(projectWithCleanPage(), [GLOBALS])
    expect(errors).toHaveLength(1)
    expect(errors[0]!.split('\n', 1)[0]).toBe(`1 problem in 1 file: ${REPORT_CAUSE}`)
    expect((thrown as Error).message).toBe('Nave stopped the build: 1 problem, listed above.')
  })

  it('AC-nextjs-used-atoms-03: control, the record holds the stylesheet problem under the default and under "error"', async () => {
    for (const options of [{}, { onUnknown: 'error' } as const]) {
      const project = projectWithCleanPage()
      await runAtomic(project, [GLOBALS], { options, phase: 'phase-production-build' })
      expect(recordOf(project).directiveProblems).toHaveLength(1)
    }
  })
})

describe('AC-nextjs-used-atoms-03: onUnknown "warn" keeps the @nave problem out of the failure', () => {
  const options: NaveOptions = { onUnknown: 'warn' }

  it('AC-nextjs-used-atoms-03: the check passes when the stylesheet is the only problem', async () => {
    const { errors, thrown } = await buildAndCheck(projectWithCleanPage(), [GLOBALS], { options })
    expect(thrown).toBeUndefined()
    expect(errors).toEqual([])
  })

  it('AC-nextjs-used-atoms-03: the count excludes it when another problem exists', async () => {
    const { errors, thrown } = await buildAndCheck(projectWithPropPage(), [GLOBALS], { options })
    expect(errors).toHaveLength(1)
    const lines = errors[0]!.split('\n')
    expect(lines[0]).toBe(`1 problem in 1 file: ${REPORT_CAUSE}`)
    expect(lines.filter((line) => line.startsWith('app/globals.css'))).toEqual([])
    expect((thrown as Error).message).toBe('Nave stopped the build: 1 problem, listed above.')
  })

  it('AC-nextjs-used-atoms-03: control, the same page under the default is counted with the stylesheet', async () => {
    const { errors } = await buildAndCheck(projectWithPropPage(), [GLOBALS])
    expect(errors[0] ?? '').toContain('app/globals.css:3:3: ')
  })
})

describe('AC-nextjs-used-atoms-03: onUnknown "ignore" prints nothing about the @nave problem', () => {
  it('AC-nextjs-used-atoms-03: the check passes and prints nothing', async () => {
    const options: NaveOptions = { onUnknown: 'ignore' }
    const { errors, warnings, thrown } = await buildAndCheck(projectWithCleanPage(), [GLOBALS], {
      options,
    })
    expect(thrown).toBeUndefined()
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it('AC-nextjs-used-atoms-03: control, under the default the same row fails', async () => {
    const { errors, thrown } = await buildAndCheck(projectWithCleanPage(), [GLOBALS])
    expect(thrown).toBeInstanceOf(Error)
    expect(errors).toHaveLength(1)
  })
})

describe('AC-nextjs-used-atoms-19: options on the PostCSS entry are a problem in the report', () => {
  const build: Build = { options: { keep: ['grid'] }, entryOptions: { keep: ['hidden'] } }

  it('AC-nextjs-used-atoms-19: the report holds a line naming keep and withNave() and the build check fails', async () => {
    const { errors, thrown } = await buildAndCheck(projectWithCleanPage(), [], build)
    expect(errors).toHaveLength(1)
    const lines = errors[0]!.split('\n')
    expect(lines.some((line) => line.includes('keep') && line.includes('withNave()'))).toBe(true)
    expect((thrown as Error).message).toBe('Nave stopped the build: 1 problem, listed above.')
  })

  it("AC-nextjs-used-atoms-19: the trimmed layer ships what withNave()'s options say and not hidden", async () => {
    const { atoms } = await buildAndCheck(projectWithCleanPage(), [], build)
    expect(atoms).toEqual(['flex', 'grid'])
    expect(atoms).not.toContain('hidden')
  })

  it('AC-nextjs-used-atoms-19: control, the same project without the entry options passes and prints nothing', async () => {
    const { errors, warnings, thrown } = await buildAndCheck(projectWithCleanPage(), [], {
      options: { keep: ['grid'] },
    })
    expect(thrown).toBeUndefined()
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
})
