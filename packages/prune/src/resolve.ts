/**
 * Resolving an import the way Next.js's bundlers do: tsconfig (or jsconfig) `paths`, package
 * `exports` under the server, browser and edge conditions, each alone and with the `production`
 * and `development` conditions webpack adds by mode, the legacy `browser` field for the browser,
 * and Node built-ins as leaves.
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
 * The environments a specifier is resolved for: the server (React Server Components, Node), the
 * browser and the edge.
 */
const ENVIRONMENTS = [['react-server', 'node'], ['node'], ['browser'], ['edge-light', 'worker']]

/**
 * The conditions a build's mode adds: none, `production` (`next build`), `development`.
 */
const MODES = [[], ['production'], ['development']]

/**
 * The condition sets a specifier is resolved under: each environment in each mode. A file any of
 * them picks is read for its atoms, since reading a file one build does not bundle is safe and
 * missing one is not.
 */
const CONDITION_SETS = ENVIRONMENTS.flatMap((set) => MODES.map((mode) => [...set, ...mode]))

/**
 * The mode a build runs in: `next dev` reads the `development` condition, `next build` the
 * `production` one.
 */
export type Mode = 'development' | 'production'

export interface Resolution {
  /**
   * The distinct files the specifier resolves to, one per condition set that finds one.
   */
  readonly files: readonly string[]
  /**
   * The files among them a condition set of the run's own mode finds: the ones this build
   * bundles, whose problems count.
   */
  readonly filesInMode: readonly string[]
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

interface SetResolver {
  readonly factory: ResolverFactory
  readonly isRequire: boolean
  /**
   * Whether the set holds the condition of the run's mode.
   */
  readonly isInMode: boolean
}

/**
 * A resolver per condition set and module system, with the project's config for its own files.
 */
function resolversFor(dir: string, isProject: boolean, mode: Mode): SetResolver[] {
  const configFile = isProject ? configFileIn(dir) : undefined
  return CONDITION_SETS.flatMap((set) =>
    [false, true].map((isRequire) => ({
      isRequire,
      isInMode: set.includes(mode),
      factory: new ResolverFactory({
        conditionNames: [...set, isRequire ? 'require' : 'import', 'default'],
        extensions: EXTENSIONS,
        extensionAlias: EXTENSION_ALIAS,
        // The client build reads a package's legacy `browser` field first, as a file in place
        // of `main` and as a map from one of its files to another.
        ...(set.includes('browser')
          ? { mainFields: ['browser', 'module', 'main'], aliasFields: [['browser']] }
          : { mainFields: ['module', 'main'] }),
        builtinModules: true,
        ...(configFile && { tsconfig: { configFile, references: 'auto' } }),
      }),
    })),
  )
}

/**
 * The resolver for the project in `dir`, for a build in `mode`.
 */
export function createResolver(dir: string, mode: Mode): Resolver {
  const project = resolversFor(dir, true, mode)
  const dependency = resolversFor(dir, false, mode)
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
      const filesInMode = new Set<string>()
      let isBuiltin = false
      for (const resolver of resolvers) {
        if (resolver.isRequire !== isRequire) continue
        const found = resolver.factory.sync(directory, specifier)
        if (found.builtin) isBuiltin = true
        else if (found.path !== undefined) {
          files.add(found.path)
          if (resolver.isInMode) filesInMode.add(found.path)
        }
      }
      const resolution = { files: [...files], filesInMode: [...filesInMode], isBuiltin }
      cache.set(key, resolution)
      return resolution
    },
  }
}
