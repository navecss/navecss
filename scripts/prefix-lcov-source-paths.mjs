#!/usr/bin/env node
/**
 * Rewrites each package's `coverage/lcov.info` `SF:` (source file) lines from a path relative to
 * that PACKAGE's own directory to a path relative to the REPOSITORY root, in place.
 *
 * Vitest's v8 coverage provider writes `SF:` lines relative to the vitest root, which is each
 * package's own directory (each package runs its own `vitest.config.ts` from its own root).
 * SonarCloud resolves every `SF:` line against `sonar.sources`, which is rooted at the
 * repository root, not at any one package. Left unprefixed, two packages whose source trees ever
 * share a relative path (nothing stops two packages from both having a `src/index.ts`) collide:
 * Sonar attributes both files' coverage to whichever `SF:` line it reads for that path, and the
 * other package silently reads 0% coverage under a scan that still reports green. This is a
 * documented failure mode of lcov-based coverage in JS/TS monorepos, not specific to this repo.
 *
 * This script decides no product or process question: it is a mechanical rewrite, run once per
 * named package directory after that package's `test:coverage` has produced its `coverage/lcov.info`,
 * and before the Sonar scan step reads it.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The package directories whose `coverage/lcov.info` this rewrites when run as a script. Each
 * one is expected to have already produced coverage (its own `test:coverage` script ran first).
 * Kept in sync with `sonar.javascript.lcov.reportPaths` in `sonar-project.properties` (see that
 * file's comment for which packages are excluded, and why).
 */
const PACKAGE_DIRS = ['packages/core', 'packages/tokens']

/**
Rewrites every `SF:<path>` line in `content` to `SF:<prefix>/<path>` (POSIX-joined). Every other line passes through unchanged.
 */
export function prefixLcovSourcePaths(content, prefix) {
  return content
    .split('\n')
    .map((line) => (line.startsWith('SF:') ? `SF:${path.posix.join(prefix, line.slice(3))}` : line))
    .join('\n')
}

/**
 * Rewrites `<rootDir>/<packageDir>/coverage/lcov.info` in place, prefixing its `SF:` lines with
 * `packageDir`. Throws, naming `packageDir`, when that file does not exist: a package listed here
 * is expected to have already produced coverage, and a missing file means that step failed or
 * was skipped silently rather than that the package has none to report.
 */
export function main(rootDir, packageDirs) {
  for (const packageDir of packageDirs) {
    const lcovPath = path.join(rootDir, packageDir, 'coverage', 'lcov.info')
    if (!existsSync(lcovPath)) {
      throw new Error(
        `${packageDir}/coverage/lcov.info does not exist. Run its test:coverage script first, ` +
          'or remove it from the package list if it no longer reports coverage.',
      )
    }
    const content = readFileSync(lcovPath, 'utf8')
    writeFileSync(lcovPath, prefixLcovSourcePaths(content, packageDir))
  }
  console.log(
    `lcov source-path prefix: rewrote SF: lines to repo-root-relative paths in ` +
      `${packageDirs.length} package(s): ${packageDirs.join(', ')}.`,
  )
}

// Compare REALPATHS on both sides (see check-actions-pinned-shas.mjs's header comment for why:
// import.meta.url is symlink-resolved by Node, process.argv[1] is not).
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  try {
    main(ROOT, PACKAGE_DIRS)
  } catch (error) {
    console.error(`lcov source-path prefix: ${error.message}`)
    process.exitCode = 1
  }
}
