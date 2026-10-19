/**
 * A scratch Next.js-shaped project on disk, and the PostCSS plugin run over core's own
 * `atomic.css` the way a bundler runs it, with the wrapper's environment variable set the way
 * `withNave()` sets it. No bundler runs: this is the plugin's contract on its own.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'

import type { Handoff } from '../../src/handoff.ts'
import type { NaveOptions } from '../../src/options.ts'
import type { PruneRecord } from '../../src/record.ts'

import { encodeHandoff, HANDOFF_VARIABLE } from '../../src/handoff.ts'
import { prunePlugin } from '../../src/postcss.ts'
import { readRecord } from '../../src/record.ts'

export const CORE_ROOT = path.resolve(import.meta.dirname, '../../../core')
export const ATOMIC_CSS = readFileSync(path.join(CORE_ROOT, 'dist/atomic.css'), 'utf8')

const DEFAULT_FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'app', private: true }),
  'tsconfig.json': JSON.stringify({
    compilerOptions: { jsx: 'preserve', baseUrl: '.', paths: { '@/*': ['./*'] } },
  }),
  'next.config.ts': 'export default {}\n',
  'postcss.config.mjs': "export default { plugins: { '@navecss/prune/postcss': {} } }\n",
}

export interface Project {
  /**
   * The project directory, symlinks resolved.
   */
  readonly dir: string
  readonly remove: () => void
  /**
   * Writes files relative to the project directory, creating directories.
   */
  readonly write: (files: Record<string, string>) => void
  /**
   * Installs a package under `node_modules`; `files` are relative to the package directory.
   */
  readonly install: (name: string, files: Record<string, string>) => string
}

/**
 * Creates the project directory with core linked into its `node_modules`, the default config
 * files, and `files` on top of them. With `name`, the project is a directory of that name inside
 * the scratch directory, so a test can choose what its path holds.
 */
export function createProject(files: Record<string, string> = {}, name?: string): Project {
  const made = mkdtempSync(path.join(tmpdir(), 'prune-'))
  const top = realpathSync(made)
  const dir = name === undefined ? top : path.join(top, name)
  const write = (more: Record<string, string>): void => {
    for (const [name, text] of Object.entries(more)) {
      const target = path.join(dir, name)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, text)
    }
  }
  const install = (name: string, packageFiles: Record<string, string>): string => {
    const root = path.join(dir, 'node_modules', name)
    for (const [file, text] of Object.entries(packageFiles)) {
      const target = path.join(root, file)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, text)
    }
    return root
  }
  mkdirSync(path.join(dir, 'node_modules/@navecss'), { recursive: true })
  symlinkSync(CORE_ROOT, path.join(dir, 'node_modules/@navecss/core'), 'dir')
  write({ ...DEFAULT_FILES, ...files })
  return { dir, remove: () => rmSync(top, { recursive: true, force: true }), write, install }
}

export interface RunOptions {
  /**
   * The options `withNave()` was called with; `false` runs the plugin with the variable unset.
   */
  readonly options?: NaveOptions | false
  readonly distDir?: string
  readonly root?: string
  /**
   * The phase Next.js called a function config with; absent for an object config.
   */
  readonly phase?: string
  /**
   * The stylesheet to process; core's `atomic.css` when omitted.
   */
  readonly css?: string
  /**
   * The file the stylesheet is said to come from; core's `atomic.css` in the project's
   * `node_modules` when omitted.
   */
  readonly from?: string
  /**
   * Plugins listed before the Nave plugin, in the PostCSS config's order.
   */
  readonly before?: readonly postcss.AcceptedPlugin[]
  /**
   * The options object listed on the PostCSS entry.
   */
  readonly entryOptions?: object
}

/**
 * The handoff `withNave()` would leave in the environment for these run options.
 */
function handoffFor(project: Project, run: RunOptions): Handoff {
  return {
    options: run.options === false ? {} : (run.options ?? {}),
    dir: project.dir,
    distDir: run.distDir ?? '.next',
    root: run.root ?? project.dir,
    ...(run.phase !== undefined && { phase: run.phase }),
  }
}

/**
 * Runs the Nave PostCSS plugin over core's `atomic.css` (or `run.css`) as a bundler would, with
 * the wrapper's environment variable set (or unset, for `options: false`) for the run.
 */
export async function runPlugin(project: Project, run: RunOptions = {}): Promise<postcss.Result> {
  const previous = process.env[HANDOFF_VARIABLE]
  if (run.options === false) delete process.env[HANDOFF_VARIABLE]
  else process.env[HANDOFF_VARIABLE] = encodeHandoff(handoffFor(project, run))
  try {
    const from = run.from ?? path.join(project.dir, 'node_modules/@navecss/core/dist/atomic.css')
    const plugins = [...(run.before ?? []), prunePlugin(run.entryOptions)]
    return await postcss(plugins).process(run.css ?? ATOMIC_CSS, { from })
  } finally {
    if (previous === undefined) delete process.env[HANDOFF_VARIABLE]
    else process.env[HANDOFF_VARIABLE] = previous
  }
}

/**
 * The record the last plugin run left under `<distDir>/cache`.
 */
export function recordOf(project: Project, distDir = '.next'): PruneRecord {
  const record = readRecord({ dir: project.dir, distDir })
  if (!record) throw new Error(`no record under ${distDir}/cache in ${project.dir}`)
  return record
}
