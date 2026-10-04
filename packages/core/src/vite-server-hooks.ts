/**
 * The hooks of the first plugin object that belong to the dev server and to a builder's process.
 */
import type { UsedContext } from './vite-used.ts'

import { installServerKeepMap, removeServerKeepMap } from './vite-dev-keep.ts'
import { judgeMarkup } from './vite-markup.ts'

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
 * server starts and taken off when it closes, and the markup warning once the last environment of
 * a builder's process has built (every one it was going to transform has been read).
 */
export function serverHooks(context: UsedContext): {
  readonly buildApp: {
    handler(this: { warn(message: string): void }): Promise<void>
    readonly order: 'post'
  }
  closeBundle(): void
  configureServer(): void
} {
  return {
    configureServer() {
      installServerKeepMap(context)
    },
    closeBundle() {
      removeServerKeepMap(context)
    },
    buildApp: {
      order: 'post',
      handler(this: { warn(message: string): void }) {
        if (context.command === 'build') judgeMarkup(context, warnThrough(this))
        return Promise.resolve()
      },
    },
  }
}
