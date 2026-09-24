#!/usr/bin/env node
/**
 * Tripwire for the project's bundling-guard coverage.
 *
 * `packages/core/test/no-inlined-dependency.test.ts` asserts a property of `@navecss/core`'s
 * output only. What makes
 * covering just core sufficient is a COMMENT in that test's own header
 * ("core is the only workspace package where this is even possible");
 * nothing asserts the property that makes the comment true. So the set of
 * packages that can bundle a third-party dependency into shipped output is
 * free to grow while the guard stays green — the identical failure shape
 * the licensing steward named in tsup's own `noExternal` default, one
 * level up: an answer resting on a fact that flips without looking like a
 * licensing change to whoever flips it.
 *
 * This script converts the comment into an assertion: it fails when a
 * workspace package can bundle and has no no-inlining guard covering it.
 *
 * A package "can bundle" if it has ANY of:
 *   - a bundler step in its `build` script (tsup, esbuild, rollup, webpack,
 *     parcel, rolldown, ncc, `vite build`);
 *   - a `bin` entry — the thing a bin ships is exactly what a bundler
 *     absorbs the day an argv parser (or anything else) gets `pnpm add`ed;
 *   - a non-workspace runtime dependency (a `dependencies`/`peerDependencies`
 *     entry whose version range does not start with `workspace:`) for a
 *     bundler step to potentially absorb.
 * Deliberately independent of whether the package currently imports
 * anything, or is `private: true`, or actually publishes a tarball today —
 * those are all true of at least one workspace package right now and every
 * one of them can change without looking like a licensing change to
 * whoever changes it, which is exactly the silent-default failure this
 * check exists to catch. The two known, already-scheduled cases this
 * reasoning is built to catch are `@navecss/tokens` at 0.1.0 and `@navecss/cli`
 * today.
 *
 * "Covered" means `packages/<name>/test/no-inlined-dependency.test.ts`
 * exists — the exact instrument shipped for `@navecss/core`,
 * checked by convention and by filename so this stays a filesystem fact,
 * never a judgement call this script makes.
 *
 * This script decides no licensing question and never will: it is an
 * instrument ("both checks are instruments; the
 * answers they surface are the licensing steward's"). Its only job is to make the
 * coverage premise trip instead of rot silently.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = path.join(ROOT, 'packages')

const BUNDLER_PATTERN = /\b(tsup|esbuild|rollup|webpack|parcel|rolldown|ncc|vite\s+build)\b/i

/**
True if `manifest.scripts.build` invokes a known bundler tool.
 */
export function hasBundlerStep(manifest) {
  const build = manifest.scripts?.build
  return typeof build === 'string' && BUNDLER_PATTERN.test(build)
}

/**
True if `manifest.bin` is set, string form or object form.
 */
export function hasBin(manifest) {
  return manifest.bin != null
}

/**
 * True if any `dependencies`/`peerDependencies` entry is a real,
 * potentially-absorbable third-party range rather than a workspace link.
 */
export function hasNonWorkspaceRuntimeDependency(manifest) {
  const deps = { ...manifest.dependencies, ...manifest.peerDependencies }
  return Object.values(deps).some(
    (range) => typeof range === 'string' && !range.startsWith('workspace:'),
  )
}

/**
Reasons `manifest` qualifies as "capable of bundling", empty if none.
 */
export function bundlingCapabilityReasons(manifest) {
  return [
    hasBundlerStep(manifest) && 'bundler step in build script',
    hasBin(manifest) && 'bin entry',
    hasNonWorkspaceRuntimeDependency(manifest) && 'non-workspace runtime dependency',
  ].filter((reason) => reason !== false)
}

/**
Workspace package directory names under `packages/`, sorted for stable output.
 */
function listPackageDirs() {
  return readdirSync(PACKAGES_DIR)
    .filter((entry) => statSync(path.join(PACKAGES_DIR, entry)).isDirectory())
    .sort()
}

/**
 * The green summary must name what was read, not just assert a universal
 * over an unstated set. `read` is every package directory examined; `capable` is the subset
 * `bundlingCapabilityReasons` admitted; `notCapable` is the rest, named rather than dropped, so
 * a reader can see the difference between "checked four and all pass" and "checked one".
 */
export function formatCoverageSummary(read, capable, notCapable) {
  const notCapableClause =
    notCapable.length > 0 ? `; not capable (not examined): ${notCapable.join(', ')}` : ''
  return (
    `Bundling-guard coverage: ${read.length} package(s) read, ${capable.length} capable of ` +
    `bundling, all ${capable.length} have a no-inlining guard${notCapableClause}.`
  )
}

/**
 * Surveys every package for bundling capability and reports any capable package that has no
 * `no-inlined-dependency.test.ts` guard, exiting non-zero if one is found.
 */
function main() {
  const read = []
  const capable = []
  const notCapable = []
  const uncovered = []

  for (const dir of listPackageDirs()) {
    const manifestPath = path.join(PACKAGES_DIR, dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const name = manifest.name ?? dir
    read.push(name)

    const reasons = bundlingCapabilityReasons(manifest)
    if (reasons.length === 0) {
      notCapable.push(name)
      continue
    }
    capable.push(name)

    const guardPath = path.join(PACKAGES_DIR, dir, 'test', 'no-inlined-dependency.test.ts')
    if (!existsSync(guardPath)) {
      uncovered.push({ name, reasons })
    }
  }

  if (uncovered.length > 0) {
    console.error(
      'Packages capable of bundling a third-party dependency have no no-inlining guard:\n',
    )
    for (const { name, reasons } of uncovered) {
      console.error(`  - ${name}: ${reasons.join(', ')}`)
    }
    console.error(
      '\nAdd packages/<name>/test/no-inlined-dependency.test.ts. If <name> has a real bundler step, ' +
        'use packages/core/test/no-inlined-dependency.test.ts as the template; if it only generates ' +
        "output and runs no bundler, core's bundler-shaped check would assert a property with no " +
        'subject there, so use packages/tokens/test/no-inlined-dependency.test.ts as the ' +
        'generator-shaped template instead. If a package now bundles third-party code into what it ' +
        'publishes, or if neither template fits it, that is more than a missing test: do not silence, ' +
        'narrow or work around this check in your pull request, open an issue.',
    )
    process.exitCode = 1
    return
  }

  console.log(formatCoverageSummary(read, capable, notCapable))
}

// Compare REALPATHS on both sides, not `pathToFileURL(...).href`.
// `import.meta.url` is both percent-encoded AND symlink-resolved by Node; `process.argv[1]`
// is neither, so an invocation through a symlinked absolute path (macOS's `/tmp` ->
// `/private/tmp`, for one) makes the two sides disagree even under the fixed
// `pathToFileURL` form — `main()` silently never fires and the script exits 0 having
// printed nothing. `realpathSync` on both sides closes that gap too.
// The `process.argv[1] &&` limb is still load-bearing: `argv[1]` is undefined whenever this
// module is imported rather than run as an entry point.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main()
}
