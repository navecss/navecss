#!/usr/bin/env node
/**
 * `navecss-core` — a bin whose logic lives entirely behind `check()` (R10).
 * Flags follow `navecss-tokens`' own vocabulary and equals form.
 */
import { parseArgs } from 'node:util'

import { check, type CheckResult } from './directive/check.ts'

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
    const { values } = parseArgs({ args, options: { source: { type: 'string', multiple: true } }, strict: true })
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
function printCleanSummary(result: CheckResult): void {
  if (result.status !== 0) return
  const plural = result.stylesheetsRead === 1 ? 'stylesheet' : 'stylesheets'
  console.log(`Checked ${result.stylesheetsRead} ${plural} under the given --source; found no @nave directive.`)
}

/**
The `check` subcommand: parses `--source=`, runs `check()`, prints its result.
 */
async function runCheck(args: readonly string[]): Promise<number> {
  if (isHelpRequest(args)) {
    console.log(USAGE)
    return 0
  }

  const source = parseSourceArgs(args)
  if (!source || source.length === 0) {
    console.error(`check requires at least one --source=<path>.\n${USAGE}`)
    return 2
  }

  const result = await check({ source })
  printFindings(result)
  printCleanSummary(result)
  if (result.status === 2) {
    console.error('No stylesheet could be checked: a --source path is unreadable, or none names a stylesheet.')
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
