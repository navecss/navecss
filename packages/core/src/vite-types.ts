/**
 * The few shapes of Vite's (and Rollup's) own objects the plugin touches, declared here rather
 * than imported: `@navecss/core/vite` takes no dependency and no peer, and a type import from
 * `vite` would make the peer real for every consumer who type-checks it. Each interface is a
 * structural subset of the real one, so Vite's own `Plugin` type accepts the plugin as it is.
 */

export interface LoggerLike {
  warn(message: string, options?: unknown): void
}

export interface ResolvedConfigLike {
  readonly root: string
  readonly command: string
  readonly css?: { readonly devSourcemap?: boolean; readonly transformer?: string }
  readonly build?: { readonly sourcemap?: unknown }
  readonly logger: LoggerLike
}

/**
 * A location in the shape Rollup reports one: 1-based line, 0-based column.
 */
interface LogLocation {
  readonly file?: string
  readonly line: number
  readonly column: number
}

export interface PluginLog {
  readonly message: string
  readonly id?: string
  readonly loc?: LogLocation
}

export interface IncomingSourceMap {
  readonly sources: readonly string[]
  readonly sourceRoot?: string | undefined
  readonly sourcesContent?: readonly (string | null)[] | undefined
  readonly names?: readonly string[] | undefined
  readonly mappings: string
}

export interface TransformContext {
  error(error: PluginLog): never
  warn(warning: PluginLog): void
  addWatchFile(id: string): void
  getCombinedSourcemap(): IncomingSourceMap
  /**
  The environment the stylesheet is being transformed for; `client` when a host gives none.
   */
  readonly environment?: { readonly name: string }
}

/**
 * What the dev server hands `hotUpdate`: the file that changed and the modules the module graph
 * links to it, which is none for a file no earlier transform recorded with `addWatchFile`.
 */
export interface HotUpdateOptions {
  readonly file: string
  readonly modules: readonly unknown[]
}

/**
 * The environment `hotUpdate` runs in: its module graph, and the channel to its client.
 */
export interface HotUpdateContext {
  readonly environment: {
    readonly hot: { send(payload: { type: 'full-reload' }): void }
    readonly moduleGraph: {
      getModuleById(id: string): unknown
      invalidateModule(module: never): void
    }
    readonly name: string
  }
}

export interface BundleContext {
  error(error: PluginLog): never
}

export interface BundleEntry {
  readonly type: string
  readonly fileName: string
  readonly source?: string | Uint8Array
}

export interface TransformResultLike {
  readonly code: string
  readonly map: string
}
