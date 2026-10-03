/**
 * A module worker is bundled by a build of its own, which runs the plugins of `worker.plugins`
 * and none of the build's. The code it ships is code the build reads, so the plugin adds this one:
 * it reads each module of that build as a module of the client environment, into the state the
 * build's own plugins share, and reports nothing itself (its problems are reported once, with
 * the rest, when the build ends).
 */
import type { TransformContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { recordModule } from './vite-collect-module.ts'
import { isReadable } from './vite-collect-plugin.ts'

export interface NaveWorkerPlugin {
  readonly name: 'nave:collect-worker'
  readonly enforce: 'post'
  transform(this: TransformContext, code: string, id: string): Promise<undefined>
}

/**
 * The plugin a worker's build runs: `worker.plugins` returns it, in a build only (the dev server
 * serves a worker's modules through the plugins of the dev server itself).
 */
export function workerCollectPlugins(context: UsedContext): () => NaveWorkerPlugin[] {
  const plugin: NaveWorkerPlugin = {
    name: 'nave:collect-worker',
    enforce: 'post',

    async transform(code, id) {
      if (!isReadable(context, id)) return
      await recordModule(context, this, code, id)
    },
  }
  return () => (context.command === 'build' ? [plugin] : [])
}
