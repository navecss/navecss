/**
 * The Vite plugin as it built before it rewrote calls, for the inlining criteria to compare with.
 */
import type { PluginOption } from 'vite'

import { navePlugin, type NaveViteOptions } from '../../src/vite.ts'

type ReadModule = (this: unknown, code: string, id: string, meta?: unknown) => Promise<unknown>

/**
 * `navePlugin(options)` with the rewrite its post-order half returns thrown away: it reads the
 * same calls and leaves them as they are, so the bundle keeps the run-time functions.
 */
export function withoutRewrite(options?: NaveViteOptions): PluginOption {
  const [nave, collect] = navePlugin(options)
  const quiet = {
    ...collect,
    async transform(this: never, code: string, id: string, meta?: unknown) {
      await (collect.transform as ReadModule).call(this, code, id, meta)
    },
  }
  return [nave, quiet]
}
