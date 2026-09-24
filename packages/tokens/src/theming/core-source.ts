/**
 * NAVE'S OWN core-source scan and the manifest built from it. This is the monorepo-relative
 * half of the build: it resolves paths OUTSIDE this package (`../../../core`) and reads them
 * from disk, so it belongs only to `build-step.ts`'s path and never to the consumer-invocable
 * one, which R9 requires to be context-free.
 *
 * R27: `@navecss/core`'s real colour-usage source is the scan target — the contract is
 * DERIVED from core's own usage, never hand-written.
 * R28: the contract additionally ships as a machine-readable manifest, for the
 * consumer-invocable build's validator to read directly rather than re-deriving its own copy.
 * R13/R14: the manifest carries the core package version it was SCANNED from, read
 * here at Nave's own build time, so the consumer-side validator can detect version skew.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CoreContractManifest } from './core-contract.ts'

import {
  assertContractPreconditions,
  buildManifest,
  discoverSourceFiles,
  scanCoreContractFromDisk,
} from './core-contract.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// @navecss/core's real source directory (a directory, discovered by rule, never a
// hardcoded file list — see `discoverSourceFiles`'s own doc).
const CORE_SRC_DIR = path.resolve(HERE, '../../../core/src')

const CORE_PACKAGE_JSON_PATH = path.resolve(HERE, '../../../core/package.json')

/**
 * Scans core's real source and composes the shipped manifest, stamped with the core package
 * version it was scanned from. Every read happens HERE, inside the function body: nothing in
 * this module touches the filesystem at module load. R31: refuses (throws, writes nothing)
 * if the scan's own preconditions do not hold — see `assertContractPreconditions`.
 */
export function buildCoreContractManifest(): CoreContractManifest {
  const corePackage = JSON.parse(readFileSync(CORE_PACKAGE_JSON_PATH, 'utf8')) as {
    name: string
    version: string
  }
  const files = discoverSourceFiles(CORE_SRC_DIR)
  const rawSourceText = files.map((p) => readFileSync(p, 'utf8')).join('\n')
  const tokens = scanCoreContractFromDisk(files)
  assertContractPreconditions(tokens, rawSourceText)
  return buildManifest(tokens, {
    name: corePackage.name,
    version: corePackage.version,
  })
}
