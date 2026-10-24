import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
/**
 * A pnpm workspace on disk for the real-build rows: the lockfile at the top, the app at
 * `apps/web`, a workspace package `@acme/ui` at `packages/ui` that calls `cx('gap')`, linked into
 * the app's `node_modules` the way pnpm links one. Two more states are built on it: a dependency
 * `bad-lib` installed in the store at the top whose code holds three calls the build cannot read,
 * and a module outside the workspace that a tsconfig `paths` entry reaches.
 *
 * The app also carries a probe: a PostCSS plugin listed after the package's, which writes what the
 * package left in `result.messages` and the hand-off variable it ran with to a log, so a row can
 * read what a real build was given.
 *
 * The scratch directory lies inside this repository, so the workspace root Next.js infers for the
 * app is the repository's own, not the fixture's top: the fixture's top is where `next` is
 * started from, and `root` is the directory Turbopack uses.
 */
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { NextApp } from './next-app.ts'
import type { PageState, Probe } from './workspace-parts.ts'

import { CORE_ROOT, createNextApp } from './next-app.ts'
import {
  installBadLib,
  linkAs,
  linkTypeScript,
  moduleCalling,
  pageText,
  postcssConfig,
  readProbes,
  SCRATCH_PACKAGE,
  tsconfigText,
  writeIn,
  writeProbe,
  writeScratchPlugin,
} from './workspace-parts.ts'

export type { Probe } from './workspace-parts.ts'

const CONFIG = [
  "import { withNave } from '@navecss/prune'",
  '',
  'export default withNave({ typescript: { ignoreBuildErrors: true } })',
  '',
].join('\n')

export interface WorkspaceApp extends NextApp {
  /**
   * Makes the page also call `cx(variant)`, a call no build can read.
   */
  readonly callVariable: () => void
  /**
   * Forgets what the probe saw so far.
   */
  readonly clearProbes: () => void
  /**
   * The module outside the workspace, absolute.
   */
  readonly external: string
  /**
   * Makes the module outside the workspace call `cx(<atom>)`.
   */
  readonly externalAt: (atom: string) => void
  /**
   * Replaces the `cx()` call in `packages/ui`'s module with `cx(<atom>)`.
   */
  readonly lookAt: (atom: string) => void
  /**
   * The scratch directory outside the workspace that `@ext/*` points at.
   */
  readonly outside: string
  /**
   * What the probe saw, one entry per stylesheet the package finished with, oldest first.
   */
  readonly probes: () => Probe[]
  /**
   * The root Next.js infers for the app, by its own search: the directory Turbopack reads files
   * within when `turbopack.root` is unset.
   */
  readonly root: string
  /**
   * `packages/ui`'s module, absolute.
   */
  readonly uiModule: string
  /**
   * The state with `bad-lib` installed in the store at the top and imported by the page.
   */
  readonly useBadLib: () => void
  /**
   * The state with the module outside the workspace imported by the page, calling `cx(<atom>)`.
   */
  readonly useExternal: (atom: string) => void
  /**
   * Lists a scratch copy of the package's PostCSS plugin in place of the package's own: every
   * `dist` module copied as it is, except that in `file` the text `from` is replaced by `to`.
   */
  readonly useScratchPlugin: (patch: {
    readonly file: string
    readonly from: string
    readonly to: string
  }) => void
}

interface FindRoot {
  readonly findRootDirAndLockFiles: (dir: string) => { readonly rootDir: string }
}

/**
 * The root Next.js infers for `dir`, by the `next` linked into it.
 */
function inferredRoot(dir: string): string {
  const load = createRequire(path.join(dir, 'package.json'))
  const find = load('next/dist/lib/find-root.js') as FindRoot
  return find.findRootDirAndLockFiles(dir).rootDir
}

/**
 * Writes the workspace around the app: the top's manifest and lockfile, and `packages/ui`.
 */
function writeWorkspace(top: string, modules: string): void {
  const ui = path.join(top, 'packages/ui')
  writeIn(top, {
    'package.json': JSON.stringify({ name: 'acme', private: true }),
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    'packages/ui/package.json': JSON.stringify({
      name: '@acme/ui',
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
      dependencies: { '@navecss/core': 'workspace:*' },
    }),
    'packages/ui/index.js': moduleCalling('look', 'gap'),
  })
  linkAs(path.join(ui, 'node_modules/@navecss/core'), CORE_ROOT)
  linkAs(path.join(modules, '@acme/ui'), '../../../../packages/ui')
}

/**
 * Creates the workspace with `packages/ui` calling `cx('gap')`, on the `next` at `nextRoot`.
 */
export function createWorkspaceApp(nextRoot?: string): WorkspaceApp {
  const app = createNextApp(CONFIG, nextRoot === undefined ? {} : { nextRoot })
  const made = mkdtempSync(path.join(tmpdir(), 'prune-outside-'))
  const outside = realpathSync(made)
  const modules = path.join(app.dir, 'node_modules')
  const log = path.join(app.dir, 'probe.log')
  const uiModule = path.join(app.top, 'packages/ui/index.js')
  const external = path.join(outside, 'x.ts')
  const state: PageState = { hasBadLib: false, hasExternal: false, hasVariable: false }
  const writePage = (): void => app.write({ 'app/page.tsx': pageText(state) })
  writeWorkspace(app.top, modules)
  linkTypeScript(modules)
  linkAs(path.join(outside, 'node_modules/@navecss/core'), CORE_ROOT)
  writeProbe(modules, log)
  app.delete('jsconfig.json')
  app.delete('app/page.jsx')
  app.write({
    'tsconfig.json': tsconfigText(app.dir, outside),
    'postcss.config.mjs': postcssConfig('@navecss/prune/postcss'),
  })
  writePage()
  writeFileSync(external, moduleCalling('hidden', 'hidden'))
  return {
    ...app,
    external,
    outside,
    uiModule,
    root: inferredRoot(app.dir),
    callVariable: () => {
      state.hasVariable = true
      writePage()
    },
    clearProbes: () => rmSync(log, { force: true }),
    externalAt: (atom) => writeFileSync(external, moduleCalling('hidden', atom)),
    lookAt: (atom) => writeFileSync(uiModule, moduleCalling('look', atom)),
    probes: () => readProbes(log),
    useBadLib: () => {
      installBadLib(app.top, modules)
      state.hasBadLib = true
      writePage()
    },
    useExternal: (atom) => {
      writeFileSync(external, moduleCalling('hidden', atom))
      state.hasExternal = true
      writePage()
    },
    useScratchPlugin: (patch) => {
      writeScratchPlugin(modules, patch)
      app.write({ 'postcss.config.mjs': postcssConfig(`${SCRATCH_PACKAGE}/postcss`) })
    },
    remove: async () => {
      await app.remove()
      rmSync(outside, { recursive: true, force: true })
    },
  }
}
