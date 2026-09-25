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
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
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

export function packCoreTarball(): PackedCoreTarball {
  if (cached) return cached

  const packDestination = mkdtempSync(path.join(tmpdir(), 'nave-core-pack-'))
  const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', packDestination], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const parsed = JSON.parse(raw) as Array<{ filename: string }>
  if (parsed.length === 0) throw new Error('npm pack --json produced no tarball entry')
  const tarballPath = path.join(packDestination, parsed[0]!.filename)

  const fileList = execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0)

  const extractDir = mkdtempSync(path.join(tmpdir(), 'nave-core-extract-'))
  execFileSync('tar', ['-xzf', tarballPath, '-C', extractDir], { encoding: 'utf8' })

  cached = {
    files: fileList,
    read: (relPath: string) => readFileSync(path.join(extractDir, relPath), 'utf8'),
  }
  return cached
}
