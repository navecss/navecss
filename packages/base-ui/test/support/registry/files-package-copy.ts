/**
 * A throwaway copy of the package to run its scripts in: the sources a build reads, the real
 * `node_modules` by symlink (so Base UI, core and Prettier resolve as they do in the package), and
 * the two repository files the package reaches up for (`tsconfig.base.json` and the Prettier
 * config). It lives under the operating system's temporary directory, laid out as the repository
 * is, so the package's own `build` script runs in it unchanged.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { PACKAGE_DIR } from '../stylesheet.ts'

const REPOSITORY_DIR = path.resolve(PACKAGE_DIR, '../..')

const PACKAGE_ENTRIES = [
  'package.json',
  'LICENSE',
  'src',
  'styles',
  'scripts',
  'tsconfig.json',
  'tsconfig.build.json',
] as const
const REPOSITORY_ENTRIES = ['tsconfig.base.json', 'prettier.config.js', 'LICENSE'] as const
const PREFIX = 'nave-base-ui-copy-'

export interface PackageCopy {
  /**
  Removes the copy, leaving the real `node_modules` it links to alone.
   */
  cleanup: () => void
  /**
  The copy of `packages/base-ui`.
   */
  readonly packageDir: string
  /**
  The copy's repository root, the directory that holds `packages/`.
   */
  readonly root: string
}

export interface RunResult {
  readonly output: string
  readonly status: number | null
}

const copyEntry = (from: string, to: string, entry: string): void => {
  cpSync(path.join(from, entry), path.join(to, entry), { recursive: true })
}

/**
 * Makes the copy. Throws when the package has changed shape under it (a missing source entry).
 */
export const makePackageCopy = (): PackageCopy => {
  const temporary = realpathSync(tmpdir())
  const root = mkdtempSync(path.join(temporary, PREFIX))
  const packageDir = path.join(root, 'packages/base-ui')
  mkdirSync(packageDir, { recursive: true })
  for (const entry of PACKAGE_ENTRIES) copyEntry(PACKAGE_DIR, packageDir, entry)
  for (const entry of REPOSITORY_ENTRIES) copyEntry(REPOSITORY_DIR, root, entry)
  symlinkSync(path.join(PACKAGE_DIR, 'node_modules'), path.join(packageDir, 'node_modules'))
  return {
    cleanup: () => {
      removeCopy(root)
    },
    packageDir,
    root,
  }
}

const removeCopy = (root: string): void => {
  if (!path.basename(root).startsWith(PREFIX) || path.dirname(root) !== realpathSync(tmpdir())) {
    throw new Error(`${root} is not a package copy, so it is not removed`)
  }
  // Unlink the link first: what it points at is the real package's `node_modules`.
  unlinkSync(path.join(root, 'packages/base-ui/node_modules'))
  rmSync(root, { force: true, recursive: true })
}

const ONE_RUN_MS = 240_000

/**
 * Runs `node <args>` in the copy's package directory and returns its exit status and its output
 * (both streams, in one string).
 */
export const runNode = (
  copy: PackageCopy,
  args: readonly string[],
  timeout: number = ONE_RUN_MS,
): RunResult => {
  const result = spawnSync(process.execPath, [...args], {
    cwd: copy.packageDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  })
  return { output: `${result.stdout}${result.stderr}`, status: result.status }
}

/**
 * Runs a shell command line in the copy's package directory with the copy's `node_modules/.bin`
 * first on the path, as a package script runs.
 */
export const runScriptLine = (
  copy: PackageCopy,
  line: string,
  timeout: number = ONE_RUN_MS,
): RunResult => {
  const bin = path.join(copy.packageDir, 'node_modules/.bin')
  const result = spawnSync('sh', ['-c', line], {
    cwd: copy.packageDir,
    encoding: 'utf8',
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- the shell's own search path, not a build input
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` },
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  })
  return { output: `${result.stdout}${result.stderr}`, status: result.status }
}

/**
 * Runs one of the package's scripts the way `build` chains them: `node scripts/<name> <args>`.
 */
export const runScript = (
  copy: PackageCopy,
  name: 'build-styles.ts' | 'generate-registry.ts' | 'generate-wrappers.ts',
  args: readonly string[] = [],
): RunResult => runNode(copy, [`scripts/${name}`, ...args])

export const readInCopy = (copy: PackageCopy, relative: string): string =>
  readFileSync(path.join(copy.packageDir, relative), 'utf8')

export const writeInCopy = (copy: PackageCopy, relative: string, text: string): void => {
  const target = path.join(copy.packageDir, relative)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, text)
}

/**
 * Replaces one exact piece of a copied file. Throws when the piece is not there exactly once, so a
 * mutation that stopped applying fails loudly instead of testing nothing.
 */
export const replaceOnceInCopy = (
  copy: PackageCopy,
  relative: string,
  from: string,
  to: string,
): void => {
  const text = readInCopy(copy, relative)
  const parts = text.split(from)
  if (parts.length !== 2) {
    throw new Error(`${relative} holds ${parts.length - 1} copies of ${JSON.stringify(from)}`)
  }
  writeInCopy(copy, relative, parts.join(to))
}
