/**
 * Shared pieces for the `withNave()` tests: a loose Next.js config shape, a probe wrapper that
 * stands in for another library's `withX()`, readers for the environment variable the wrapper
 * sets, and snapshots that show what the wrapper changed in the environment and on disk.
 */
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { vi } from 'vitest'

import type { Handoff } from '../../src/handoff.ts'

import { HANDOFF_VARIABLE } from '../../src/handoff.ts'

export const DEFINE_KEY = '__NAVE_KEEP_CLASSES__'

export interface ConfigLike {
  bundlePagesRouterDependencies?: boolean
  compiler?: { define?: Record<string, string>; runAfterProductionCompile?: () => void }
  distDir?: string
  outputFileTracingRoot?: string
  transpilePackages?: string[]
  turbopack?: Record<string, unknown>
  webpack?: (config: unknown, context: unknown) => unknown
}

export type ConfigFunction = (phase: string, context: unknown) => ConfigLike | Promise<ConfigLike>

export const PHASE = 'phase-production-build'
export const CONTEXT = { defaultConfig: {} }

export interface Probe {
  /**
   * Wraps a config the way another library's `withX()` does.
   */
  readonly wrap: (config: ConfigLike) => ConfigLike
  /**
   * The webpack configs the probe's `webpack` function has been called with, in order.
   */
  readonly webpackRuns: unknown[]
}

/**
 * A probe wrapper: it adds a define, a `webpack` function that records its calls and runs the
 * wrapped config's own, a build hook and `transpilePackages: ['ui-x']`.
 */
export function createProbe(): Probe {
  const webpackRuns: unknown[] = []
  const wrap = (config: ConfigLike): ConfigLike => ({
    ...config,
    compiler: {
      ...config.compiler,
      define: { ...config.compiler?.define, PROBE: '"1"' },
      runAfterProductionCompile: vi.fn(),
    },
    transpilePackages: [...(config.transpilePackages ?? []), 'ui-x'],
    webpack: (webpackConfig: unknown, context: unknown) => {
      webpackRuns.push(webpackConfig)
      return config.webpack ? config.webpack(webpackConfig, context) : webpackConfig
    },
  })
  return { wrap, webpackRuns }
}

/**
 * A value `withNave()` returned, read as the loose config shape.
 */
export function asConfig(value: unknown): ConfigLike {
  return value as ConfigLike
}

/**
 * The config a wrapped value stands for, whether it is an object, a function or an async one.
 */
export async function settle(value: unknown): Promise<ConfigLike> {
  if (typeof value === 'function') return await (value as ConfigFunction)(PHASE, CONTEXT)
  return value as ConfigLike
}

/**
 * The handoff the wrapper left in the environment, parsed.
 */
export function handoffInEnv(): Handoff {
  const text = process.env[HANDOFF_VARIABLE]
  if (text === undefined) throw new Error(`${HANDOFF_VARIABLE} is not set`)
  return JSON.parse(text) as Handoff
}

/**
 * The names of the environment variables whose value differs between two snapshots, sorted.
 */
export function changedVariables(before: NodeJS.ProcessEnv, after: NodeJS.ProcessEnv): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...names]
    .filter((name) => before[name] !== after[name])
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * Every path under `dir` with its size, sorted, leaving out `node_modules` (core is linked into
 * it, and other test files write there while this one runs): two equal snapshots mean nothing was
 * created, removed or rewritten in the project.
 */
export function treeOf(dir: string, prefix = ''): string[] {
  const entries: string[] = []
  const listing = readdirSync(dir, { withFileTypes: true })
  for (const entry of listing) {
    if (entry.name === 'node_modules') continue
    const relative = path.join(prefix, entry.name)
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) entries.push(...treeOf(full, relative))
    else entries.push(`${relative}:${statSync(full).size}`)
  }
  return entries.toSorted((a, b) => a.localeCompare(b))
}
