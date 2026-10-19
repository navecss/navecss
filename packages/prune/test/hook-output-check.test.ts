/**
 * The CSS the build wrote against the set the plugin recorded: every `@layer atomic` block of
 * every CSS file under `<distDir>/static` must hold a rule for each recorded atom and for no other
 * built-in atom, and nothing outside that layer is looked at.
 */
import { describe, expect, it, vi } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { atomsIn } from './helpers/layer.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const OPTIONS: NaveOptions = { keep: ['grid'] }
const STRAY = '.nave-block { display: block; }'

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
async function check(project: Project, distDir = '.next'): Promise<Printed> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errors.mockClear()
  warnings.mockClear()
  let error: Error | undefined
  try {
    await checkBuild(hookMetadata(project, distDir), OPTIONS, {})
  } catch (error_) {
    error = error_ as Error
  }
  return { error, errors: linesOf(errors.mock.calls), warnings: linesOf(warnings.mock.calls) }
}

/**
 * A project the plugin has run over (it uses `flex` and keeps `grid`) and the layer it left. The
 * CSS is not written: each test writes the output it wants checked.
 */
async function trimmedProject(distDir = '.next'): Promise<{ css: string; project: Project }> {
  const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
  const result = await runAtomic(project, [], { options: OPTIONS, distDir })
  expect(recordOf(project, distDir).atoms).toEqual(['flex', 'grid'])
  expect(atomsIn(result.css)).toEqual(['flex', 'grid'])
  return { css: result.css, project }
}

/**
 * The text of the rule for an atom class.
 */
function ruleOf(css: string, className: string): string {
  const rule = new RegExp(String.raw`\.nave-${className}\s*\{[^}]*\}`, 'u').exec(css)
  if (rule === null) throw new Error(`the output holds no rule for ${className}`)
  return rule[0]
}

/**
 * `css` with `rule` added inside its first `@layer atomic` block.
 */
function withStrayRule(css: string, rule: string): string {
  return css.replace(/@layer atomic\s*\{/u, (open) => `${open}\n${rule}\n`)
}

/**
 * `css` without the rule for an atom class.
 */
function withoutRule(css: string, className: string): string {
  return css.split(ruleOf(css, className)).join('')
}

/**
 * Expects one message that names `atom` and the throw that follows it.
 */
function expectStopped(printed: Printed, atom: string): string {
  expect(printed.error).toBeInstanceOf(Error)
  expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
  expect(printed.error?.stack).toBe(printed.error?.message)
  expect(printed.errors).toHaveLength(1)
  const [message = ''] = printed.errors
  expect(message).toContain(atom)
  return message
}

describe('AC-nextjs-used-atoms-36: the output is checked against the recorded set', () => {
  it('AC-nextjs-used-atoms-36: control, the honest output passes and prints nothing', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, css)
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it.each(['block', 'hidden'])(
    'AC-nextjs-used-atoms-36: (a) a stray rule for %s in the atomic layer fails naming the atom and the file',
    async (atom) => {
      const { css, project } = await trimmedProject()
      const stray = withStrayRule(css, `.nave-${atom} { display: ${atom}; }`)
      expect(atomsIn(stray)).toContain(atom)
      writeBuildCss(project, stray)
      const message = expectStopped(await check(project), atom)
      expect(message).toContain('.next/static/css/app.css')
    },
  )

  it('AC-nextjs-used-atoms-36: (b) a removed rule for flex fails naming flex', async () => {
    const { css, project } = await trimmedProject()
    expect(atomsIn(withoutRule(css, 'flex'))).toEqual(['grid'])
    writeBuildCss(project, withoutRule(css, 'flex'))
    const printed = await check(project)
    expect(printed.error).toBeInstanceOf(Error)
    expectStopped(printed, 'flex')
  })

  it('AC-nextjs-used-atoms-36: (c) a rule naming .nave-block inside @layer overrides passes', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, `${css}\n@layer overrides {\n  ${STRAY}\n}\n`)
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-36: a rule outside every layer is not examined either', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, `${css}\n${STRAY}\n`)
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-36: a rule that is not a built-in atom inside the atomic layer passes', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, withStrayRule(css, '.brand-x { color: red; }'))
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })
})

describe('AC-nextjs-used-atoms-36: more than one atomic block, and more than one file', () => {
  it('AC-nextjs-used-atoms-36: two atomic blocks with the stray rule in the second fail naming it', async () => {
    const { css, project } = await trimmedProject()
    const stray = `${css}\n@layer atomic {\n  ${STRAY}\n}\n`
    expect(atomsIn(stray)).toContain('block')
    writeBuildCss(project, stray)
    const printed = await check(project)
    expect(printed.error).toBeInstanceOf(Error)
    expectStopped(printed, 'block')
  })

  it('AC-nextjs-used-atoms-36: two atomic blocks that together hold exactly the set pass', async () => {
    const { css, project } = await trimmedProject()
    const grid = ruleOf(css, 'grid')
    const split = `${withoutRule(css, 'grid')}\n@layer atomic {\n  ${grid}\n}\n`
    expect(atomsIn(split)).toEqual(['flex', 'grid'])
    writeBuildCss(project, split)
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-36: the layer split across two files passes when together they hold the set', async () => {
    const { css, project } = await trimmedProject()
    const grid = ruleOf(css, 'grid')
    writeBuildCss(project, withoutRule(css, 'grid'))
    writeBuildCss(project, `@layer atomic {\n  ${grid}\n}\n`, { file: 'static/css/more.css' })
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-36: control, the split layer with the second file lacking grid fails naming grid', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, withoutRule(css, 'grid'))
    writeBuildCss(project, '@layer atomic {\n}\n', { file: 'static/css/more.css' })
    const printed = await check(project)
    expect(printed.error).toBeInstanceOf(Error)
    expectStopped(printed, 'grid')
  })

  it('AC-nextjs-used-atoms-36: a stray rule in a file of a nested static directory fails naming that file', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, css)
    writeBuildCss(project, `@layer atomic {\n  ${STRAY}\n}\n`, {
      file: 'static/chunks/deep/other.css',
    })
    const message = expectStopped(await check(project), 'block')
    expect(message).toContain('.next/static/chunks/deep/other.css')
  })
})

describe('AC-nextjs-used-atoms-36: only CSS files under the static directory of the build are read', () => {
  it('AC-nextjs-used-atoms-36: a stray rule in an exported copy under out/_next/static passes', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, css)
    const stray = withStrayRule(css, STRAY)
    writeBuildCss(project, stray, { distDir: 'out', file: '_next/static/css/app.css' })
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-36: a stray rule in a CSS file outside static passes', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, css)
    writeBuildCss(project, withStrayRule(css, STRAY), { file: 'server/app/page.css' })
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-36: a file under static that is not CSS is not read', async () => {
    const { css, project } = await trimmedProject()
    writeBuildCss(project, css)
    writeBuildCss(project, withStrayRule(css, STRAY), { file: 'static/chunks/app.js' })
    expect(await check(project)).toEqual({ error: undefined, errors: [], warnings: [] })
  })

  it('AC-nextjs-used-atoms-36: with distDir build the stray rule is found under build/static and named there', async () => {
    const { css, project } = await trimmedProject('build')
    writeBuildCss(project, withStrayRule(css, STRAY), { distDir: 'build' })
    const message = expectStopped(await check(project, 'build'), 'block')
    expect(message).toContain('build/static/css/app.css')
  })
})
