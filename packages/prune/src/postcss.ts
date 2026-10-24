/**
 * The Nave PostCSS plugin for Next.js. It expands `@nave` in every stylesheet. In the stylesheet
 * that holds Nave's `@layer atomic` block (core's own `atomic.css`) it reads the import graph from
 * Next.js's entries, keeps the atoms the code uses, and tells the bundler every file and directory
 * it read. It never throws: a problem in the code it reads goes into the record under
 * `<distDir>/cache` for the build's own check to report.
 */
import type { Plugin, Result, Root } from 'postcss'

import { inspectAtomicLayer } from '@navecss/core/collect'
import { existsSync } from 'node:fs'

import type { ExtendMap } from './extend.ts'
import type { Handoff } from './handoff.ts'
import type { DirectiveProblem } from './record.ts'

import { reportInDev } from './dev-report.ts'
import { corePluginFor, expandDirectives, hasNaveDirective } from './directive.ts'
import { extendFileIn, loadExtend } from './extend.ts'
import { readHandoff } from './handoff.ts'
import { dependencyMessages } from './messages.ts'
import { isDevelopmentRun } from './phase.ts'
import { printEachRun, printOnce } from './print.ts'
import { projectHandoff } from './project.ts'
import { writeSheetRecord } from './record.ts'
import { declarationRoot } from './root.ts'
import { relativeTo } from './source-files.ts'
import { BOTH_PLUGINS_DEV, directiveLine, LISTED_NAME } from './texts.ts'
import { hasCorePlugin, trimAtomicLayer } from './trim.ts'

const PLUGIN = 'postcss-nave-prune'

interface Finding {
  readonly text: string
  readonly line: number
  readonly column: number
}

interface SheetExpansion {
  readonly hasDirective: boolean
  readonly problems: DirectiveProblem[]
  /**
   * The `@nave` lines that are not problems.
   */
  readonly warnings: DirectiveProblem[]
}

/**
 * The stylesheet's path relative to `dir`.
 */
function sheetPathIn(dir: string, result: Result): string {
  const from = result.opts.from
  return from === undefined ? '<stylesheet>' : relativeTo(dir, from)
}

/**
 * Prints a `@nave` line once, placed in its stylesheet.
 */
function sayFinding(file: string, finding: Finding): void {
  printOnce(
    `directive:${file}:${finding.line}:${finding.column}:${finding.text}`,
    directiveLine({ file, ...finding }),
  )
}

/**
 * Expands `@nave`. Every order warning is a warning, whatever `onUnknown` says, and is never a
 * problem. A problem in a directive is a warning under `'warn'` and a problem otherwise (under
 * `'ignore'` core raises none). The warnings are returned to record, and printed here only in the
 * development server: in a build the hook prints them.
 */
async function expand(
  root: Root,
  result: Result,
  handoff: Handoff,
  plugin: Plugin | undefined,
): Promise<SheetExpansion> {
  const { onUnknown } = handoff.options
  const expansion = await expandDirectives(root, { plugin, from: result.opts.from })
  const file = sheetPathIn(handoff.dir, result)
  const problems: DirectiveProblem[] = []
  const warnings: DirectiveProblem[] = expansion.orderWarnings.map((warning) => ({
    file,
    ...warning,
  }))
  for (const finding of expansion.findings) {
    if (onUnknown === 'warn') warnings.push({ file, ...finding })
    else problems.push({ file, ...finding })
  }
  if (isDevelopmentRun(handoff)) for (const warning of warnings) sayFinding(file, warning)
  return { hasDirective: expansion.hasDirective, problems, warnings }
}

/**
 * Expands `@nave` with no options, when there is no hand-off to read them from: every problem is
 * printed, as `'warn'` prints it.
 */
async function expandWithoutOptions(root: Root, result: Result): Promise<void> {
  const plugin = hasNaveDirective(root) ? corePluginFor(undefined, 'warn') : undefined
  const { findings, orderWarnings } = await expandDirectives(root, {
    plugin,
    from: result.opts.from,
  })
  const file = sheetPathIn(process.cwd(), result)
  for (const finding of [...orderWarnings, ...findings]) sayFinding(file, finding)
}

interface SheetPlugin {
  readonly extend: ExtendMap | undefined
  /**
   * Why `extend` could not be used, when it could not.
   */
  readonly failure: string | undefined
  /**
   * Core's plugin for the stylesheet, made only when there is a map to validate or a `@nave` to
   * expand.
   */
  readonly plugin: Plugin | undefined
}

/**
 * Reads `extend` and makes the stylesheet's one core plugin, which validates the map and expands
 * `@nave`. A failure is added to `failures`, which are recorded and not printed (the run over the
 * atom layer says it, once), and the stylesheet goes on with Nave's own atoms only.
 */
async function sheetPluginOf(
  root: Root,
  handoff: Handoff,
  failures: string[],
): Promise<SheetPlugin> {
  const { onUnknown } = handoff.options
  try {
    const extend = await loadExtend(handoff.options, handoff.dir)
    const isNeeded = extend !== undefined || hasNaveDirective(root)
    return {
      extend,
      failure: undefined,
      plugin: isNeeded ? corePluginFor(extend, onUnknown) : undefined,
    }
  } catch (error) {
    const failure = `the extend option could not be used: ${String(error)}`
    failures.push(`${LISTED_NAME} expanded @nave with Nave's own atoms only, because ${failure}`)
    const plugin = hasNaveDirective(root) ? corePluginFor(undefined, onUnknown) : undefined
    return { extend: undefined, failure, plugin }
  }
}

/**
 * Expands `@nave`; a failure is added to `failures` and leaves the directives as they are.
 */
async function expandOrRecord(
  root: Root,
  result: Result,
  input: { readonly handoff: Handoff; readonly plugin: Plugin | undefined },
  failures: string[],
): Promise<SheetExpansion> {
  try {
    return await expand(root, result, input.handoff, input.plugin)
  } catch (error) {
    failures.push(`${LISTED_NAME} could not expand @nave: ${String(error)}`)
    return { hasDirective: hasNaveDirective(root), problems: [], warnings: [] }
  }
}

/**
 * Declares a path-valued `extend` module to the bundler, so a stylesheet whose `@nave` it expands
 * runs again when it changes. The run over the atom layer declares it with everything else it
 * read.
 */
function declareExtendFile(result: Result, handoff: Handoff): void {
  const file = extendFileIn(handoff.options, handoff.dir)
  if (file === undefined) return
  result.messages.push(
    ...dependencyMessages({
      root: declarationRoot(handoff),
      parent: result.opts.from,
      files: [file],
      directories: [],
    }),
  )
}

/**
 * Says, once, that the plugin is listed and the wrapper is not.
 */
function sayWrapperIsMissing(): void {
  printOnce(
    'no-wrapper',
    'Nave: @navecss/prune/postcss is in the PostCSS config but withNave() is not wrapped around next.config, so every atom ships. Wrap next.config in withNave() from @navecss/prune to ship only the atoms the build reads.',
  )
}

/**
 * Says, once, that both Nave plugins are listed.
 */
function sayBothPluginsAreListed(): void {
  printOnce('both-plugins', BOTH_PLUGINS_DEV)
}

/**
 * One stylesheet through the plugin, with the wrapper's hand-off: `@nave` is expanded and
 * recorded first, then the atom layer, if the stylesheet holds it, is trimmed.
 */
async function runWithHandoff(
  root: Root,
  result: Result,
  handoff: Handoff,
  entryOptions: object,
): Promise<void> {
  if (hasCorePlugin(result) && isDevelopmentRun(handoff)) sayBothPluginsAreListed()
  const recorded: string[] = []
  const { extend, failure, plugin } = await sheetPluginOf(root, handoff, recorded)
  const expansionFailures: string[] = []
  const expansion = await expandOrRecord(root, result, { handoff, plugin }, expansionFailures)
  for (const line of expansionFailures) printEachRun(`Nave: ${line}`)
  writeSheetRecord(handoff, {
    file: sheetPathIn(handoff.dir, result),
    isOnDisk: result.opts.from !== undefined && existsSync(result.opts.from),
    hasDirective: expansion.hasDirective,
    problems: expansion.problems,
    warnings: expansion.warnings,
    failures: [...recorded, ...expansionFailures],
  })
  if (inspectAtomicLayer(root.toString()).hasLayer) {
    trimAtomicLayer({
      root,
      result,
      handoff,
      entryOptions,
      extend,
      directiveProblems: expansion.problems,
      blocked: failure,
    })
  } else {
    declareExtendFile(result, handoff)
  }
  reportInDev(handoff)
}

/**
 * One stylesheet through the plugin.
 */
async function run(root: Root, result: Result, entryOptions: object): Promise<void> {
  let handoff: Handoff | undefined
  try {
    handoff = readHandoff()
  } catch (error) {
    printEachRun(
      `Nave: ${LISTED_NAME} cannot read what withNave() handed it, so every atom ships and @nave is expanded without its options: ${String(error)}`,
    )
    await expandWithoutOptions(root, result)
    return
  }
  if (!handoff) {
    sayWrapperIsMissing()
    await expandWithoutOptions(root, result)
    return
  }
  await runWithHandoff(root, result, projectHandoff(handoff), entryOptions)
}

/**
 * The Nave PostCSS plugin for Next.js. List it with `{}` in the PostCSS config; every option
 * belongs to `withNave()`.
 * @param entryOptions What the PostCSS entry was given: nothing.
 * @returns The PostCSS plugin.
 */
export function prunePlugin(entryOptions: object = {}): Plugin {
  return {
    postcssPlugin: PLUGIN,
    async Once(root, { result }) {
      try {
        await run(root, result, entryOptions)
      } catch (error) {
        printEachRun(`Nave: ${LISTED_NAME} stopped without trimming: ${String(error)}`)
      }
    },
  }
}
prunePlugin.postcss = true

export default prunePlugin
