#!/usr/bin/env node
/**
 * Rewrites each measured package's `coverage/lcov.info` `SF:` (source file) lines from a path
 * relative to that PACKAGE's own directory to a path relative to the REPOSITORY root, in place,
 * and fails when a measured package produced no report.
 *
 * Vitest's v8 coverage provider writes `SF:` lines relative to each package's own root
 * (`SF:src/atoms.ts` in `packages/core/coverage/lcov.info`). SonarCloud's JavaScript analyzer
 * resolves such a path against the report file's own directory first (SonarJS 13.0 and later), so
 * these paths resolve today without this rewrite. Analyzers before 13.0 tried the path from the
 * project root and then matched its suffix against every analyzed file, taking the first match,
 * which credits one package's coverage to another that shares a relative path (two `src/index.ts`,
 * say). Repo-root-relative paths resolve the same way under either strategy.
 *
 * The missing-report check is what the scan cannot do for itself: a report path that matches no
 * file is logged at INFO and the analysis carries on, so one package's coverage would read as none
 * on a green scan. Failing here turns that into a red job.
 *
 * The package list is read from `sonar.javascript.lcov.reportPaths` in `sonar-project.properties`,
 * so the reports Sonar reads and the reports this script checks are one list.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const REPORT_PATHS_KEY = 'sonar.javascript.lcov.reportPaths'

const REPORT_PATHS_LINE = new RegExp(
  String.raw`^\s*${REPORT_PATHS_KEY.replaceAll('.', String.raw`\.`)}\s*[=:]\s*(.*)$`,
)

/**
 * Derives the measured package directories from the `sonar.javascript.lcov.reportPaths` line in
 * `propertiesText` (the contents of `sonar-project.properties`), so this script's package list and
 * Sonar's own list of reports are read from the same one place rather than hand-kept in sync.
 * Accepts `=` or `:` as the key/value separator with surrounding whitespace, and — when the key
 * appears more than once — takes the LAST occurrence, both as Java `.properties` parsing does,
 * since that is the format the Sonar scanner itself reads this file as.
 */
export function packageDirsFromReportPaths(propertiesText) {
  const lastMatch = propertiesText
    .split(/\r?\n/)
    .map((l) => REPORT_PATHS_LINE.exec(l))
    .findLast(Boolean)
  if (!lastMatch) {
    throw new Error(`sonar-project.properties has no ${REPORT_PATHS_KEY} line.`)
  }
  const value = lastMatch[1]
  return value.split(',').map((entry) => {
    const trimmed = entry.trim()
    const match = /^(.+)\/coverage\/lcov\.info$/.exec(trimmed)
    if (!match) {
      throw new Error(
        `${REPORT_PATHS_KEY} entry "${trimmed}" is not shaped like "<dir>/coverage/lcov.info".`,
      )
    }
    return match[1]
  })
}

/**
 * Rewrites every `SF:<path>` line in `content` to `SF:<prefix>/<path>` (POSIX-joined), except a
 * path that is already absolute or already starts with `${prefix}/`, either of which passes
 * through unchanged. Every other line passes through unchanged too.
 */
export function prefixLcovSourcePaths(content, prefix) {
  return content
    .split('\n')
    .map((line) => {
      if (!line.startsWith('SF:')) return line
      const sourcePath = line.slice(3)
      if (path.posix.isAbsolute(sourcePath) || sourcePath.startsWith(`${prefix}/`)) return line
      return `SF:${path.posix.join(prefix, sourcePath)}`
    })
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
    const propertiesText = readFileSync(path.join(ROOT, 'sonar-project.properties'), 'utf8')
    main(ROOT, packageDirsFromReportPaths(propertiesText))
  } catch (error) {
    console.error(`lcov source-path prefix: ${error.message}`)
    process.exitCode = 1
  }
}
