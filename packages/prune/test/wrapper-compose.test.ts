import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigLike } from './helpers/wrapper-config.ts'

import { HANDOFF_VARIABLE } from '../src/handoff.ts'
import { withNave } from '../src/index.ts'
import {
  asConfig,
  CONTEXT,
  createProbe,
  DEFINE_KEY,
  PHASE,
  settle,
} from './helpers/wrapper-config.ts'

const OPTIONS = { keep: ['interactive'] } as const
const RULES = { rules: { '*.txt': { loaders: ['raw-loader'], as: '*.js' } } }

interface Row {
  readonly name: string
  /**
   * Builds the value Next.js is given, with the probe it was built from.
   */
  readonly build: (probe: ReturnType<typeof createProbe>) => unknown
  /**
   * The `turbopack` value the resolved config must hold.
   */
  readonly turbopack: Record<string, unknown>
}

const ROWS: readonly Row[] = [
  { name: 'object', build: (p) => withNave(p.wrap({}), OPTIONS), turbopack: {} },
  {
    name: 'function',
    build: (p) => withNave((): ConfigLike => p.wrap({}), OPTIONS),
    turbopack: {},
  },
  {
    name: 'async function',
    build: (p) => withNave((): Promise<ConfigLike> => Promise.resolve(p.wrap({})), OPTIONS),
    turbopack: {},
  },
  { name: 'Nave outside', build: (p) => withNave(p.wrap({}), OPTIONS), turbopack: {} },
  { name: 'Nave inside', build: (p) => p.wrap(asConfig(withNave({}, OPTIONS))), turbopack: {} },
  {
    name: 'turbopack key present',
    build: (p) => withNave(p.wrap({ turbopack: RULES }), OPTIONS),
    turbopack: RULES,
  },
]

describe('AC-nextjs-used-atoms-23: withNave() composes with other wrappers, whatever the config shape', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env[HANDOFF_VARIABLE]
  })

  afterEach(() => {
    if (saved === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = saved
  })

  describe.each(ROWS)('row: $name', (row) => {
    it('keeps the probe define beside the keep map', async () => {
      const resolved = await settle(row.build(createProbe()))
      expect(resolved.compiler?.define?.PROBE).toBe('"1"')
      expect(JSON.parse(resolved.compiler?.define?.[DEFINE_KEY] ?? 'null')).toEqual({
        interactive: 'nave-interactive',
      })
    })

    it('holds ui-x and @navecss/core in transpilePackages, each once', async () => {
      const resolved = await settle(row.build(createProbe()))
      const packages = resolved.transpilePackages ?? []
      expect(packages.filter((name) => name === 'ui-x')).toHaveLength(1)
      expect(packages.filter((name) => name === '@navecss/core')).toHaveLength(1)
    })

    it('still runs the probe webpack function with (config, context) and returns its result', async () => {
      const probe = createProbe()
      const resolved = await settle(row.build(probe))
      expect(typeof resolved.webpack).toBe('function')
      const webpackConfig = { name: 'client' }
      const result = resolved.webpack?.(webpackConfig, CONTEXT)
      expect(probe.webpackRuns).toEqual([webpackConfig])
      expect(result).toEqual(webpackConfig)
    })

    it('holds the turbopack value a config with a webpack function needs', async () => {
      const resolved = await settle(row.build(createProbe()))
      expect(resolved.turbopack).toEqual(row.turbopack)
    })
  })

  it('returns a function for a function config, called with the build mode and context', async () => {
    const user = vi.fn((_phase: string, _context: unknown): ConfigLike => ({}))
    const wrapped = withNave(user, OPTIONS)
    expect(typeof wrapped).toBe('function')
    await settle(wrapped)
    expect(user).toHaveBeenCalledWith(PHASE, CONTEXT)
  })

  it('returns an async function for an async function config, resolving to what the object gives', async () => {
    const wrapped = withNave((): Promise<ConfigLike> => Promise.resolve({}), OPTIONS)
    expect(typeof wrapped).toBe('function')
    const pending = (wrapped as unknown as (phase: string, context: unknown) => unknown)(
      PHASE,
      CONTEXT,
    )
    expect(pending).toBeInstanceOf(Promise)
    const fromAsync = (await pending) as ConfigLike
    const fromObject = asConfig(withNave({}, OPTIONS))
    expect(fromAsync.compiler?.define?.[DEFINE_KEY]).toBe(fromObject.compiler?.define?.[DEFINE_KEY])
    expect(fromAsync.transpilePackages).toEqual(fromObject.transpilePackages)
  })

  it('control: a function config is a function, an object config is not', () => {
    expect(typeof withNave(() => ({}), OPTIONS)).toBe('function')
    expect(typeof withNave({}, OPTIONS)).toBe('object')
  })

  describe('the user config pieces the wrapper must leave as they are', () => {
    it('adds @navecss/core to transpilePackages beside the user entries', () => {
      const resolved = asConfig(withNave({ transpilePackages: ['ui-y'] }))
      expect(
        [...(resolved.transpilePackages ?? [])].toSorted((a, b) => a.localeCompare(b)),
      ).toEqual(['@navecss/core', 'ui-y'])
    })

    it('adds @navecss/core to transpilePackages when the user has none', () => {
      const resolved = asConfig(withNave({}))
      expect(resolved.transpilePackages).toEqual(['@navecss/core'])
    })

    it('does not repeat @navecss/core when the user lists it', () => {
      const resolved = asConfig(withNave({ transpilePackages: ['@navecss/core', 'ui-y'] }))
      const packages = resolved.transpilePackages ?? []
      expect(packages.filter((name) => name === '@navecss/core')).toHaveLength(1)
      expect(packages).toContain('ui-y')
    })

    it.each([true, false])('leaves bundlePagesRouterDependencies at %s', (value) => {
      const resolved = asConfig(withNave({ bundlePagesRouterDependencies: value }))
      expect(resolved.bundlePagesRouterDependencies).toBe(value)
    })

    it('adds no bundlePagesRouterDependencies when the user sets none', () => {
      const resolved = asConfig(withNave({ transpilePackages: ['ui-y'] }))
      expect(resolved.transpilePackages).toContain('@navecss/core')
      expect(Object.hasOwn(resolved, 'bundlePagesRouterDependencies')).toBe(false)
    })

    it('sets turbopack: {} for a user webpack function and no turbopack key', () => {
      const resolved = asConfig(withNave({ webpack: (config: unknown) => config }))
      expect(resolved.turbopack).toEqual({})
    })

    it('runs the user webpack function with (config, context) and returns its result', () => {
      const outcome = { name: 'changed' }
      const user = vi.fn((_config: unknown, _context: unknown): unknown => outcome)
      const resolved = asConfig(withNave({ webpack: user }))
      const webpackConfig = { name: 'server' }
      const context = { isServer: true }
      expect(resolved.webpack?.(webpackConfig, context)).toBe(outcome)
      expect(user).toHaveBeenCalledTimes(1)
      expect(user).toHaveBeenCalledWith(webpackConfig, context)
    })

    it('keeps the user turbopack value, deep-equal, beside a user webpack function', () => {
      const turbopack = { root: '/work/mono', resolveAlias: { a: 'b' } }
      const resolved = asConfig(withNave({ turbopack, webpack: (config: unknown) => config }))
      expect(resolved.turbopack).toEqual(turbopack)
    })

    it('leaves a config that has a webpack function without a turbopack key only with turbopack: {}', () => {
      const plain = asConfig(withNave({}))
      const hasWebpack = typeof plain.webpack === 'function'
      expect(hasWebpack ? plain.turbopack : {}).toEqual({})
    })
  })
})
