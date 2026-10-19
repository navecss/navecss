/**
 * The real-build app as one workspace of a monorepo: a top holding a pnpm workspace config and a
 * lockfile, the app at `apps/web`, and a workspace package `@acme/ui` at `packages/ui`, linked
 * into the app's `node_modules` the way pnpm links a workspace package, whose only module calls
 * `cx()`. The app's page renders the class that module computes.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { NextApp } from './next-app.ts'

import { CORE_ROOT, createNextApp } from './next-app.ts'

const PAGE = [
  "import { look } from '@acme/ui'",
  '',
  'export default function Page() {',
  '  return <div id="t" className={look} />',
  '}',
  '',
].join('\n')

export interface MonorepoApp extends NextApp {
  /**
   * Replaces the `cx()` call in `packages/ui`'s module with `cx(<atom>)`.
   */
  readonly lookAt: (atom: string) => void
  /**
   * `packages/ui`'s module, absolute.
   */
  readonly uiModule: string
}

/**
 * Writes `files` relative to `dir`, creating directories.
 */
function writeIn(dir: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    const target = path.join(dir, name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
}

/**
 * The module of `packages/ui`, calling `cx(<atom>)`.
 */
function uiModuleText(atom: string): string {
  return `import { cx } from '@navecss/core/cx'\n\nexport const look = cx('${atom}')\n`
}

/**
 * Creates the monorepo, with `packages/ui` calling `cx('grid')`.
 */
export function createMonorepoApp(): MonorepoApp {
  const app = createNextApp()
  const ui = path.join(app.top, 'packages/ui')
  writeIn(app.top, {
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
    'packages/ui/index.js': uiModuleText('grid'),
  })
  mkdirSync(path.join(ui, 'node_modules/@navecss'), { recursive: true })
  symlinkSync(CORE_ROOT, path.join(ui, 'node_modules/@navecss/core'), 'dir')
  mkdirSync(path.join(app.dir, 'node_modules/@acme'), { recursive: true })
  symlinkSync('../../../../packages/ui', path.join(app.dir, 'node_modules/@acme/ui'), 'dir')
  app.write({ 'app/page.jsx': PAGE })
  const uiModule = path.join(ui, 'index.js')
  return {
    ...app,
    uiModule,
    lookAt: (atom) => writeFileSync(uiModule, uiModuleText(atom)),
  }
}
