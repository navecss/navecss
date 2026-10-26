/**
 * `withNave()` and `pageExtensions`: the config's list goes to the plugin and to the build check,
 * so the files Next.js treats as routes under a custom extension are read, and a list the package
 * cannot read is an error rather than a skip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { withNave } from '../src/index.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import { installNext, moduleSource, runAndRead, scratchProjects } from './helpers/graph-fixture.ts'
import { listen } from './helpers/hook-run.ts'
import { createProject, type Project } from './helpers/project.ts'
import { type ConfigLike, handoffInEnv, settle } from './helpers/wrapper-config.ts'

/**
 * A config with a `pageExtensions` list, which Next.js's own types allow and ConfigLike leaves out.
 */
const configWith = (pageExtensions: string[]): ConfigLike =>
  ({ pageExtensions }) as unknown as ConfigLike

describe('AC-nextjs-used-atoms-13: withNave() and pageExtensions', () => {
  let project: Project
  let saved: string | undefined

  beforeEach(() => {
    project = createProject()
    saved = process.env[HANDOFF_VARIABLE]
    delete process.env[HANDOFF_VARIABLE]
    vi.spyOn(process, 'cwd').mockReturnValue(project.dir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (saved === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = saved
    project.remove()
  })

  it('hands the list the config sets to the plugin', () => {
    withNave(configWith(['page.tsx', 'tsx', 'ts']))

    expect(handoffInEnv().pageExtensions).toEqual(['page.tsx', 'tsx', 'ts'])
  })

  it('hands nothing when the config sets none', () => {
    withNave({})

    expect('pageExtensions' in handoffInEnv()).toBe(false)
  })

  it('hands the list of a function config, after it has run', async () => {
    const wrapped = withNave(() => configWith(['page.tsx'])) as unknown as (
      phase: string,
    ) => Promise<unknown>
    await wrapped('phase-production-build')

    expect(handoffInEnv().pageExtensions).toEqual(['page.tsx'])
  })

  it.each([
    ['md and mdx', ['tsx', 'md', 'mdx']],
    ['a compound extension of JavaScript', ['page.js', 'page.jsx', 'page.mjs']],
    ['a compound extension of TypeScript', ['page.ts', 'page.tsx']],
  ])('takes %s', (_row, list) => {
    expect(() => withNave(configWith(list))).not.toThrow()
  })

  it.each([
    ['mdoc', ['tsx', 'mdoc'], 'mdoc'],
    ['a compound extension of an unknown kind', ['page.vue', 'tsx'], 'page.vue'],
    ['an empty extension', ['tsx', ''], ''],
  ])(
    'is a build error when pageExtensions holds %s, naming the option and the extension',
    (_row, list, bad) => {
      expect(() => withNave(configWith(list))).toThrow(/^withNave\(\): pageExtensions /u)
      expect(() => withNave(configWith(list))).toThrow(`"${bad}"`)
    },
  )
})

describe('AC-nextjs-used-atoms-13: the build hook withNave() installs reads pageExtensions', () => {
  const make = scratchProjects()
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env[HANDOFF_VARIABLE]
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (saved === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = saved
  })

  it('passes a clean build of an app whose entries carry the extension, and stops on a new entry', async () => {
    const made = make({
      'app/layout.page.tsx': moduleSource('app/layout.tsx', ['srOnlyFocusable']),
      'app/page.page.tsx': moduleSource('app/page.tsx', ['flex']),
    })
    installNext(made)
    const { result } = await runAndRead(made, { pageExtensions: ['page.tsx'] })
    writeBuildCss(made, result.css)
    const config = (await settle(withNave(configWith(['page.tsx'])))) as {
      compiler: { runAfterProductionCompile: (metadata: unknown) => Promise<void> }
    }
    const { errors } = listen()

    await expect(
      config.compiler.runAfterProductionCompile(hookMetadata(made)),
    ).resolves.toBeUndefined()
    expect(errors).not.toHaveBeenCalled()

    made.write({ 'app/loading.page.tsx': moduleSource('app/loading.tsx', ['block']) })
    await expect(config.compiler.runAfterProductionCompile(hookMetadata(made))).rejects.toThrow(
      'Nave stopped the build',
    )
    expect(String(errors.mock.calls[0]?.[0])).toContain('app/')
  })
})
