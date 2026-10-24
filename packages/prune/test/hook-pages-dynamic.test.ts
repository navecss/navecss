/**
 * Pages Router server code sees `cx.dynamic()`'s map only for a package the build bundles: a
 * package that calls it and that a `pages/` entry reaches must be in `transpilePackages` or be
 * bundled through `bundlePagesRouterDependencies`, or the check stops the build.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { describe, expect, it, vi } from 'vitest'

import type { HookConfig } from '../src/hook.ts'
import type { NaveOptions } from '../src/options.ts'
import type { Project } from './helpers/project.ts'

import { checkBuild } from '../src/hook.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { makeProject, PAGE_WITH_PROP, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const CX = "import { cx } from '@navecss/core/cx'"
const DYNAMIC = "cx.dynamic('interactive')"
const OPTIONS: NaveOptions = {
  keep: ['interactive'],
  keepFor: { 'dyn-pages': ['interactive'], 'other-dyn': ['interactive'] },
}
const NO_OUTPUT = { error: undefined, errors: [], warnings: [] }

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
async function check(project: Project, config: HookConfig): Promise<Printed> {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errors.mockClear()
  warnings.mockClear()
  let error: Error | undefined
  try {
    await checkBuild(hookMetadata(project), OPTIONS, config)
  } catch (error_) {
    error = error_ as Error
  }
  return { error, errors: linesOf(errors.mock.calls), warnings: linesOf(warnings.mock.calls) }
}

/**
 * An installed package that calls `cx.dynamic()` and lists `@navecss/core` in `dependencies`.
 */
function dynamicPackage(name: string): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      dependencies: { '@navecss/core': '*' },
    }),
    'index.js': `${CX}\n\nexport const value = ${DYNAMIC}\n`,
  }
}

/**
 * A module that renders the `value` of each package.
 */
function rendering(...names: string[]): string {
  const imports = names.map((name, at) => `import { value as v${at} } from '${name}'`).join('\n')
  const used = names.map((_name, at) => `v${at}`).join(' + ')
  return `${imports}\n\nexport default function Page() {\n  return <div className={${used}} />\n}\n`
}

/**
 * A project the plugin has run over, with `files` and the packages named installed, and the CSS
 * it left written as the build's output.
 */
async function builtProject(files: Record<string, string>, packages: string[]): Promise<Project> {
  const project = makeProject(files)
  for (const name of packages) project.install(name, dynamicPackage(name))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const result = await runAtomic(project, [], { options: OPTIONS })
  writeBuildCss(project, result.css)
  return project
}

describe('AC-nextjs-used-atoms-39: a package that calls cx.dynamic() for the Pages Router must be bundled', () => {
  const pages = { 'pages/legacy.tsx': rendering('dyn-pages') }

  it('AC-nextjs-used-atoms-39: not in transpilePackages and with bundlePagesRouterDependencies unset, the build stops naming the package and both options', async () => {
    const project = await builtProject(pages, ['dyn-pages'])
    expect(recordOf(project).pagesDynamicPackages).toEqual(['dyn-pages'])

    const printed = await check(project, {})
    expect(printed.error).toBeInstanceOf(Error)
    expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
    expect(printed.error?.stack).toBe(printed.error?.message)
    expect(printed.errors).toHaveLength(1)
    const [message = ''] = printed.errors
    expect(message).toContain('dyn-pages')
    expect(message).toContain('transpilePackages')
    expect(message).toContain('bundlePagesRouterDependencies')
    expect(message).not.toContain(REPORT_CAUSE)
    expect(printed.warnings).toEqual([])
  })

  it('AC-nextjs-used-atoms-39: with keep alone, the dependency call is a problem the report names, so the fixture lists keepFor', async () => {
    const project = makeProject(pages)
    project.install('dyn-pages', dynamicPackage('dyn-pages'))
    const options: NaveOptions = { keep: ['interactive'] }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runAtomic(project, [], { options })
    writeBuildCss(project, result.css)
    errors.mockClear()

    await expect(
      checkBuild(hookMetadata(project), options, { transpilePackages: ['dyn-pages'] }),
    ).rejects.toThrow('Nave stopped the build')

    expect(linesOf(errors.mock.calls).join('\n')).toContain('keepFor lists no atoms for it')
  })

  it('AC-nextjs-used-atoms-39: with the package in transpilePackages the check passes and prints nothing', async () => {
    const project = await builtProject(pages, ['dyn-pages'])
    const printed = await check(project, { transpilePackages: ['dyn-pages'] })
    expect(printed).toEqual(NO_OUTPUT)
  })

  it('AC-nextjs-used-atoms-39: with bundlePagesRouterDependencies true the check passes and prints nothing', async () => {
    const project = await builtProject(pages, ['dyn-pages'])
    const printed = await check(project, { bundlePagesRouterDependencies: true })
    expect(printed).toEqual(NO_OUTPUT)
  })

  it('AC-nextjs-used-atoms-39: another package in transpilePackages, or bundlePagesRouterDependencies false, still stops the build', async () => {
    const project = await builtProject(pages, ['dyn-pages'])
    const other = await check(project, { transpilePackages: ['other-dyn'] })
    const off = await check(project, { bundlePagesRouterDependencies: false })
    expect(other.error).toBeInstanceOf(Error)
    expect(other.errors.join('\n')).toContain('dyn-pages')
    expect(off.error).toBeInstanceOf(Error)
    expect(off.errors.join('\n')).toContain('dyn-pages')
  })

  it('AC-nextjs-used-atoms-39: imported only from app/, the list is empty and the check passes', async () => {
    const project = await builtProject({ 'app/page.tsx': rendering('dyn-pages') }, ['dyn-pages'])
    expect(recordOf(project).pagesDynamicPackages).toEqual([])
    expect(await check(project, {})).toEqual(NO_OUTPUT)
  })

  it('AC-nextjs-used-atoms-39: with no dependency calling cx.dynamic(), the list is empty and the check passes', async () => {
    const project = await builtProject({ 'pages/legacy.tsx': 'export default () => null\n' }, [])
    expect(recordOf(project).pagesDynamicPackages).toEqual([])
    expect(await check(project, {})).toEqual(NO_OUTPUT)
  })
})

describe('AC-nextjs-used-atoms-39: a build that stops on the rule does not also warn that it read no use', () => {
  it('AC-nextjs-used-atoms-39: a package that cannot be bundled stops the build and the warning that no use was read is not printed', async () => {
    const options: NaveOptions = { keepFor: { 'dyn-pages': ['interactive'] } }
    const project = makeProject({ 'pages/legacy.tsx': rendering('dyn-pages') })
    project.install('dyn-pages', dynamicPackage('dyn-pages'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runAtomic(project, [], { options })
    writeBuildCss(project, result.css)
    // Control: the record reads no use and lists the package, so the case was reached.
    expect(recordOf(project).readsNoUse).toBe(true)
    expect(recordOf(project).pagesDynamicPackages).toEqual(['dyn-pages'])
    warnings.mockClear()

    await expect(checkBuild(hookMetadata(project), options, {})).rejects.toThrow(
      'Nave stopped the build',
    )

    expect(linesOf(warnings.mock.calls)).toEqual([])
  })

  it('AC-nextjs-used-atoms-39: control, with the package bundled the same record passes and warns that no use was read', async () => {
    const options: NaveOptions = { keepFor: { 'dyn-pages': ['interactive'] } }
    const project = makeProject({ 'pages/legacy.tsx': rendering('dyn-pages') })
    project.install('dyn-pages', dynamicPackage('dyn-pages'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runAtomic(project, [], { options })
    writeBuildCss(project, result.css)
    warnings.mockClear()

    await checkBuild(hookMetadata(project), options, { transpilePackages: ['dyn-pages'] })

    expect(
      linesOf(warnings.mock.calls).filter((line) => line.includes('read no use')),
    ).toHaveLength(1)
  })
})

describe('AC-nextjs-used-atoms-39: more than one package, and a report beside the rule', () => {
  it('AC-nextjs-used-atoms-39: one package of two bundled leaves one problem, naming the other', async () => {
    const files = { 'pages/legacy.tsx': rendering('dyn-pages', 'other-dyn') }
    const project = await builtProject(files, ['dyn-pages', 'other-dyn'])
    const printed = await check(project, { transpilePackages: ['dyn-pages'] })
    expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
    expect(printed.errors.join('\n')).toContain('other-dyn')
    expect(printed.errors.join('\n')).not.toContain('dyn-pages')
  })

  it('AC-nextjs-used-atoms-39: two packages not bundled count as two problems and both are named', async () => {
    const files = { 'pages/legacy.tsx': rendering('dyn-pages', 'other-dyn') }
    const project = await builtProject(files, ['dyn-pages', 'other-dyn'])
    const printed = await check(project, {})
    expect(printed.error?.message).toBe('Nave stopped the build: 2 problems, listed above.')
    expect(printed.errors.join('\n')).toContain('dyn-pages')
    expect(printed.errors.join('\n')).toContain('other-dyn')
  })

  it('AC-nextjs-used-atoms-39: beside a report, the report is printed first and the count is the sum', async () => {
    const files = { 'pages/legacy.tsx': rendering('dyn-pages'), 'app/page.tsx': PAGE_WITH_PROP }
    const project = await builtProject(files, ['dyn-pages'])
    expect(recordOf(project).problems).toHaveLength(1)

    const printed = await check(project, {})
    expect(printed.error?.message).toBe('Nave stopped the build: 2 problems, listed above.')
    expect(printed.errors).toHaveLength(2)
    expect(printed.errors[0]).toContain(REPORT_CAUSE)
    expect(printed.errors[1]).toContain('dyn-pages')
    expect(printed.errors[1]).toContain('transpilePackages')
  })
})
