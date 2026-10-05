/**
 * The two Lightning CSS releases the adapter's suites run on: the oldest the documentation
 * supports (1.22.1, installed under an alias) and the newest installed one. The two releases ship
 * type declarations that differ in their own AST, so each is seen here through the few calls the
 * suites make, which are the same on both.
 */
import * as newest from 'lightningcss'
import * as oldest from 'lightningcss-1-22'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LightningResult {
  readonly code: Uint8Array
  readonly map?: Uint8Array
  readonly warnings: readonly unknown[]
}

export interface LightningLib {
  bundleAsync(options: {
    filename: string
    resolver: { read(filePath: string): string }
  }): Promise<LightningResult>
  transform(options: {
    code: Uint8Array
    errorRecovery?: boolean
    filename: string
    inputSourceMap?: string
    sourceMap?: boolean
  }): LightningResult
}

export interface LightningRelease {
  readonly label: string
  readonly lib: LightningLib
  readonly package: string
}

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const LIGHTNING_RELEASES: readonly LightningRelease[] = [
  {
    label: 'the oldest supported release',
    lib: oldest as unknown as LightningLib,
    package: 'lightningcss-1-22',
  },
  {
    label: 'the newest installed release',
    lib: newest as unknown as LightningLib,
    package: 'lightningcss',
  },
]

/**
 * The version `package` has installed, read off its manifest so an alias cannot drift to another
 * release unnoticed.
 */
export function installedVersion(packageName: string): string {
  const manifest = path.join(CORE_ROOT, 'node_modules', packageName, 'package.json')
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version
}
