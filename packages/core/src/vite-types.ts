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
  /**
   * The config object the host was handed, which every environment of one invocation shares.
   */
  readonly inlineConfig?: object
  readonly cacheDir?: string
  /**
   * Set when the config asks for a builder, so one process builds every environment.
   */
  readonly builder?: unknown
  readonly css?: { readonly devSourcemap?: boolean; readonly transformer?: string }
  readonly build?: { readonly lib?: unknown; readonly sourcemap?: unknown }
  readonly logger: LoggerLike
  /**
   * The plugins of the build, Vite's own among them.
   */
  readonly plugins?: readonly PluginLike[]
}

/**
 * A plugin as another plugin finds it in an environment's list: by name, with a `transform` that
 * is a function or Rolldown's `{ handler }` object.
 */
export interface PluginLike {
  readonly name: string
  readonly transform?: unknown
}

/**
 * A module of a dev server's module graph: its id and URL, the modules that import it and the
 * ones it imports (static and dynamic alike).
 */
export interface GraphModuleLike {
  readonly id: string | null
  readonly url: string
  readonly importers: ReadonlySet<GraphModuleLike>
  readonly importedModules: ReadonlySet<GraphModuleLike>
}

/**
 * The part of a dev environment the dev server's serving of the atomic layer uses: its module
 * graph, the request that transforms a module, and the reload of one.
 */
export interface DevEnvironmentLike {
  readonly moduleGraph: {
    getModuleById(id: string): GraphModuleLike | undefined
  }
  transformRequest(url: string): Promise<unknown>
  reloadModule(module: GraphModuleLike): Promise<void>
  /**
   * Resolves once the static imports the first request set off are processed; from a hook, the
   * module the hook runs for is passed so it does not wait on itself.
   */
  waitForRequestsIdle(ignoredId?: string): Promise<void>
}

/**
 * The environment a hook runs for: a name, whether it renders for a browser or a server, and the
 * plugins it runs.
 */
export interface EnvironmentLike {
  readonly name: string
  readonly config: {
    readonly command?: string
    readonly consumer: string
    readonly inlineConfig?: object
    readonly root?: string
  }
  readonly plugins: readonly PluginLike[]
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

/**
 * What the host tells a `transform` hook about the module besides its text.
 */
export interface TransformMeta {
  readonly moduleType?: string
}

export interface TransformContext {
  error(error: PluginLog): never
  warn(warning: PluginLog): void
  addWatchFile(id: string): void
  getCombinedSourcemap(): IncomingSourceMap
  /**
  The environment the module is being transformed for; `client` when a host gives none.
   */
  readonly environment?: EnvironmentLike
  /**
   * The host's parse of `code`, an ESTree (read as an `AstNode`).
   */
  parse(code: string, options?: { readonly lang?: 'dts' | 'js' | 'jsx' | 'ts' | 'tsx' }): unknown
  /**
   * Resolves `source` as imported from `importer`.
   */
  resolve?(source: string, importer: string): Promise<{ readonly id: string } | null>
  /**
   * Loads, and so transforms, the module `options.id`.
   */
  load?(options: { readonly id: string }): Promise<unknown>
}

/**
 * What the dev server hands `hotUpdate`: the file that changed.
 */
export interface HotUpdateOptions {
  readonly file: string
  /**
   * The modules the changed file belongs to, which the update is about to reload.
   */
  readonly modules?: readonly GraphModuleLike[]
}

/**
 * The environment `hotUpdate` runs in: its module graph, and the channel to its client.
 */
export interface HotUpdateContext {
  readonly environment: {
    readonly config?: {
      readonly command?: string
      readonly consumer?: string
      readonly inlineConfig?: object
    }
    readonly hot: { send(payload: { type: 'full-reload' }): void }
    readonly moduleGraph: {
      getModuleById(id: string): unknown
      invalidateModule(module: never): void
    }
    readonly name: string
    transformRequest?(url: string): Promise<unknown>
  }
}

export interface BundleContext {
  error(error: PluginLog): never
  warn(warning: PluginLog | string): void
  readonly environment?: EnvironmentLike
}

/**
 * What the module graph holds about one module: its transformed text, and who imports it.
 */
interface ModuleInfoLike {
  readonly code: string | null
  readonly importers: readonly string[]
  readonly dynamicImporters: readonly string[]
}

/**
 * What `renderChunk` and `buildEnd` are given: the environment, and the ways to fail or warn.
 */
export interface RenderContext {
  error(error: PluginLog | string): never
  warn(warning: PluginLog | string): void
  readonly environment: EnvironmentLike
  /**
   * The ids of every module the environment's build loaded, externals included.
   */
  getModuleIds?(): IterableIterator<string>
  /**
   * What the module graph holds about the module `id`, or `null` when it holds none.
   */
  getModuleInfo?(id: string): ModuleInfoLike | null
  /**
   * Resolves `source` as imported from `importer`.
   */
  resolve?(source: string, importer?: string): Promise<{ readonly id: string } | null>
  /**
   * The host's parse of `code`, an ESTree (read as an `AstNode`).
   */
  parse?(code: string): unknown
}

export interface RenderedChunk {
  readonly modules: Readonly<Record<string, unknown>>
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
