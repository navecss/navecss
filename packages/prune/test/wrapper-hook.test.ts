import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Project } from './helpers/project.ts'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { withNave } from '../src/index.ts'
import { hookMetadata, writeBuildCss } from './helpers/build-output.ts'
import {
  makeProject,
  PAGE_WITH_PROP,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'
import { settle } from './helpers/wrapper-config.ts'

registerIsolation()

const OPTIONS: NaveOptions = { keep: ['interactive'] }
const RULES = { rules: { '*.txt': { loaders: ['raw-loader'], as: '*.js' } } }
const ONE_PROBLEM = 'Nave stopped the build: 1 problem, listed above.'

type Hook = (metadata: { distDir: string; projectDir: string }) => unknown

interface Shape {
  bundlePagesRouterDependencies?: boolean
  compiler?: { runAfterProductionCompile?: Hook }
  transpilePackages?: string[]
  turbopack?: Record<string, unknown>
}

/**
 * A wrapper like another library's `withX()`: it installs a hook that waits a few microtask turns,
 * writes to `events`, and then runs the hook it was given, if any.
 */
function probeWrap(events: string[], failure?: Error): (config: Shape) => Shape {
  return (config) => {
    const inner = config.compiler?.runAfterProductionCompile
    const hook: Hook = async (metadata) => {
      events.push('probe:start')
      for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
      if (failure !== undefined) throw failure
      events.push('probe:end')
      await inner?.(metadata)
    }
    return { ...config, compiler: { ...config.compiler, runAfterProductionCompile: hook } }
  }
}

/**
 * Records every console call into `events` as `nave` and returns the texts printed.
 */
function watchNave(events: string[]): () => string[] {
  const texts: string[] = []
  for (const kind of ['error', 'warn'] as const) {
    vi.spyOn(console, kind).mockImplementation((...args: unknown[]) => {
      events.push(`nave:${kind}`)
      texts.push(args.map(String).join(' '))
    })
  }
  return () => [...texts]
}

async function hookOf(value: unknown): Promise<Hook> {
  const resolved = (await settle(value)) as Shape
  const hook = resolved.compiler?.runAfterProductionCompile
  expect(typeof hook).toBe('function')
  return hook!
}

/**
 * A project the plugin has run over with `options`, and whose build CSS is written.
 */
async function builtProject(
  files: Record<string, string>,
  options: NaveOptions,
  setUp: (project: Project) => void = () => {},
): Promise<Project> {
  const project = makeProject(files)
  setUp(project)
  const result = await runAtomic(project, [], { options })
  writeBuildCss(project, result.css)
  return project
}

async function runHook(hook: Hook, project: Project): Promise<void> {
  await hook(hookMetadata(project))
}

interface Row {
  readonly name: string
  readonly build: (wrap: (config: Shape) => Shape) => unknown
}

const ROWS: readonly Row[] = [
  { name: 'object', build: (wrap) => withNave(wrap({}), OPTIONS) },
  { name: 'function', build: (wrap) => withNave(() => wrap({}), OPTIONS) },
  { name: 'async function', build: (wrap) => withNave(() => Promise.resolve(wrap({})), OPTIONS) },
  { name: 'Nave outside', build: (wrap) => withNave(wrap({}), OPTIONS) },
  { name: 'Nave inside', build: (wrap) => wrap(withNave({}, OPTIONS)) },
  { name: 'turbopack key present', build: (wrap) => withNave(wrap({ turbopack: RULES }), OPTIONS) },
]

describe('AC-nextjs-used-atoms-23: the resolved hook runs the reader hook first, then the check', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env[HANDOFF_VARIABLE]
  })

  afterEach(() => {
    if (saved === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = saved
  })

  describe.each(ROWS)('row: $name', (row) => {
    it('AC-nextjs-used-atoms-23: the probe hook settles once before the check prints and throws once', async () => {
      const events: string[] = []
      const printed = watchNave(events)
      const hook = await hookOf(row.build(probeWrap(events)))
      const project = await builtProject({ 'app/page.tsx': PAGE_WITH_PROP }, OPTIONS)
      await expect(runHook(hook, project)).rejects.toMatchObject({ message: ONE_PROBLEM })
      expect(events).toEqual(['probe:start', 'probe:end', 'nave:error'])
      expect(printed()).toHaveLength(1)
    })

    it('AC-nextjs-used-atoms-23: a probe hook that throws propagates and the check does not run', async () => {
      const events: string[] = []
      const printed = watchNave(events)
      const failure = new Error('probe failed')
      const hook = await hookOf(row.build(probeWrap(events, failure)))
      const project = await builtProject({ 'app/page.tsx': PAGE_WITH_PROP }, OPTIONS)
      await expect(runHook(hook, project)).rejects.toBe(failure)
      expect(events).toEqual(['probe:start'])
      expect(printed()).toEqual([])
      // Control: the project holds a problem, which the check reports once the probe's hook passes.
      expect(recordOf(project).problems).toHaveLength(1)
    })
  })
})

describe('AC-nextjs-used-atoms-23: a config without a hook of its own still checks the project', () => {
  const SHAPES: readonly Row[] = [
    { name: 'object', build: () => withNave({}, OPTIONS) },
    { name: 'function', build: () => withNave(() => ({}), OPTIONS) },
    { name: 'async function', build: () => withNave(() => Promise.resolve({}), OPTIONS) },
  ]

  describe.each(SHAPES)('shape: $name', (shape) => {
    it('AC-nextjs-used-atoms-23: it installs a hook that rejects when the record holds a problem', async () => {
      const events: string[] = []
      const printed = watchNave(events)
      const hook = await hookOf(shape.build((config) => config))
      const project = await builtProject({ 'app/page.tsx': PAGE_WITH_PROP }, OPTIONS)
      await expect(runHook(hook, project)).rejects.toMatchObject({ message: ONE_PROBLEM })
      expect(printed()).toHaveLength(1)
    })

    it('AC-nextjs-used-atoms-23: it resolves, printing nothing, for a clean project', async () => {
      const events: string[] = []
      const printed = watchNave(events)
      const hook = await hookOf(shape.build((config) => config))
      const project = await builtProject({ 'app/page.tsx': pageCalling("'flex'") }, OPTIONS)
      await expect(runHook(hook, project)).resolves.toBeUndefined()
      expect(printed()).toEqual([])
      // Control: the hook is the one that rejects for the problem project above, so it is armed.
      const broken = await builtProject({ 'app/page.tsx': PAGE_WITH_PROP }, OPTIONS)
      await expect(runHook(hook, broken)).rejects.toMatchObject({ message: ONE_PROBLEM })
    })
  })
})

const DYN_PACKAGE = {
  'package.json': JSON.stringify({
    name: 'dyn-pages',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    dependencies: { '@navecss/core': '*' },
  }),
  'index.js':
    "import { cx } from '@navecss/core/cx'\n\nexport const look = () => cx.dynamic('interactive')\n",
}

const LEGACY_OPTIONS: NaveOptions = { keepFor: { 'dyn-pages': ['interactive'] } }

const LEGACY_PAGE =
  "import { look } from 'dyn-pages'\n\nexport default function Legacy() {\n  return <div className={look()} />\n}\n"

/**
 * A project whose `pages/` entry reaches an installed package that calls `cx.dynamic()`.
 */
async function legacyProject(): Promise<Project> {
  const project = await builtProject(
    { 'pages/legacy.tsx': LEGACY_PAGE },
    LEGACY_OPTIONS,
    (made) => {
      made.install('dyn-pages', DYN_PACKAGE)
    },
  )
  expect(recordOf(project).problems).toEqual([])
  return project
}

interface Setting {
  readonly build: () => unknown
  readonly name: string
}

const NOT_COVERED: readonly Setting[] = [
  { name: 'no setting', build: () => withNave({}, LEGACY_OPTIONS) },
  {
    name: 'another package in transpilePackages',
    build: () => withNave({ transpilePackages: ['ui-x'] }, LEGACY_OPTIONS),
  },
  {
    name: 'bundlePagesRouterDependencies false',
    build: () => withNave({ bundlePagesRouterDependencies: false }, LEGACY_OPTIONS),
  },
]

const COVERED: readonly Setting[] = [
  {
    name: 'the package in transpilePackages',
    build: () => withNave({ transpilePackages: ['dyn-pages'] }, LEGACY_OPTIONS),
  },
  {
    name: 'bundlePagesRouterDependencies true',
    build: () => withNave({ bundlePagesRouterDependencies: true }, LEGACY_OPTIONS),
  },
  {
    name: 'the package in transpilePackages of a function config',
    build: () => withNave(() => ({ transpilePackages: ['dyn-pages'] }), LEGACY_OPTIONS),
  },
]

describe('AC-nextjs-used-atoms-23: the check reads the transpile settings of the config given to withNave()', () => {
  it.each(NOT_COVERED)(
    'AC-nextjs-used-atoms-23: a Pages Router package that calls cx.dynamic() fails with $name',
    async ({ build }) => {
      const printed = watchNave([])
      const hook = await hookOf(build())
      await expect(runHook(hook, await legacyProject())).rejects.toMatchObject({
        message: ONE_PROBLEM,
      })
      const [message] = printed()
      expect(message).toContain('dyn-pages')
      expect(message).toContain('transpilePackages')
      expect(message).toContain('bundlePagesRouterDependencies')
    },
  )

  it.each(COVERED)(
    'AC-nextjs-used-atoms-23: the same package does not fail with $name',
    async ({ build }) => {
      const printed = watchNave([])
      const hook = await hookOf(build())
      await expect(runHook(hook, await legacyProject())).resolves.toBeUndefined()
      expect(printed()).toEqual([])
    },
  )
})

describe("AC-nextjs-used-atoms-23: the hook's options digest is the one the plugin recorded", () => {
  const RECORDED: NaveOptions = { keep: ['grid'] }

  it('AC-nextjs-used-atoms-23: the same options object gives no stale failure', async () => {
    const printed = watchNave([])
    const hook = await hookOf(withNave({}, RECORDED))
    const project = await builtProject({ 'app/page.tsx': pageCalling("'flex'") }, RECORDED)
    await expect(runHook(hook, project)).resolves.toBeUndefined()
    expect(printed()).toEqual([])
  })

  it('AC-nextjs-used-atoms-23: different withNave() options fail with the options-changed message', async () => {
    const printed = watchNave([])
    const hook = await hookOf(withNave({}, { keep: ['block'] }))
    const project = await builtProject({ 'app/page.tsx': pageCalling("'flex'") }, RECORDED)
    await expect(runHook(hook, project)).rejects.toMatchObject({ message: ONE_PROBLEM })
    const [message] = printed()
    expect(message).toContain('options')
    expect(message).toContain('withNave()')
    expect(message).toContain('.next/cache')
    expect(message).not.toContain('app/page.tsx')
  })
})
