#!/usr/bin/env node
/**
 * `navecss-core` — a bin whose logic lives entirely behind `check()`.
 * Flags follow `navecss-tokens`' own vocabulary and equals form.
 */
import { parseArgs } from 'node:util'

import { type CheckResult, runCheck as runSourcesCheck } from './directive/check-run.ts'

const USAGE = `Usage:
  navecss-core check --source=<file-or-dir> [--source=<file-or-dir> ...]`

/**
True for `--help` or `-h` anywhere in `args`.
 */
function isHelpRequest(args: readonly string[]): boolean {
  return args.includes('--help') || args.includes('-h')
}

/**
The repeatable `--source=` values, or `undefined` on a usage error.
 */
function parseSourceArgs(args: readonly string[]): string[] | undefined {
  try {
    const { values } = parseArgs({
      args,
      options: { source: { type: 'string', multiple: true } },
      strict: true,
    })
    return values.source
  } catch {
    return undefined
  }
}

/**
One line per surviving directive: file, position, the directive as written, and its enclosing selector.
 */
function printFindings(result: CheckResult): void {
  for (const finding of result.findings) {
    const where = finding.selector === undefined ? '' : ` (in ${finding.selector})`
    console.log(`${finding.file}:${finding.line}:${finding.column}: ${finding.text}${where}`)
  }
}

/**
The pass line: what was read, stated plainly, no cause list.
 */
function printCleanSummary(result: CheckResult, source: readonly string[]): void {
  if (result.status !== 0) return
  const plural = result.stylesheetsRead === 1 ? 'stylesheet' : 'stylesheets'
  console.log(
    `Checked ${result.stylesheetsRead} ${plural} under ${source.join(', ')}; found no @nave directive.`,
  )
}

/**
 * The `check` subcommand: parses `--source=`, then walks it once — via
 * `runCheck` (`check-run.ts`), the shared pass this bin and `check()`
 * both derive their own shape from — printing its result plus every path
 * that walk could not read at all. `check()`'s own returned shape stays
 * `{ status, findings, stylesheetsRead }` and carries none of that, so the
 * bin reads it off `runCheck`'s richer return instead of re-walking
 * `source` a second time to find it.
 */
async function runCheck(args: readonly string[]): Promise<number> {
  if (isHelpRequest(args)) {
    console.log(USAGE)
    return 0
  }

  const source = parseSourceArgs(args)
  // An empty --source value (`--source=`) is a usage error, the same as
  // giving no --source at all: it never names a path, so treating it as one
  // only produces a nonsensical "Could not read , so..." message instead of
  // pointing at the actual mistake.
  if (!source || source.length === 0 || source.includes('')) {
    console.error(`check requires at least one --source=<path>.\n${USAGE}`)
    return 2
  }

  const { result, unreadablePaths } = await runSourcesCheck(source)
  printFindings(result)
  printCleanSummary(result, source)
  for (const badPath of unreadablePaths) {
    console.error(`Could not read ${badPath}, so it was not checked.`)
  }
  if (result.status === 2 && unreadablePaths.length === 0) {
    console.error(`No stylesheet found under ${source.join(', ')}; nothing was checked.`)
  }
  return result.status
}

/**
Dispatches the one subcommand this bin has.
 */
async function main(): Promise<number> {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error(USAGE)
    return 2
  }
  if (isHelpRequest([args[0]!])) {
    console.log(USAGE)
    return 0
  }

  const [subcommand, ...rest] = args
  if (subcommand !== 'check') {
    console.error(`Unknown subcommand "${subcommand}".\n${USAGE}`)
    return 2
  }
  return runCheck(rest)
}

process.exitCode = await main()
