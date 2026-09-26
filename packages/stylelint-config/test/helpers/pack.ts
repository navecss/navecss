/**
 * Packs the real `@navecss/stylelint-config` tarball with `npm pack` (never a working-tree
 * read) and extracts it, so a test can assert against exactly what a consumer installs. Same
 * shape as `packages/core/test/helpers/pack-core.ts`, adapted for this package's own name.
 *
 * Cached for the lifetime of the test process: every test that needs the tarball wants the SAME
 * one, and packing plus extracting is the expensive part.
 */
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export interface PackedTarball {
  /**
  Every path `tar` reports inside the tarball, `package/`-prefixed, as npm packs it.
   */
  readonly files: readonly string[]
  /**
  Reads one packed file's bytes as utf8, given its `package/`-relative path.
   */
  read(relPath: string): string
}

const cache: { value?: PackedTarball } = {}

/**
The first tarball entry `npm pack --json` reports, whichever of the two reply shapes it used.
 */
function firstTarballEntry(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed[0]
  if (parsed !== null && typeof parsed === 'object') return Object.values(parsed)[0]
  return undefined
}

/**
 * The tarball filename `npm pack --json` reports for its first entry, reading BOTH reply
 * shapes (npm 11's array and npm 12's object), per `packages/core/test/helpers/pack-core.ts`'s
 * own `tarballFilename`.
 */
export function tarballFilename(raw: string): string {
  const entry = firstTarballEntry(JSON.parse(raw))
  if (entry === null || typeof entry !== 'object') {
    throw new Error('npm pack --json produced no tarball entry')
  }
  const filename = (entry as { filename?: unknown }).filename
  if (typeof filename !== 'string') {
    throw new TypeError('npm pack --json produced a tarball entry with no filename')
  }
  return filename
}

/**
 * Runs `command` (always `npm` or `tar`, never taken from input) resolved from PATH.
 *
 * NOSONAR on the one spawn line below (rule S4036, PATH-resolved executable): resolving the
 * tool from PATH is deliberate: a test that packs with an absolute path would not be packing
 * with the developer's or CI's own installed npm/tar, which is exactly the toolchain a
 * consumer's install uses too.
 */
function runTool(
  command: string,
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  return execFileSync(command, args, options) // NOSONAR
}

/**
Packs, extracts and caches the real tarball; returns the cached copy on later calls.
 */
export function packTarball(): PackedTarball {
  if (cache.value) return cache.value

  const packDestination = mkdtempSync(path.join(tmpdir(), 'nave-stylelint-config-pack-'))
  const extractDir = mkdtempSync(path.join(tmpdir(), 'nave-stylelint-config-extract-'))
  process.once('exit', () => {
    rmSync(extractDir, { recursive: true, force: true })
  })
  let fileList: string[]
  try {
    const raw = runTool('npm', ['pack', '--json', '--pack-destination', packDestination], {
      cwd: PACKAGE_DIR,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const tarballPath = path.join(packDestination, tarballFilename(raw))

    fileList = runTool('tar', ['-tzf', tarballPath], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.length > 0)

    runTool('tar', ['-xzf', tarballPath, '-C', extractDir], { encoding: 'utf8' })
  } finally {
    rmSync(packDestination, { recursive: true, force: true })
  }

  cache.value = {
    files: fileList,
    read: (relPath: string) => readFileSync(path.join(extractDir, relPath), 'utf8'),
  }
  return cache.value
}
