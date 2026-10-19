import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigLike } from './helpers/wrapper-config.ts'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { withNave } from '../src/index.ts'
import { createProject, type Project } from './helpers/project.ts'
import {
  changedVariables,
  CONTEXT,
  handoffInEnv,
  PHASE,
  settle,
  treeOf,
} from './helpers/wrapper-config.ts'

const OPTIONS = {
  keep: ['grid'],
  keepFor: { 'kf-lib': ['block'] },
  cxModules: ['./components/ui/index.ts'],
  extend: { brandBox: { declarations: { color: 'red' } } },
  onUnknown: 'error',
} as const

describe('AC-nextjs-used-atoms-19: withNave() hands its options over in one environment variable', () => {
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

  it('sets the variable when the object config is wrapped, and no other variable', () => {
    const before = { ...process.env }
    withNave({}, OPTIONS)
    expect(changedVariables(before, process.env)).toEqual([HANDOFF_VARIABLE])
  })

  it('control: the snapshot comparison sees a variable that is set', () => {
    const before = { ...process.env }
    const after = { ...before, [`${HANDOFF_VARIABLE}_SCRATCH`]: '1' }
    expect(changedVariables(before, after)).toEqual([`${HANDOFF_VARIABLE}_SCRATCH`])
    expect(changedVariables(before, { ...before })).toEqual([])
  })

  it('holds JSON with exactly the options, the project directory and distDir, and no root the config does not set', () => {
    withNave({}, OPTIONS)
    const handoff = handoffInEnv()
    expect(Object.keys(handoff).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'dir',
      'distDir',
      'options',
    ])
    expect(handoff.options).toMatchObject(OPTIONS)
    expect(handoff.dir).toBe(project.dir)
    expect(handoff.distDir).toBe('.next')
    expect(handoff.root).toBeUndefined()
  })

  it("marks the directory webpack's callback passes on as the bundler's own, and not the one from config load", () => {
    const wrapped = withNave({}, OPTIONS) as unknown as {
      webpack: (config: unknown, context: { dir: string }) => unknown
    }
    expect(handoffInEnv().isBundlerDir).toBeUndefined()
    wrapped.webpack({}, { dir: '/work/apps/web' })
    const handoff = handoffInEnv()
    expect(handoff.dir).toBe('/work/apps/web')
    expect(handoff.isBundlerDir).toBe(true)
  })

  it('holds an options object when withNave() is called with none', () => {
    withNave({})
    const handoff = handoffInEnv()
    expect(typeof handoff.options).toBe('object')
    expect(handoff.dir).toBe(project.dir)
  })

  it('names the configured distDir', () => {
    withNave({ distDir: 'build' }, OPTIONS)
    const handoff = handoffInEnv()
    expect(handoff.distDir).toBe('build')
    expect(handoff.dir).toBe(project.dir)
  })

  it.each([
    ['turbopack.root', { turbopack: { root: '/work/mono' } }, '/work/mono'],
    ['outputFileTracingRoot', { outputFileTracingRoot: '/work/traced' }, '/work/traced'],
    [
      'outputFileTracingRoot before turbopack.root, as Next.js reads them',
      { turbopack: { root: '/work/mono' }, outputFileTracingRoot: '/work/traced' },
      '/work/traced',
    ],
  ])('takes the root from %s', (_name, config, root) => {
    withNave(config as ConfigLike, OPTIONS)
    expect(handoffInEnv().root).toBe(root)
  })

  it('sets the variable when a function config is invoked, with the same content', async () => {
    const user = vi.fn((_phase: string, _context: unknown): ConfigLike => ({ distDir: 'build' }))
    const before = { ...process.env }
    const wrapped = withNave(user, OPTIONS)
    expect(typeof wrapped).toBe('function')
    const resolved = await settle(wrapped)
    expect(user).toHaveBeenCalledWith(PHASE, CONTEXT)
    expect(resolved.distDir).toBe('build')
    expect(changedVariables(before, process.env)).toEqual([HANDOFF_VARIABLE])
    expect(handoffInEnv().distDir).toBe('build')
    expect(handoffInEnv().options).toMatchObject(OPTIONS)
  })

  it('sets the variable when an async function config is invoked', async () => {
    const wrapped = withNave(() => Promise.resolve({ distDir: 'out' }), OPTIONS)
    const resolved = await settle(wrapped)
    expect(resolved.distDir).toBe('out')
    expect(handoffInEnv().distDir).toBe('out')
    expect(handoffInEnv().dir).toBe(project.dir)
  })

  it('writes no options file: the project directory is as it was', () => {
    const before = treeOf(project.dir)
    withNave({ distDir: 'build' }, OPTIONS)
    expect(treeOf(project.dir)).toEqual(before)
    expect(handoffInEnv().distDir).toBe('build')
  })

  it('control: the directory comparison sees a file that is written', () => {
    const before = treeOf(project.dir)
    project.write({ '.next/cache/nave-options.json': '{}' })
    expect(treeOf(project.dir)).not.toEqual(before)
  })
})
