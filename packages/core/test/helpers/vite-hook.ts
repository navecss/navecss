/**
 * The Vite plugin's `transform` hook fed a stylesheet directly, with a stand-in for the context
 * Vite gives it: `error` throws as Rollup's does, `warn` and `addWatchFile` record, and
 * `getCombinedSourcemap` answers with the map the caller supplies (none by default, Vite's own
 * answer in a build that writes no stylesheet maps).
 */
import type { IncomingSourceMap, PluginLog, TransformContext } from '../../src/vite-types.ts'
import type { NaveViteOptions } from '../../src/vite.ts'

import { navePlugin } from '../../src/vite.ts'

export interface HookRun {
  /**
   * The transformed text, or `undefined` when the plugin left the module alone.
   */
  readonly code: string | undefined
  readonly map: string | undefined
  readonly warnings: readonly PluginLog[]
  readonly watched: readonly string[]
  /**
   * What `this.error` was called with, when it was.
   */
  readonly error: PluginLog | undefined
}

export interface HookInput {
  readonly code: string
  readonly id?: string
  readonly options?: NaveViteOptions
  /**
   * The map Vite supplies, with `hasStylesheetMaps` telling the plugin it is a real one.
   */
  readonly incomingMap?: IncomingSourceMap
}

class StopForTest extends Error {
  readonly log: PluginLog
  constructor(log: PluginLog) {
    super(log.message)
    this.log = log
  }
}

const NO_MAP: IncomingSourceMap = { sources: [], mappings: '' }

/**
 * Runs the plugin's `transform` hook once over `input.code` and returns what it produced: the
 * code and map, the warnings and watched files it recorded, and the error it raised, if any.
 */
export async function runHook(input: HookInput): Promise<HookRun> {
  const warnings: PluginLog[] = []
  const watched: string[] = []
  const [plugin] = navePlugin(input.options)
  plugin.configResolved({
    root: process.cwd(),
    command: 'build',
    css: {},
    build: { sourcemap: input.incomingMap !== undefined },
    logger: {
      warn() {
        // The config-time logger is not under test here; the hook reports through `ctx.warn`.
      },
    },
  })
  const ctx: TransformContext = {
    parse: () => {
      throw new Error('a stylesheet is not parsed')
    },
    error(log) {
      throw new StopForTest(log)
    },
    warn(log) {
      warnings.push(log)
    },
    addWatchFile(file) {
      watched.push(file)
    },
    getCombinedSourcemap: () => input.incomingMap ?? NO_MAP,
  }
  try {
    const result = await plugin.transform.call(ctx, input.code, input.id ?? '/proj/app.css')
    return { code: result?.code, map: result?.map, warnings, watched, error: undefined }
  } catch (error) {
    if (!(error instanceof StopForTest)) throw error
    return { code: undefined, map: undefined, warnings, watched, error: error.log }
  }
}
