#!/usr/bin/env node
/**
 * `navecss-core` — a bin whose logic lives behind `check()` and `expand-command.ts`.
 * Flags follow `navecss-tokens`' own vocabulary and equals form.
 */
import { parseArgs } from 'node:util'

import { USAGE } from './bin-usage.ts'
import { type CheckResult, runCheck as runSourcesCheck } from './directive/check-run.ts'
import { formatFinding } from './directive/findings.ts'
import { runExpand } from './expand-command.ts'

/**
True for `--help` or `-h` anywhere in `args`.
 */
function isHelpRequest(args: readonly string[]): boolean {
  return args.includes('--help') || args.includes('-h')
}

type ParsedArgs =
  | { readonly kind: 'source'; readonly source: string[] | undefined }
  | { readonly argument: string; readonly kind: 'unexpectedArgument' }
  | { readonly kind: 'usageError' }

/**
The repeatable `--source=` values, or the reason parsing failed: a stray positional (`check --source=x stray`) is named rather than folded into the same "requires --source" message an actually-missing `--source` gets.
 */
function parseSourceArgs(args: readonly string[]): ParsedArgs {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { source: { type: 'string', multiple: true } },
      strict: true,
      allowPositionals: true,
    })
    if (positionals.length > 0) {
      return { kind: 'unexpectedArgument', argument: positionals[0]! }
    }
    return { kind: 'source', source: values.source }
  } catch {
    return { kind: 'usageError' }
  }
}

/**
One line per surviving directive: file, position, the directive as written, and its enclosing selector.
 */
function printFindings(result: CheckResult): void {
  for (const finding of result.findings) console.log(formatFinding(finding))
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
Every path problem `runCheck` (`check-run.ts`) found: each unreadable path, each path refused as not a stylesheet file, and — only when neither said anything at all — the generic "no stylesheet found" line.
 */
function reportPathProblems(
  result: CheckResult,
  source: readonly string[],
  unreadablePaths: readonly string[],
  notStylesheetPaths: readonly string[],
): void {
  for (const badPath of unreadablePaths) {
    console.error(`Could not read ${badPath}, so it was not checked.`)
  }
  for (const badPath of notStylesheetPaths) {
    console.error(`${badPath} is not a stylesheet file, so it was not checked.`)
  }
  if (result.status === 2 && unreadablePaths.length === 0 && notStylesheetPaths.length === 0) {
    console.error(`No stylesheet found under ${source.join(', ')}; nothing was checked.`)
  }
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

  const parsed = parseSourceArgs(args)
  if (parsed.kind === 'unexpectedArgument') {
    console.error(`check does not take a positional argument: ${parsed.argument}\n${USAGE}`)
    return 2
  }
  const source = parsed.kind === 'source' ? parsed.source : undefined
  // An empty --source value (`--source=`) is a usage error, the same as
  // giving no --source at all: it never names a path, so treating it as one
  // only produces a nonsensical "Could not read , so..." message instead of
  // pointing at the actual mistake.
  if (!source || source.length === 0 || source.includes('')) {
    console.error(`check requires at least one --source=<path>.\n${USAGE}`)
    return 2
  }

  const { result, unreadablePaths, notStylesheetPaths } = await runSourcesCheck(source)
  printFindings(result)
  printCleanSummary(result, source)
  reportPathProblems(result, source, unreadablePaths, notStylesheetPaths)
  return result.status
}

/**
Dispatches the subcommand: `check` or `expand`.
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
  if (subcommand === 'expand') return runExpand(rest)
  if (subcommand !== 'check') {
    console.error(`Unknown subcommand "${subcommand}".\n${USAGE}`)
    return 2
  }
  return runCheck(rest)
}

process.exitCode = await main()
