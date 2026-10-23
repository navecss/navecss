/**
 * The check `next build` runs after compiling: it reads what the PostCSS plugin recorded and the
 * CSS the build wrote, and stops the build, after printing why once, when the atoms the build
 * ships are not the atoms its code uses. The reason is printed here and the throw is one short
 * line, because `next build` prints a thrown hook error twice.
 */
import path from 'node:path'

import type { NaveOptions } from './options.ts'
import type { PruneRecord } from './record.ts'
import type { Report } from './report.ts'

import { builtStylesheets, hasAtomRules, mismatchOf } from './output-check.ts'
import { readRecord } from './record.ts'
import { reportOf } from './report.ts'
import { staleMessage } from './stale.ts'
import {
  BOTH_PLUGINS,
  incomplete,
  markdownWarning,
  NO_RECORD,
  outputMismatch,
  pagesNotBundled,
  READS_NO_USE,
  stopLine,
} from './texts.ts'

/**
 * What Next.js hands `compiler.runAfterProductionCompile`.
 */
export interface HookMetadata {
  readonly projectDir: string
  /**
   * The build output directory, absolute (relative to `projectDir` is read the same way).
   */
  readonly distDir: string
}

/**
 * What the check reads from the resolved config.
 */
export interface HookConfig {
  readonly transpilePackages?: readonly string[]
  readonly bundlePagesRouterDependencies?: boolean | undefined
}

/**
 * The short line that ends a build, whose stack is its message: `next build` prints a thrown hook
 * error with a stack line pointing into its compiled config, which says nothing.
 */
class BuildStop extends Error {
  constructor(message: string) {
    super(message)
    this.stack = message
  }
}

/**
 * Prints each message once, through `console.error`, and throws the short line.
 */
function stop(messages: readonly string[], count: number = messages.length): never {
  for (const message of messages) {
    // eslint-disable-next-line no-console -- the hook prints the reason the build stops; the throw is a short line
    console.error(message)
  }
  throw new BuildStop(stopLine(count))
}

/**
 * The reason the record cannot be trusted or the setup is wrong, one message, or `undefined`.
 */
function setupMessage(input: {
  readonly dir: string
  readonly distDir: string
  readonly options: NaveOptions
  readonly record: PruneRecord
}): string | undefined {
  const { dir, distDir, record, options } = input
  const cache = `${distDir}/cache`
  const stale = staleMessage({ dir, cache, record, options })
  if (stale !== undefined) return stale
  if (record.hasCorePlugin) return BOTH_PLUGINS
  if (record.failures.length > 0) return incomplete(record.failures, cache)
  const mismatch = mismatchOf(builtStylesheets(dir, distDir), record.atoms)
  if (mismatch === undefined) return undefined
  return outputMismatch({ ...mismatch, cache, output: `${distDir}/static` })
}

/**
 * The packages the Pages Router would not bundle, when they call `cx.dynamic()`.
 */
function unbundledPackages(record: PruneRecord, config: HookConfig): string[] {
  if (config.bundlePagesRouterDependencies === true) return []
  const transpiled = new Set(config.transpilePackages)
  return record.pagesDynamicPackages.filter((name) => !transpiled.has(name))
}

/**
 * Prints the warnings the record asks for. The warning that the build read no use is for a build
 * that goes on to pass: beside a report of a problem in application code, it would offer a way
 * back that is not the remedy.
 */
function warn(record: PruneRecord, report: Report | undefined): void {
  // eslint-disable-next-line no-console -- warnings go to the terminal running the build
  if (report === undefined && record.readsNoUse) console.warn(READS_NO_USE)
  // eslint-disable-next-line no-console -- warnings go to the terminal running the build
  if (record.markdown.length > 0) console.warn(markdownWarning(record.markdown))
}

/**
 * Checks the build. Resolves when the build may go on; prints the reason once and throws one
 * short line when it may not.
 * @param metadata What Next.js hands the hook.
 * @param options The options `withNave()` was called with.
 * @param config The parts of the resolved config the check reads.
 */
export async function checkBuild(
  metadata: HookMetadata,
  options: NaveOptions,
  config: HookConfig = {},
): Promise<void> {
  const dir = metadata.projectDir
  const distDir = path.isAbsolute(metadata.distDir)
    ? path.relative(dir, metadata.distDir)
    : metadata.distDir
  const record = readRecord({ dir, distDir })
  if (record === undefined) {
    if (hasAtomRules(builtStylesheets(dir, distDir))) stop([NO_RECORD])
    return
  }
  const setup = setupMessage({ dir, distDir, record, options })
  if (setup !== undefined) stop([setup])
  const report = reportOf(record, options, dir)
  warn(record, report)
  const unbundled = unbundledPackages(record, config).map((name) => pagesNotBundled(name))
  const messages = [...(report ? [report.text] : []), ...unbundled]
  if (messages.length > 0) stop(messages, (report?.count ?? 0) + unbundled.length)
  await Promise.resolve()
}
