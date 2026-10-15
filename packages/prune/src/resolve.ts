/**
 * Resolving an import the way Next.js's bundlers do: tsconfig (or jsconfig) `paths`, package
 * `exports` under the server, browser and edge conditions, and Node built-ins as leaves.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ResolverFactory } from 'oxc-resolver'

import { isDependencyPath } from './source-files.ts'

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json']

const EXTENSION_ALIAS = {
  '.cjs': ['.cts', '.cjs'],
  '.js': ['.ts', '.tsx', '.js'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
}

/**
 * The condition sets a specifier is resolved under: the server (React Server Components, Node),
 * the browser and the edge. A file any of them picks is read.
 */
const CONDITION_SETS = [['react-server', 'node'], ['node'], ['browser'], ['edge-light', 'worker']]

interface Resolution {
  /**
   * The distinct files the specifier resolves to, one per condition set that finds one.
   */
  readonly files: readonly string[]
  /**
   * Whether the specifier names a Node built-in.
   */
  readonly isBuiltin: boolean
}

export interface Resolver {
  readonly resolve: (importer: string, specifier: string, isRequire: boolean) => Resolution
}

/**
 * The config file `paths` are read from: `tsconfig.json`, else `jsconfig.json`.
 */
function configFileIn(dir: string): string | undefined {
  return ['tsconfig.json', 'jsconfig.json'].map((name) => path.join(dir, name)).find(existsSync)
}

/**
 * A resolver per condition set and module system, with the project's config for its own files.
 */
function resolversFor(dir: string, isProject: boolean): ResolverFactory[] {
  const configFile = isProject ? configFileIn(dir) : undefined
  const kinds = [['import'], ['require']]
  return CONDITION_SETS.flatMap((set) =>
    kinds.map(
      (kind) =>
        new ResolverFactory({
          conditionNames: [...set, ...kind, 'default'],
          extensions: EXTENSIONS,
          extensionAlias: EXTENSION_ALIAS,
          mainFields: ['module', 'main'],
          builtinModules: true,
          ...(configFile && { tsconfig: { configFile, references: 'auto' } }),
        }),
    ),
  )
}

/**
 * The resolver for the project in `dir`.
 */
export function createResolver(dir: string): Resolver {
  const project = resolversFor(dir, true)
  const dependency = resolversFor(dir, false)
  const cache = new Map<string, Resolution>()
  return {
    resolve(importer, specifier, isRequire) {
      const directory = path.dirname(importer)
      const isProject = !isDependencyPath(importer)
      const key = `${isProject}\0${isRequire}\0${directory}\0${specifier}`
      const known = cache.get(key)
      if (known) return known
      const resolvers = isProject ? project : dependency
      const files = new Set<string>()
      let isBuiltin = false
      for (const [index, resolver] of resolvers.entries()) {
        if (index % 2 === (isRequire ? 0 : 1)) continue
        const found = resolver.sync(directory, specifier)
        if (found.builtin) isBuiltin = true
        else if (found.path !== undefined) files.add(found.path)
      }
      const resolution = { files: [...files], isBuiltin }
      cache.set(key, resolution)
      return resolution
    },
  }
}
