/**
 * A wrapper applied outside `withNave()` can change the config after `withNave()` read it. The
 * check reads the record where the plugin wrote it and the CSS where Next.js says the build wrote
 * it, and says plainly what it could not see.
 */
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Printed } from './helpers/hook-run.ts'
import type { Project } from './helpers/project.ts'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { withNave } from '../src/index.ts'
import { writeBuildCss } from './helpers/build-output.ts'
import { linesOf, listen } from './helpers/hook-run.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const CX = "import { cx } from '@navecss/core/cx'"
const OPTIONS: NaveOptions = {
  keep: ['interactive'],
  keepFor: { 'dyn-pages': ['interactive'] },
}

interface Shape {
  bundlePagesRouterDependencies?: boolean
  compiler?: { runAfterProductionCompile?: (metadata: unknown) => Promise<void> }
  distDir?: string
  transpilePackages?: string[]
}

/**
 * What another library's wrapper does when it is applied outside `withNave()`: it sets `distDir`.
 */
function withOuterDistDir(config: Shape): Shape {
  return { ...config, distDir: 'build' }
}

/**
 * The hook of a resolved config, run on the project with what Next.js hands it.
 */
async function runHookOf(
  project: Project,
  config: Shape,
  distDir = path.join(project.dir, '.next'),
): Promise<Printed> {
  const { errors, warnings } = listen()
  let error: Error | undefined
  try {
    await config.compiler!.runAfterProductionCompile!({ projectDir: project.dir, distDir })
  } catch (error_) {
    error = error_ as Error
  }
  return { error, errors: linesOf(errors.mock.calls), warnings: linesOf(warnings.mock.calls) }
}

/**
 * A project whose Pages Router page imports a package that calls `cx.dynamic()`, built.
 */
async function pagesProject(): Promise<Project> {
  const project = makeProject({
    'pages/legacy.tsx': [
      "import { value } from 'dyn-pages'",
      '',
      'export default function Page() {',
      '  return <div className={value} />',
      '}',
      '',
    ].join('\n'),
  })
  project.install('dyn-pages', {
    'package.json': JSON.stringify({
      name: 'dyn-pages',
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      dependencies: { '@navecss/core': '*' },
    }),
    'index.js': `${CX}\n\nexport const value = cx.dynamic('interactive')\n`,
  })
  listen()
  const result = await runAtomic(project, [], { options: OPTIONS })
  writeBuildCss(project, result.css)
  return project
}

describe('AC-nextjs-used-atoms-39: the check says what an outer wrapper could change', () => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env[HANDOFF_VARIABLE]
  })
  afterEach(() => {
    if (saved === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = saved
  })

  it('stops on a package the config it received does not bundle', async () => {
    const project = await pagesProject()

    const printed = await runHookOf(project, withNave({}, OPTIONS))

    expect(printed.error?.message).toBe('Nave stopped the build: 1 problem, listed above.')
    expect(printed.errors.join('\n')).toContain('dyn-pages')
  })

  it('says it saw the config withNave() received, and that a wrapper applied after it is not seen', async () => {
    const project = await pagesProject()

    const printed = await runHookOf(project, withNave({}, OPTIONS))

    const message = printed.errors.join('\n')
    expect(message).toContain(
      'the config withNave() received neither lists it in transpilePackages nor sets bundlePagesRouterDependencies: true',
    )
    expect(message).toContain(
      'if another wrapper sets either option, make withNave() the outermost: export default withNave(withOther(nextConfig))',
    )
  })
})

describe('AC-nextjs-used-atoms-23: a wrapper outside withNave() that sets distDir', () => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env[HANDOFF_VARIABLE]
  })
  afterEach(() => {
    if (saved === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = saved
  })

  it('reads the record where the plugin wrote it and the CSS where Next.js wrote it', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    listen()
    // The plugin ran under the distDir `withNave()` saw; the build wrote its CSS under the outer one.
    const resolved = withOuterDistDir(withNave({}, {}))
    const result = await runAtomic(project, [], { options: {} })
    writeBuildCss(project, result.css, { distDir: 'build' })
    expect(recordOf(project).atoms).toEqual(['flex'])

    const printed = await runHookOf(project, resolved, path.join(project.dir, 'build'))

    expect(printed.errors.join('\n')).not.toContain('no record from')
    expect(printed.error).toBeUndefined()
  })

  it('still stops a build whose CSS under the outer distDir lacks a rule the record names', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'flex'") })
    listen()
    const resolved = withOuterDistDir(withNave({}, {}))
    await runAtomic(project, [], { options: {} })
    writeBuildCss(project, '@layer atomic {\n}\n', { distDir: 'build' })

    const printed = await runHookOf(project, resolved, path.join(project.dir, 'build'))

    expect(printed.error).toBeInstanceOf(Error)
    expect(printed.errors.join('\n')).toContain('the CSS in build/static does not match')
  })
})
