/**
 * Reads the core-contract manifest from THIS package's own `dist/`, never a consumer's output
 * dir (R14). Split out of `facade.ts` to keep that file under this repo's file-length lint.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { CoreContractManifest } from './theming/core-contract.ts'

import { UsageError } from './errors.ts'
import { findPackageRoot } from './package-root.ts'

const PACKAGE_ROOT = findPackageRoot(import.meta.url)

/**
 * A missing manifest means THIS package's own install is broken (`dist/` did not build, or
 * was stripped), never something the caller's `build`/`validate` arguments could have caused —
 * so a raw `ENOENT` naming a path inside `node_modules` is a `UsageError` (R4), not a merits
 * failure the caller has any argument to fix.
 */
export async function readManifest(): Promise<CoreContractManifest> {
  let raw: string
  try {
    raw = await readFile(path.join(PACKAGE_ROOT, 'dist', 'core-contract.json'), 'utf8')
  } catch (error) {
    throw new UsageError(
      `could not read this package's own dist/core-contract.json: ${(error as Error).message}. ` +
        'This is a broken install of @navecss/tokens, not something your build/validate ' +
        'arguments can fix — reinstall the package.',
    )
  }
  return JSON.parse(raw) as CoreContractManifest
}
