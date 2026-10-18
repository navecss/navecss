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

import { expandDirectives, hasNaveDirective } from './directive.ts'
import { loadExtend } from './extend.ts'
import { readHandoff } from './handoff.ts'
import { printEachRun, printOnce } from './print.ts'
import { writeSheetRecord } from './record.ts'
import { relativeTo } from './source-files.ts'
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
}

/**
 * The stylesheet's path relative to `dir`.
 */
function sheetPathIn(dir: string, result: Result): string {
  const from = result.opts.from
  return from === undefined ? '<stylesheet>' : relativeTo(dir, from)
}

/**
 * Prints a `@nave` problem once, placed in its stylesheet.
 */
function sayFinding(file: string, finding: Finding): void {
  printOnce(
    `directive:${file}:${finding.line}:${finding.column}:${finding.text}`,
    `${file}:${finding.line}:${finding.column}: ${finding.text}`,
  )
}

/**
 * Expands `@nave` and returns what the stylesheet found: problems to record under `'error'`,
 * printed lines under `'warn'`.
 */
async function expand(
  root: Root,
  result: Result,
  handoff: Handoff,
  extend: ExtendMap | undefined,
): Promise<SheetExpansion> {
  const { onUnknown } = handoff.options
  const expansion = await expandDirectives(root, { extend, from: result.opts.from, onUnknown })
  const file = sheetPathIn(handoff.dir, result)
  const problems: DirectiveProblem[] = []
  for (const finding of expansion.findings) {
    if (onUnknown === 'warn') sayFinding(file, finding)
    else problems.push({ file, ...finding })
  }
  return { hasDirective: expansion.hasDirective, problems }
}

/**
 * Expands `@nave` with no options, when there is no hand-off to read them from: every problem is
 * printed, as `'warn'` prints it.
 */
async function expandWithoutOptions(root: Root, result: Result): Promise<void> {
  const { findings } = await expandDirectives(root, {
    extend: undefined,
    from: result.opts.from,
    onUnknown: 'warn',
  })
  const file = sheetPathIn(process.cwd(), result)
  for (const finding of findings) sayFinding(file, finding)
}

/**
 * Reads `extend` for the run; a failure is added to `failures`, which are recorded and not
 * printed (the run over the atom layer says it, once), and the run goes on with Nave's own atoms
 * only.
 */
async function extendOf(
  handoff: Handoff,
  failures: string[],
): Promise<{ readonly extend: ExtendMap | undefined; readonly failure: string | undefined }> {
  try {
    return { extend: await loadExtend(handoff.options, handoff.dir), failure: undefined }
  } catch (error) {
    const failure = `the extend option could not be used: ${String(error)}`
    failures.push(`${PLUGIN} expanded @nave with Nave's own atoms only, because ${failure}`)
    return { extend: undefined, failure }
  }
}

/**
 * Expands `@nave`; a failure is added to `failures` and leaves the directives as they are.
 */
async function expandOrRecord(
  root: Root,
  result: Result,
  input: { readonly extend: ExtendMap | undefined; readonly handoff: Handoff },
  failures: string[],
): Promise<SheetExpansion> {
  try {
    return await expand(root, result, input.handoff, input.extend)
  } catch (error) {
    failures.push(`${PLUGIN} could not expand @nave: ${String(error)}`)
    return { hasDirective: hasNaveDirective(root), problems: [] }
  }
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
  printOnce(
    'both-plugins',
    'Nave: both @navecss/prune/postcss and @navecss/core/postcss are in the PostCSS config. Remove @navecss/core/postcss: @navecss/prune/postcss expands @nave as well.',
  )
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
  if (hasCorePlugin(result)) sayBothPluginsAreListed()
  const recorded: string[] = []
  const { extend, failure } = await extendOf(handoff, recorded)
  const expansionFailures: string[] = []
  const expansion = await expandOrRecord(root, result, { handoff, extend }, expansionFailures)
  for (const line of expansionFailures) printEachRun(`Nave: ${line}`)
  writeSheetRecord(handoff, {
    file: sheetPathIn(handoff.dir, result),
    isOnDisk: result.opts.from !== undefined && existsSync(result.opts.from),
    hasDirective: expansion.hasDirective,
    problems: expansion.problems,
    failures: [...recorded, ...expansionFailures],
  })
  if (!inspectAtomicLayer(root.toString()).hasLayer) return
  trimAtomicLayer({
    root,
    result,
    handoff,
    entryOptions,
    extend,
    directiveProblems: expansion.problems,
    blocked: failure,
  })
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
      `Nave: ${PLUGIN} cannot read what withNave() handed it, so every atom ships and @nave is expanded without its options: ${String(error)}`,
    )
    await expandWithoutOptions(root, result)
    return
  }
  if (!handoff) {
    sayWrapperIsMissing()
    await expandWithoutOptions(root, result)
    return
  }
  await runWithHandoff(root, result, handoff, entryOptions)
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
        printEachRun(`Nave: ${PLUGIN} stopped without trimming: ${String(error)}`)
      }
    },
  }
}
prunePlugin.postcss = true

export default prunePlugin
