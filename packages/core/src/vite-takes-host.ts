/**
 * What the build-end read of who takes a `cx` that a dependency gives out needs of its host: the
 * module graph (who imports a module, the text of a module, what a specifier resolves to, how to
 * parse a module) and a few lookups that need the file system, which a host supplies so this
 * code imports no Node module. The Vite plugin supplies them from its `RenderContext` and
 * `UsedContext`; another host supplies them from its own graph.
 */
import type { DeclaredModules } from './vite-cx-modules.ts'

/**
 * What a host's module graph holds about one module.
 */
export interface ModuleInfo {
  readonly code: string | null
  readonly importers: readonly string[]
  readonly dynamicImporters: readonly string[]
}

/**
 * The module graph of a build, as the read of the takes asks it.
 */
export interface ModuleHost {
  /**
   * The environment the build-end read runs for, which keys what it resolves once.
   */
  readonly environment: { readonly name: string }
  /**
   * What the graph holds about the module `id`, or `null` when it holds none.
   */
  getModuleInfo?(id: string): ModuleInfo | null
  /**
   * Resolves `source` as imported from `importer`.
   */
  resolve?(source: string, importer?: string): Promise<{ readonly id: string } | null>
  /**
   * Every file id the host's build may resolve `source` to, for a host whose build resolves one
   * specifier to different files (by condition, or by mode). Used instead of `resolve`, which
   * answers one of them, wherever a resolution is compared to a file.
   */
  resolveAll?(source: string, importer?: string): Promise<readonly string[]>
  /**
   * The host's parse of `code`, an ESTree.
   */
  parse?(code: string): unknown
  /**
   * The host's parse of the module `id` whose text is `code`, for a host that reads authored
   * sources whose language follows from the file. Used instead of `parse` when the host has it.
   */
  parseModule?(code: string, id: string): unknown
}

/**
 * What the read of the takes needs of the build: the project root, the options that decide which
 * packages are listed, the modules `cxModules` lists (resolved once per environment and kept in
 * `state.declared`), and the two lookups that need the file system.
 */
export interface TakesContext {
  readonly root: string
  /**
   * How the host's messages name `root`, completing the phrase a specifier that resolves from
   * <rootName>.
   */
  readonly rootName: string
  readonly options: {
    readonly cxModules: readonly string[]
    readonly keepFor: Readonly<Record<string, readonly string[]>>
  }
  readonly state: { readonly declared: Map<string, Promise<DeclaredModules>> }
  /**
   * The name of the package the module `id` belongs to, when it lies under `node_modules`.
   */
  packageOf(id: string): Promise<string | undefined>
  /**
   * The path a message names the module `id` by: relative to the project root, forward slashes.
   */
  labelOf(id: string): string
}

/**
 * The parse of the module `id` whose text is `code`: the host's own for a module when it has one,
 * else its parse of the text.
 */
export function parseOf(
  host: Pick<ModuleHost, 'parse' | 'parseModule'>,
  code: string,
  id: string,
): unknown {
  return host.parseModule ? host.parseModule(code, id) : host.parse?.(code)
}

/**
 * Every file id `source` resolves to from `importer`: the host's `resolveAll` when it has one,
 * else the one id `resolve` answers, or none.
 */
export async function resolvedIds(
  host: Pick<ModuleHost, 'resolve' | 'resolveAll'>,
  source: string,
  importer?: string,
): Promise<readonly string[]> {
  if (host.resolveAll) return await host.resolveAll(source, importer)
  const resolved = await host.resolve?.(source, importer)
  return resolved ? [resolved.id] : []
}
