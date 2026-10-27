/**
 * The root the plugin declares files within, the same for both bundlers. Turbopack panics on a
 * declared file outside its root, which Next.js sets to `outputFileTracingRoot` or
 * `turbopack.root` from the config, and otherwise to the workspace root it infers from the project
 * directory (after `next.config` has run, so the wrapper cannot read it). The plugin infers it the
 * same way, with Next.js's own function. Webpack has no such panic, but a stylesheet that declares
 * a file outside that root made Next.js 16.2.0 crash on the next build, so webpack gets the same
 * limit: a file read outside the root is declared to neither, and the build checks it before it finishes.
 */
import { createRequire } from 'node:module'
import path from 'node:path'

import type { Handoff } from './handoff.ts'

const FIND_ROOT = 'next/dist/lib/find-root.js'

interface FindRoot {
  readonly findRootDirAndLockFiles?: (dir: string) => { readonly rootDir?: unknown }
}

/**
 * Next.js's own workspace-root search, from the `next` the project resolves, else from this
 * package's peer, or `undefined` when neither has it.
 */
function findRootOf(dir: string): FindRoot | undefined {
  for (const base of [path.join(dir, 'package.json'), import.meta.url]) {
    try {
      return createRequire(base)(FIND_ROOT) as FindRoot
    } catch {
      // Not resolvable from here: try the next place, or fall back to the project directory.
    }
  }
  return undefined
}

/**
 * The workspace root Next.js infers for the project in `dir`, or `undefined` when it cannot be
 * asked.
 */
function inferredRoot(dir: string): string | undefined {
  try {
    const rootDir = findRootOf(dir)?.findRootDirAndLockFiles?.(dir).rootDir
    return typeof rootDir === 'string' ? rootDir : undefined
  } catch {
    return undefined
  }
}

/**
 * The root no declared path may leave: the configured root, else `NEXT_PRIVATE_OUTPUT_TRACE_ROOT`
 * (which Next.js reads in place of its search), else the root Next.js infers, else the project
 * directory.
 * @param handoff The hand-off, with the project directory this run reads.
 * @returns The root.
 */
export function declarationRoot(handoff: Handoff): string {
  if (handoff.root !== undefined) return handoff.root
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- read by Next.js in the process that runs the plugin, not a build input
  const traced = process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT
  if (traced !== undefined && traced !== '') return traced
  return inferredRoot(handoff.dir) ?? handoff.dir
}
