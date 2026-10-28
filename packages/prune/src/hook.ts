/**
 * The check `next build` runs after compiling: it reads what the PostCSS plugin recorded and the
 * CSS the build wrote, and stops the build, after printing why once, when the atoms the build
 * ships are not the atoms its code uses. The reason is printed here and the throw is one short
 * line, because `next build` prints a thrown hook error twice.
 */
import path from 'node:path'

import type { NaveOptions } from './options.ts'
import type { PruneRecord } from './record.ts'

import { builtStylesheets, hasAtomRules, mismatchOf } from './output-check.ts'
import { readRecord } from './record.ts'
import { reportOf } from './report.ts'
import { staleMessage } from './stale.ts'
import {
  BOTH_PLUGINS,
  directiveLine,
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
  /**
   * The `distDir` the plugin was told, relative to the project: where it wrote its record. A
   * wrapper applied outside `withNave()` can set another one, which is where Next.js writes the
   * CSS and what `HookMetadata` carries; the record stays where the plugin put it.
   */
  readonly recordDistDir?: string
  /**
   * The config's `pageExtensions`, absent when it sets none.
   */
  readonly pageExtensions?: readonly string[]
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
  readonly pageExtensions?: readonly string[]
  readonly record: PruneRecord
  readonly recordDistDir: string
}): string | undefined {
  const { dir, distDir, record, recordDistDir, options, pageExtensions } = input
  const cache = `${recordDistDir}/cache`
  const stale = staleMessage({
    dir,
    cache,
    record,
    options,
    ...(pageExtensions !== undefined && { pageExtensions }),
  })
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
 * Prints the warning that the build read no use, when the record says so. It is for a build that
 * goes on to pass: beside a message that stops the build, it would offer a way back that is not the
 * remedy.
 */
function warnOfNoUse(record: PruneRecord): void {
  // eslint-disable-next-line no-console -- warnings go to the terminal running the build
  if (record.readsNoUse) console.warn(READS_NO_USE)
}

/**
 * Prints the other warnings the record asks for.
 */
function warn(record: PruneRecord): void {
  // eslint-disable-next-line no-console -- warnings go to the terminal running the build
  if (record.markdown.length > 0) console.warn(markdownWarning(record.markdown))
  for (const warning of record.directiveWarnings) {
    // eslint-disable-next-line no-console -- warnings go to the terminal running the build
    console.warn(directiveLine(warning))
  }
}

/**
 * Prints the warnings, then the messages that stop the build. The warning that the build read no
 * use comes first, and only when nothing stops the build.
 */
function conclude(record: PruneRecord, messages: readonly string[], count: number): void {
  if (messages.length === 0) warnOfNoUse(record)
  warn(record)
  if (messages.length > 0) stop(messages, count)
}

/**
 * The directory Next.js wrote the build to, relative to the project.
 */
function builtDistDir(metadata: HookMetadata): string {
  return path.isAbsolute(metadata.distDir)
    ? path.relative(metadata.projectDir, metadata.distDir)
    : metadata.distDir
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
  const distDir = builtDistDir(metadata)
  const recordDistDir = config.recordDistDir ?? distDir
  const record = readRecord({ dir, distDir: recordDistDir })
  if (record === undefined) {
    if (hasAtomRules(builtStylesheets(dir, distDir))) stop([NO_RECORD])
    return
  }
  const setup = setupMessage({
    dir,
    distDir,
    record,
    recordDistDir,
    options,
    ...(config.pageExtensions !== undefined && { pageExtensions: config.pageExtensions }),
  })
  if (setup !== undefined) stop([setup])
  const report = reportOf(record, options, dir)
  const unbundled = unbundledPackages(record, config).map((name) => pagesNotBundled(name))
  const messages = [...(report ? [report.text] : []), ...unbundled]
  conclude(record, messages, (report?.count ?? 0) + unbundled.length)
  await Promise.resolve()
}
