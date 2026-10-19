/**
 * A real Next.js app on disk, built and served by the `next` the workspace installed, with this
 * package and core linked into its `node_modules`. The app lives inside the package directory
 * rather than the system's temporary directory, because Turbopack reads only files under its
 * root, and the root it finds (the directory holding the workspace's lockfile) has to hold the
 * app, the packages it links and the store `next` and React are installed in.
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import type { PruneRecord } from '../../src/record.ts'
import type { DevServer } from './next-dev.ts'

import { readRecord } from '../../src/record.ts'
import { startDev } from './next-dev.ts'
import { NEXT_ROOT, nextCommand, nextEnvironment, PACKAGE_ROOT } from './next-process.ts'

export const CORE_ROOT = path.resolve(PACKAGE_ROOT, '../core')

/**
 * Why the real-build tests cannot run here, or `undefined` when they can.
 */
export const SKIP_REASON: string | undefined = (() => {
  if (NEXT_ROOT === undefined) return 'next is not installed for this package'
  if (!existsSync(path.join(NEXT_ROOT, '..', 'react'))) return 'react is not installed beside next'
  if (!existsSync(path.join(PACKAGE_ROOT, 'dist/postcss.js'))) return 'this package is not built'
  if (!existsSync(path.join(CORE_ROOT, 'dist/atomic.css'))) return '@navecss/core is not built'
  return
})()

/**
 * Whether a package is installed beside `next`, as its optional peers are.
 */
export function isBesideNext(name: string): boolean {
  return NEXT_ROOT !== undefined && existsSync(path.join(NEXT_ROOT, '..', name))
}

/**
 * The browser floor core's README gives for Next.js, read from the README.
 */
function readmeFloor(): string[] {
  const readme = readFileSync(path.join(CORE_ROOT, 'README.md'), 'utf8')
  const section = readme.slice(readme.indexOf('#### Next.js'))
  const list = /"browserslist":\s*(\[[^\]]*\])/.exec(section)?.[1]
  if (list === undefined) throw new Error("no browserslist in core's README Next.js section")
  return JSON.parse(list) as string[]
}

/**
 * The app's files: core's stylesheets imported from the root layout, and a page calling `cx()`.
 */
function appFiles(nextConfig: string): Record<string, string> {
  return {
    'package.json': JSON.stringify({ name: 'web', private: true, browserslist: readmeFloor() }),
    'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
    'postcss.config.mjs': "export default { plugins: { '@navecss/prune/postcss': {} } }\n",
    'next.config.mjs': nextConfig,
    'app/globals.css': "@import url('@navecss/core/layers');\n@import url('@navecss/core');\n",
    'app/layout.jsx': [
      "import './globals.css'",
      '',
      'export default function RootLayout({ children }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>{children}</body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n'),
    'app/page.jsx': [
      "import { cx } from '@navecss/core/cx'",
      '',
      'export default function Page() {',
      '  return <div id="t" className={cx(\'flex\')} />',
      '}',
      '',
    ].join('\n'),
  }
}

const WRAPPED_CONFIG = [
  "import { withNave } from '@navecss/prune'",
  '',
  'export default withNave({})',
  '',
].join('\n')

export interface Run {
  readonly code: number | null
  /**
   * stdout and stderr together.
   */
  readonly output: string
}

export interface NextApp {
  /**
   * The directory a monorepo's commands run from: the app is `apps/web` inside it.
   */
  readonly top: string
  /**
   * The app's directory, holding `next.config`.
   */
  readonly dir: string
  readonly write: (files: Record<string, string>) => void
  /**
   * Links a package installed beside `next` (one of its optional peers, such as `sass`) into the
   * app's `node_modules`.
   */
  readonly linkBesideNext: (name: string) => void
  /**
   * Deletes a file or directory relative to the app's directory.
   */
  readonly delete: (file: string) => void
  /**
   * Runs `next` with `args`, from `cwd` (the app's directory when omitted).
   */
  readonly next: (args: readonly string[], cwd?: string) => Promise<Run>
  /**
   * Starts `next dev` with `args` (a port is added), from `cwd`.
   */
  readonly dev: (args: readonly string[], cwd?: string) => Promise<DevServer>
  /**
   * The record the plugin left under `<dir>/.next/cache`, if any.
   */
  readonly record: (dir?: string) => PruneRecord | undefined
  /**
   * Every CSS file the build wrote under `.next/static`, concatenated.
   */
  readonly builtCss: () => string
  /**
   * Stops every dev server the app started, then deletes the app: a test that timed out leaves
   * none running.
   */
  readonly remove: () => Promise<void>
}

/**
 * Links a package directory into `node_modules`.
 */
function link(modules: string, name: string, target: string): void {
  const at = path.join(modules, name)
  mkdirSync(path.dirname(at), { recursive: true })
  symlinkSync(target, at, 'dir')
}

/**
 * Runs the installed `next` with `args` in `cwd` to its exit.
 */
function runNext(args: readonly string[], cwd: string): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, nextCommand(args), {
      cwd,
      env: nextEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, output }))
  })
}

/**
 * Every CSS file under `directory`, concatenated, in path order.
 */
function cssUnder(directory: string): string {
  if (!existsSync(directory)) return ''
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted((a, b) => a.localeCompare(b))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
}

/**
 * Creates the app at `apps/web` inside a scratch directory under this package, with `next`,
 * React, core and this package linked into its `node_modules`.
 * @param nextConfig The text of `next.config.mjs`; `withNave({})` when omitted.
 */
export function createNextApp(nextConfig: string = WRAPPED_CONFIG): NextApp {
  const top = realpathSync(mkdtempSync(path.join(PACKAGE_ROOT, '.nave-next-')))
  const dir = path.join(top, 'apps/web')
  const write = (files: Record<string, string>): void => {
    for (const [name, text] of Object.entries(files)) {
      const target = path.join(dir, name)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, text)
    }
  }
  write(appFiles(nextConfig))
  const servers: DevServer[] = []
  const modules = path.join(dir, 'node_modules')
  const next = NEXT_ROOT
  if (next === undefined) throw new Error('next is not installed for this package')
  link(modules, 'next', next)
  link(modules, 'react', path.join(next, '..', 'react'))
  link(modules, 'react-dom', path.join(next, '..', 'react-dom'))
  link(modules, '@navecss/core', CORE_ROOT)
  link(modules, '@navecss/prune', PACKAGE_ROOT)
  return {
    top,
    dir,
    write,
    linkBesideNext: (name) => link(modules, name, path.join(next, '..', name)),
    delete: (file) => rmSync(path.join(dir, file), { recursive: true, force: true }),
    next: (args, cwd = dir) => runNext(args, cwd),
    dev: async (args, cwd = dir) => {
      const server = await startDev(args, cwd)
      servers.push(server)
      return server
    },
    record: (at = dir) => readRecord({ dir: at, distDir: '.next' }),
    builtCss: () => cssUnder(path.join(dir, '.next/static')),
    remove: async () => {
      for (const server of servers) await server.stop()
      rmSync(top, { recursive: true, force: true })
    },
  }
}
