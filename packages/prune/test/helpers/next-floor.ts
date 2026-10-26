/**
 * A second copy of Next.js at the floor the package supports (16.2.0), installed by npm into a
 * scratch directory of this package the first time a test asks for it, so the real-build rows can
 * run against it beside the workspace's newest `next`. The workspace cannot hold it: its lockfile
 * resolves `next` to a release without the advisories 16.2.0 carries, and a dependency review
 * would refuse the older one.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { removeDirectory, trackDirectory } from './leftovers.ts'
import { pause } from './next-process.ts'

export const FLOOR_VERSION = '16.2.0'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const FLOOR_DIR = path.join(PACKAGE_ROOT, `.nave-next-floor-${FLOOR_VERSION}`)

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
function runNpm(npm: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${npm} ${args.join(' ')} exited ${code}:\n${output}`)),
    )
  })
}

/**
 * Whether the process with this id is running.
 */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // A process of another user answers EPERM: it is there.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Whether the installer that wrote `lockFile` is still running. A lock with no readable id yet is
 * being written, so it is held.
 */
function isHeld(lockFile: string): boolean {
  let pid: number
  try {
    pid = Number(readFileSync(lockFile, 'utf8'))
  } catch {
    return false
  }
  return !Number.isSafeInteger(pid) || isRunning(pid)
}

/**
 * Takes the install lock, a file holding the id of the process that made it, waiting for another
 * test file's worker that holds it. A lock left by an installer that is gone is removed. Resolves
 * to the function that releases the lock, or to nothing when `isDone` turns true while waiting.
 */
async function takeLock(
  lockFile: string,
  isDone: () => boolean,
): Promise<(() => void) | undefined> {
  for (;;) {
    try {
      writeFileSync(lockFile, String(process.pid), { flag: 'wx' })
      return () => rmSync(lockFile, { force: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (isDone()) return undefined
      if (isHeld(lockFile)) await pause(500)
      else rmSync(lockFile, { force: true })
    }
  }
}

/**
 * Installs Next.js into a staging directory beside `floorDir` and moves it into place once npm has
 * finished, so `floorDir` exists only when the install is whole. Whatever an earlier installer
 * left, a staging directory or a tree it did not finish, is replaced.
 */
async function installInto(floorDir: string, npm: string): Promise<void> {
  const staging = `${floorDir}.staging`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  trackDirectory(staging)
  try {
    writeFileSync(
      path.join(staging, 'package.json'),
      JSON.stringify({
        name: 'nave-next-floor',
        private: true,
        dependencies: { next: FLOOR_VERSION, react: '19.2.0', 'react-dom': '19.2.0' },
      }),
    )
    await runNpm(
      npm,
      ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--loglevel=error'],
      staging,
    )
    rmSync(floorDir, { recursive: true, force: true })
    renameSync(staging, floorDir)
  } finally {
    removeDirectory(staging)
  }
}

/**
 * The directory of Next.js 16.2.0 installed under `floorDir` (beside React and React DOM) by the
 * command `npm`, installing it first when `floorDir` has no copy.
 */
export async function floorNextRootIn(floorDir: string, npm = 'npm'): Promise<string> {
  const root = path.join(floorDir, 'node_modules/next')
  const isInstalled = (): boolean => installedVersion(floorDir) === FLOOR_VERSION
  if (isInstalled()) return root
  const release = await takeLock(`${floorDir}.installing`, isInstalled)
  if (release === undefined) return root
  try {
    if (!isInstalled()) await installInto(floorDir, npm)
  } finally {
    release()
  }
  if (!existsSync(root) || !isInstalled()) {
    throw new Error(`could not install next@${FLOOR_VERSION} under ${floorDir}`)
  }
  return root
}

/**
 * The directory of Next.js 16.2.0 this package keeps, installed first when it has no copy.
 */
export function floorNextRoot(): Promise<string> {
  return floorNextRootIn(FLOOR_DIR)
}
