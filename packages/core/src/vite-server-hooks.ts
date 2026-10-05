/**
 * The hooks of the first plugin object that belong to the dev server and to a builder's process.
 */
import type { BuilderLike, DevServerLike } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { noteStylesheetRequests } from './vite-dev-judge.ts'
import { installServerKeepMap, removeServerKeepMap } from './vite-dev-keep.ts'
import { expectBuilds } from './vite-markup.ts'

/**
 * A function that warns through the plugin context `ctx`.
 */
function warnThrough(ctx: { warn(message: string): void }): (message: string) => void {
  return (message) => {
    ctx.warn(message)
  }
}

/**
 * The hooks of the first plugin object that belong to the dev server and to a builder's process:
 * the map `cx.dynamic()` reads in a server render of this process, put on the global when the dev
 * server starts and taken off when it closes, and, for a builder's process, the note of which
 * environments are about to build, so the markup warning is judged once the last of them has
 * built (every module it was going to transform has been read).
 */
export function serverHooks(context: UsedContext): {
  readonly buildApp: {
    handler(this: { warn(message: string): void }, builder: BuilderLike): Promise<void>
    readonly order: 'post'
  }
  closeBundle(this: { readonly environment?: object }): void
  configureServer(server: unknown): void
} {
  return {
    configureServer(server) {
      const devServer = server as DevServerLike
      const owner = devServer.environments.client
      installServerKeepMap(context, owner)
      // The map comes off when the server is told to close, not only when its environments finish
      // closing: Vite 8.2.1 skips the close hooks of an environment whose `buildEnd` throws.
      const close = devServer.close.bind(devServer)
      devServer.close = () => {
        removeServerKeepMap(owner)
        return close()
      }
      noteStylesheetRequests(context, devServer)
    },
    closeBundle(this: { readonly environment?: object }) {
      removeServerKeepMap(this.environment)
    },
    buildApp: {
      order: 'post',
      handler(this: { warn(message: string): void }, builder: BuilderLike) {
        if (context.command === 'build') expectBuilds(context, builder, warnThrough(this))
        return Promise.resolve()
      },
    },
  }
}
