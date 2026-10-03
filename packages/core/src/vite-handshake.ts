/**
 * The file two invocations of a build share, in `config.cacheDir` (unlike `outDir`, both
 * invocations see it): `vite build && vite build --ssr` runs the client and the server in two
 * processes, and the server's atoms must be in the client's CSS. Whichever runs first writes its
 * set. A client build that runs second unions a server set it finds. A server build that runs
 * second verifies against a client set only when that set is waiting for it (the client build
 * found nothing to union, and no server build has consumed it); otherwise it says it could not.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { compareText } from './vite-problems.ts'

export const HANDSHAKE_FILE = 'nave-used-atoms.json'

export interface PackageRecord {
  /**
   * The atoms collected from the package's readable calls and written classes.
   */
  readonly collected: readonly string[]
  /**
   * `path:line:column` of each call the build could not read.
   */
  readonly unreadable: readonly string[]
}

export interface Handshake {
  /**
   * The atoms the writer emitted, sorted so a diff is stable.
   */
  readonly emitted: readonly string[]
  /**
   * `client`, or the name of the server environment.
   */
  readonly writer: string
  readonly writtenAt: string
  /**
   * Identifies the writing build.
   */
  readonly build: string
  /**
   * Whether the client set has been consumed: a server build verified against it, or the client
   * build itself found a server set to union and so needs no later check.
   */
  readonly consumed: boolean
  readonly keepFor?: Readonly<Record<string, PackageRecord>>
  /**
   * `keepFor` keys that name no package any environment of the writing invocation transformed.
   */
  readonly unmatchedKeepFor?: readonly string[]
}

/**
 * The path of the file for a cache directory.
 */
export function handshakePath(cacheDir: string): string {
  return path.join(cacheDir, HANDSHAKE_FILE)
}

/**
 * The file, or `undefined` when it is missing or not readable as one.
 */
export function readHandshake(cacheDir: string): Handshake | undefined {
  if (cacheDir === '') return undefined
  try {
    const parsed = JSON.parse(readFileSync(handshakePath(cacheDir), 'utf8')) as Partial<Handshake>
    return Array.isArray(parsed.emitted) && typeof parsed.writer === 'string'
      ? (parsed as Handshake)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Writes the file. A cache directory that cannot be written does not fail the build, but the other
 * invocation then cannot share its atoms, so `warn` says so.
 */
export function writeHandshake(
  cacheDir: string,
  fields: Omit<Handshake, 'build' | 'writtenAt'> & Partial<Pick<Handshake, 'build' | 'writtenAt'>>,
  warn?: (message: string) => void,
): void {
  if (cacheDir === '') return
  const handshake: Handshake = {
    ...fields,
    emitted: [...fields.emitted].toSorted(compareText),
    writtenAt: fields.writtenAt ?? new Date().toISOString(),
    build: fields.build ?? randomUUID(),
  }
  try {
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(handshakePath(cacheDir), `${JSON.stringify(handshake, undefined, 2)}\n`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    warn?.(
      `navePlugin(): could not write ${handshakePath(cacheDir)} (${reason}), so a build of the client and a build of the server run as two processes cannot share their atoms.`,
    )
  }
}
