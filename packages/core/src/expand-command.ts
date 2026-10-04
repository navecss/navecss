/**
 * `navecss-core expand`: expands every `@nave` in each `--source` and writes it to its `--out`,
 * reporting every problem across every file in one run. It resolves no `@import` and bundles
 * nothing; a bare one is a problem it reports, since a browser cannot load it.
 *
 * Exit codes: `0` every file was expanded and written; `1` a stylesheet held a problem and
 * nothing was written; `2` a usage error, an `--extend` module that does not load, or a
 * `--source` that could not be read.
 */
import type { ExtendMap } from './directive/resolve.ts'
import type { ExpandJob } from './expand-args.ts'
import type { PassResult } from './expand-pass.ts'

import { USAGE } from './bin-usage.ts'
import { parseExpandArgs } from './expand-args.ts'
import { expandPass } from './expand-pass.ts'
import { watchFiles } from './expand-watch.ts'
import { applyExtendModule, resolveExtendSpecifier } from './postcss-extend-module.ts'
import { snapshotExtendMap } from './snapshot-extend-atoms.ts'
import { validateExtendAtomsHostFree } from './validate-extend-host-free.ts'

/**
 * The atoms of the `--extend` module as they are now, or none when there is no module: its bytes
 * are re-read on every call (a `--watch` run sees an edit), and the result is checked as the
 * other hosts check theirs.
 */
async function loadExtend(
  file: string | undefined,
  cache: Map<string, Promise<ExtendMap>>,
): Promise<ExtendMap> {
  if (file === undefined) return {}
  let loaded: ExtendMap = {}
  await applyExtendModule(file, cache, (value) => {
    loaded = snapshotExtendMap(value)
    validateExtendAtomsHostFree(loaded)
  })
  return loaded
}

/**
 * Says what a pass did: each file written on stdout, each problem and unreadable source on stderr.
 */
function print(result: PassResult): void {
  for (const { source, out } of result.expanded) console.log(`Expanded ${source} to ${out}.`)
  for (const report of result.reports) console.error(report)
  for (const source of result.unreadable) console.error(`Could not read ${source}.`)
}

/**
 * Runs one pass and prints it. A failure to load the `--extend` module is printed and answers
 * `2`, so a `--watch` run survives a half-saved module the same way it survives a problem in a
 * stylesheet.
 */
async function runOnce(
  job: ExpandJob,
  extendFile: string | undefined,
  cache: Map<string, Promise<ExtendMap>>,
): Promise<0 | 1 | 2> {
  let extend: ExtendMap
  try {
    extend = await loadExtend(extendFile, cache)
  } catch (error) {
    console.error((error as Error).message)
    return 2
  }
  const result = expandPass(job, extend)
  print(result)
  return result.status
}

/**
 * Watches the sources (and the `--extend` module) and runs the pass again after each change, one
 * at a time, keeping on after a problem. Resolves only when the process is stopped.
 */
function watchForever(run: () => Promise<unknown>, files: readonly string[]): Promise<never> {
  let isRunning = false
  let isPending = false
  const runAgain = async (): Promise<void> => {
    if (isRunning) {
      isPending = true
      return
    }
    isRunning = true
    do {
      isPending = false
      await run()
    } while (isPending)
    isRunning = false
  }
  watchFiles(files, () => void runAgain())
  return new Promise<never>(() => {
    // Never settles: the watchers keep the process running until it is stopped.
  })
}

/**
 * Runs `navecss-core expand` over its arguments and answers the exit code.
 */
export async function runExpand(args: readonly string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  const parsed = parseExpandArgs(args)
  if (parsed.kind === 'usageError') {
    console.error(`${parsed.message}\n${USAGE}`)
    return 2
  }
  const { job } = parsed
  let extendFile: string | undefined
  try {
    extendFile = job.extend === undefined ? undefined : resolveExtendSpecifier(job.extend)
  } catch (error) {
    console.error((error as Error).message)
    return 2
  }
  const cache = new Map<string, Promise<ExtendMap>>()
  const run = (): Promise<0 | 1 | 2> => runOnce(job, extendFile, cache)
  const status = await run()
  if (!job.watch) return status
  const watched = [...job.pairs.map((pair) => pair.source), ...(extendFile ? [extendFile] : [])]
  return watchForever(run, watched)
}
