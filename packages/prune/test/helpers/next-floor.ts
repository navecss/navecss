/**
 * A second copy of Next.js at the floor the package supports (16.2.0), installed by npm into a
 * scratch directory of this package the first time a test asks for it, so the real-build rows can
 * run against it beside the workspace's newest `next`. The workspace cannot hold it: its lockfile
 * resolves `next` to a release without the advisories 16.2.0 carries, and a dependency review
 * would refuse the older one.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { pause } from './next-process.ts'

export const FLOOR_VERSION = '16.2.0'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const FLOOR_DIR = path.join(PACKAGE_ROOT, `.nave-next-floor-${FLOOR_VERSION}`)
const LOCK_DIR = `${FLOOR_DIR}.lock`

/**
 * The version of the `next` installed under `directory`, or `undefined` when none is.
 */
function installedVersion(directory: string): string | undefined {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(directory, 'node_modules/next/package.json'), 'utf8'),
    ) as { version: string }
    return manifest.version
  } catch {
    return
  }
}

/**
 * Runs npm in `cwd` to its exit, rejecting with its output on a non-zero code.
 */
function runNpm(args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`npm ${args.join(' ')} exited ${code}:\n${output}`)),
    )
  })
}

/**
 * Takes the install lock, waiting for another test file's worker that holds it.
 */
async function lock(): Promise<void> {
  for (;;) {
    try {
      mkdirSync(LOCK_DIR)
      return
    } catch {
      if (installedVersion(FLOOR_DIR) === FLOOR_VERSION) return
      await pause(1000)
    }
  }
}

/**
 * The directory of Next.js 16.2.0, installed beside React and React DOM, installing it first when
 * this package has no copy.
 */
export async function floorNextRoot(): Promise<string> {
  const root = path.join(FLOOR_DIR, 'node_modules/next')
  if (installedVersion(FLOOR_DIR) === FLOOR_VERSION) return root
  await lock()
  try {
    if (installedVersion(FLOOR_DIR) !== FLOOR_VERSION) {
      mkdirSync(FLOOR_DIR, { recursive: true })
      writeFileSync(
        path.join(FLOOR_DIR, 'package.json'),
        JSON.stringify({
          name: 'nave-next-floor',
          private: true,
          dependencies: { next: FLOOR_VERSION, react: '19.2.0', 'react-dom': '19.2.0' },
        }),
      )
      await runNpm(
        ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--loglevel=error'],
        FLOOR_DIR,
      )
    }
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true })
  }
  if (!existsSync(root) || installedVersion(FLOOR_DIR) !== FLOOR_VERSION) {
    throw new Error(`could not install next@${FLOOR_VERSION} under ${FLOOR_DIR}`)
  }
  return root
}
