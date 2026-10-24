/**
 * Running the `next` the workspace installed for this package: where it is, and the environment
 * it runs with.
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'

export const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')

/**
 * Where `next` is installed, symlinks resolved, or `undefined` when it is not.
 */
function installedNext(): string | undefined {
  try {
    return realpathSync(path.join(PACKAGE_ROOT, 'node_modules/next'))
  } catch {
    return
  }
}

export const NEXT_ROOT = installedNext()

/**
 * The arguments that run `next` with `args` from this process's Node.js: the workspace's `next`, or
 * the one installed at `root`.
 */
export function nextCommand(
  args: readonly string[],
  root: string | undefined = NEXT_ROOT,
): string[] {
  if (root === undefined) throw new Error('next is not installed for this package')
  return [path.join(root, 'dist/bin/next'), ...args]
}

/**
 * The environment `next` runs with: no telemetry, and none of the test runner's own variables or
 * the plugin's hand-off from the test process.
 */
export function nextEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  const names = [
    'NAVECSS_PRUNE',
    'NODE_ENV',
    'TEST',
    // Next.js sets it for the bundler it runs; an empty value left here would survive --turbopack.
    'TURBOPACK',
    'VITEST',
    'VITEST_POOL_ID',
    'VITEST_WORKER_ID',
  ]
  for (const name of names) delete env[name]
  return env
}

/**
 * Waits `ms` milliseconds.
 */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
