/**
 * Packs the real `@navecss/core` tarball with `npm pack` (never a `dist/` walk or a working-tree
 * read) and extracts it, so a test can assert against exactly what a consumer installs, per the
 * repository's own packed-set convention (`scripts/check-no-orphaned-chunks.mjs`'s header
 * comment). Real, not `--dry-run`: AC-05 and AC-06 need actual bytes on disk (a consumer's
 * `vscode-css-languageservice` reads a file, not a JSON manifest entry).
 *
 * Cached for the lifetime of the test process: every test that needs the tarball wants the SAME
 * one, and packing plus extracting is the expensive part (a subprocess spawn each), not the
 * assertions that follow.
 */
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export interface PackedCoreTarball {
  /** Every path `tar` reports inside the tarball, `package/`-prefixed, as npm packs it. */
  readonly files: readonly string[]
  /** Reads one packed file's bytes as utf8, given its `package/`-relative path. */
  read(relPath: string): string
}

let cached: PackedCoreTarball | undefined

/**
 * The tarball filename `npm pack --json` reports for its first entry, reading BOTH reply shapes:
 * npm 11 and earlier answer with an array of tarball entries, npm 12 answers with an object
 * keyed by package name (mirrors `scripts/check-no-orphaned-chunks.mjs`'s `tarballEntries` — the
 * release workflow pins npm 12 while local and pull-request runs use npm 11, so both are real).
 * `parsed[0]!.filename` alone reads only the first shape and crashes with a bare `TypeError`
 * under the second, since an array index into an object is always `undefined`.
 */
export function tarballFilename(raw: string): string {
  const parsed: unknown = JSON.parse(raw)
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object'
      ? Object.values(parsed)
      : []
  const entry: unknown = entries[0]
  if (entry === null || typeof entry !== 'object') {
    throw new Error('npm pack --json produced no tarball entry')
  }
  const filename = (entry as { filename?: unknown }).filename
  if (typeof filename !== 'string') {
    throw new Error('npm pack --json produced a tarball entry with no filename')
  }
  return filename
}

/**
 * Runs `command` (always `npm` or `tar`, never taken from input) resolved from PATH.
 *
 * NOSONAR on the one spawn line below (rule S4036, PATH-resolved executable): resolving the tool
 * from PATH is deliberate, same as `scripts/stage-release.mjs`'s `runTool` — a test that packs
 * with an absolute path would not be packing with the developer's or CI's own installed npm/tar,
 * which is exactly the toolchain a consumer's install uses too.
 */
function runTool(
  command: string,
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  return execFileSync(command, args, options) // NOSONAR
}

export function packCoreTarball(): PackedCoreTarball {
  if (cached) return cached

  const packDestination = mkdtempSync(path.join(tmpdir(), 'nave-core-pack-'))
  const raw = runTool('npm', ['pack', '--json', '--pack-destination', packDestination], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const tarballPath = path.join(packDestination, tarballFilename(raw))

  const fileList = runTool('tar', ['-tzf', tarballPath], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0)

  const extractDir = mkdtempSync(path.join(tmpdir(), 'nave-core-extract-'))
  runTool('tar', ['-xzf', tarballPath, '-C', extractDir], { encoding: 'utf8' })

  // The packed tarball itself is no longer needed once extracted; the extraction copy is what
  // every `read()` call serves from.
  rmSync(packDestination, { recursive: true, force: true })
  process.once('exit', () => {
    rmSync(extractDir, { recursive: true, force: true })
  })

  cached = {
    files: fileList,
    read: (relPath: string) => readFileSync(path.join(extractDir, relPath), 'utf8'),
  }
  return cached
}
