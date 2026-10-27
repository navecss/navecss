/**
 * Runs the Nave PostCSS plugin the way a bundler does for a whole build: one plugin instance over
 * several stylesheets in turn, the wrapper's environment variable set (or unset) around each run,
 * and a fresh copy of the plugin module per call so no state a test leaves in the module reaches
 * the next test.
 */
import path from 'node:path'
import postcss from 'postcss'
import { vi } from 'vitest'

import type { Handoff } from '../../src/handoff.ts'
import type { NaveOptions } from '../../src/options.ts'
import type { prunePlugin } from '../../src/postcss.ts'
import type { Project } from './project.ts'

import { encodeHandoff, HANDOFF_VARIABLE } from '../../src/handoff.ts'
import { ATOMIC_CSS } from './project.ts'

export interface Sheet {
  readonly css: string
  /**
   * The stylesheet's path relative to the project directory.
   */
  readonly file: string
}

export interface PipelineOptions {
  /**
   * The options `withNave()` was called with; `false` runs with the variable unset.
   */
  readonly options?: NaveOptions | false
  readonly distDir?: string
  readonly root?: string
  /**
   * Whether the hand-off is the one webpack's callback leaves: its own project directory.
   */
  readonly isBundlerDir?: boolean
  /**
   * The phase Next.js called a function config with (`phase-development-server` for `next dev`);
   * absent for an object config.
   */
  readonly phase?: string
  /**
   * The options object listed on the PostCSS entry.
   */
  readonly entryOptions?: object
  /**
   * Plugins listed before the Nave plugin.
   */
  readonly before?: readonly postcss.AcceptedPlugin[]
  /**
   * Plugins listed after the Nave plugin.
   */
  readonly after?: readonly postcss.AcceptedPlugin[]
}

/**
 * Core's own `atomic.css`, as the bundler meets it in the project's `node_modules`.
 */
export const ATOMIC_SHEET: Sheet = {
  css: ATOMIC_CSS,
  file: 'node_modules/@navecss/core/dist/atomic.css',
}

/**
 * A fresh copy of the plugin factory, with whatever module-level state it keeps reset.
 */
export async function freshPrunePlugin(): Promise<typeof prunePlugin> {
  vi.resetModules()
  const loaded = await import('../../src/postcss.ts')
  return loaded.prunePlugin
}

/**
 * The handoff `withNave()` would leave in the environment for these options.
 */
function handoffFor(project: Project, run: PipelineOptions): Handoff {
  return {
    options: run.options === false ? {} : (run.options ?? {}),
    dir: project.dir,
    distDir: run.distDir ?? '.next',
    root: run.root ?? project.dir,
    ...(run.phase !== undefined && { phase: run.phase }),
    ...(run.isBundlerDir === true && { isBundlerDir: true }),
  }
}

/**
 * Runs `task` with the wrapper's variable set for the project (or unset), then puts it back.
 */
async function withHandoff<Value>(
  project: Project,
  run: PipelineOptions,
  task: () => Promise<Value>,
): Promise<Value> {
  const previous = process.env[HANDOFF_VARIABLE]
  if (run.options === false) delete process.env[HANDOFF_VARIABLE]
  else process.env[HANDOFF_VARIABLE] = encodeHandoff(handoffFor(project, run))
  try {
    return await task()
  } finally {
    if (previous === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = previous
  }
}

/**
 * Processes each sheet in order with one plugin instance and returns the results in the same
 * order.
 */
export async function runSheets(
  project: Project,
  sheets: readonly Sheet[],
  run: PipelineOptions = {},
): Promise<postcss.Result[]> {
  const create = await freshPrunePlugin()
  const processor = postcss([...(run.before ?? []), create(run.entryOptions), ...(run.after ?? [])])
  const results: postcss.Result[] = []
  for (const sheet of sheets) {
    results.push(
      await withHandoff(project, run, () =>
        processor.process(sheet.css, { from: path.join(project.dir, sheet.file) }),
      ),
    )
  }
  return results
}

/**
 * Processes `others` and then core's `atomic.css` with one plugin instance, and returns the
 * result for `atomic.css`.
 */
export async function runAtomic(
  project: Project,
  others: readonly Sheet[] = [],
  run: PipelineOptions = {},
): Promise<postcss.Result> {
  const results = await runSheets(project, [...others, ATOMIC_SHEET], run)
  return results.at(-1)!
}
