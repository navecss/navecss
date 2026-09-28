#!/usr/bin/env node
/**
 * `navecss-core` — a bin whose logic lives entirely behind `check()`.
 * Flags follow `navecss-tokens`' own vocabulary and equals form.
 */
import { access, constants } from 'node:fs/promises'
import { parseArgs } from 'node:util'

import { check, type CheckResult } from './directive/check.ts'
import { listCssFiles } from './directive/list-css-files.ts'

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
 * Every path under `source` that could not be read: `source` itself, when
 * it does not resolve at all (missing, or a --source value with a typo);
 * a subdirectory `listCssFiles` found unreadable while recursing; a
 * resolved file this process cannot open. `check()`'s own returned shape
 * stays `{ status, findings, stylesheetsRead }` and carries none of this,
 * so the bin derives it itself, independently of whatever `check()`
 * decided for the exit status.
 */
async function unreadablePathsUnder(source: string): Promise<string[]> {
  let listing
  try {
    listing = await listCssFiles(source)
  } catch {
    return [source]
  }
  const unreadable = [...listing.unreadablePaths]
  for (const file of listing.files) {
    try {
      await access(file, constants.R_OK)
    } catch {
      unreadable.push(file)
    }
  }
  return unreadable
}

/**
Every unreadable path across every `--source` value, in the order given.
 */
async function findUnreadableSourcePaths(source: readonly string[]): Promise<string[]> {
  const perSource = await Promise.all(source.map((one) => unreadablePathsUnder(one)))
  return perSource.flat()
}

/**
 * The `check` subcommand: parses `--source=`, runs `check()`, prints its
 * result plus whatever the bin's own pass over `--source` found unreadable.
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

  const [result, unreadable] = await Promise.all([
    check({ source }),
    findUnreadableSourcePaths(source),
  ])
  printFindings(result)
  printCleanSummary(result, source)
  for (const badPath of unreadable) {
    console.error(`Could not read ${badPath}, so it was not checked.`)
  }
  if (result.status === 2 && unreadable.length === 0) {
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
