/**
 * Resolving an import the way Next.js's bundlers do: tsconfig (or jsconfig) `paths`, package
 * `exports` under the server, browser and edge conditions, each alone and with the `production`
 * and `development` conditions webpack adds by mode, the legacy `browser` field for the browser,
 * and Node built-ins as leaves.
 */
import type { LocatedProblem } from '@navecss/core/collect'

import { existsSync } from 'node:fs'
import path from 'node:path'
import { ResolverFactory } from 'oxc-resolver'

import type { PathAlias } from './path-aliases.ts'
import type { ResolutionInputs } from './resolution-inputs.ts'

import { resolverConfigs, unreadableConfig } from './config-chain.ts'
import { configProblem } from './graph-parts.ts'
import { aliasCandidates, pathAliasesOf } from './path-aliases.ts'
import { emptyInputs, noteResolution } from './resolution-inputs.ts'
import { isDependencyPath, relativeTo } from './source-files.ts'

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
   * The files among them a condition set of one of the run's modes finds: the ones this build
   * bundles, whose problems count.
   */
  readonly filesInMode: readonly string[]
  /**
   * Whether the specifier names a Node built-in.
   */
  readonly isBuiltin: boolean
  /**
   * Whether a config the build cannot read is the likely reason the specifier did not resolve: it
   * names a package or an alias, which the config may have set.
   */
  readonly isConfigCause: boolean
}

export interface Resolver {
  readonly resolve: (importer: string, specifier: string, isRequire: boolean) => Resolution
  /**
   * The problem with the project's config when neither the resolver nor TypeScript's rules can
   * read it: none, or one.
   */
  readonly configProblems: readonly LocatedProblem[]
}

/**
 * Whether a specifier names a path rather than a package or an alias.
 */
function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || path.isAbsolute(specifier)
}

/**
 * The config file `paths` are read from: `tsconfig.json`, else `jsconfig.json`.
 */
export function configFileIn(dir: string): string | undefined {
  return ['tsconfig.json', 'jsconfig.json'].map((name) => path.join(dir, name)).find(existsSync)
}

interface SetResolver {
  readonly factory: ResolverFactory
  readonly isRequire: boolean
  /**
   * Whether the set holds the condition of one of the run's modes.
   */
  readonly isInMode: boolean
}

/**
 * Whether the resolver can load the config: it resolves the config file itself only if it can. It
 * cannot read an `extends` that names a path beside a directory of that name, which TypeScript
 * reads as the file with `.json`.
 */
function canLoadConfig(configFile: string): boolean {
  const factory = new ResolverFactory({
    extensions: ['.json'],
    tsconfig: { configFile, references: 'auto' },
  })
  return factory.sync(path.dirname(configFile), `./${path.basename(configFile)}`).path !== undefined
}

/**
 * A resolver per condition set and module system, with the config for the files it governs.
 */
function resolversFor(configFile: string | undefined, modes: readonly Mode[]): SetResolver[] {
  return CONDITION_SETS.flatMap((set) =>
    [false, true].map((isRequire) => ({
      isRequire,
      isInMode: modes.some((mode) => set.includes(mode)),
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
 * Resolves a specifier the way the config's `paths` and `baseUrl` send it, for a resolver given no
 * config: through the first alias target that exists, else as the specifier is written.
 */
function syncThroughAliases(
  factory: ResolverFactory,
  directory: string,
  aliases: readonly PathAlias[],
  specifier: string,
): ReturnType<ResolverFactory['sync']> {
  for (const candidate of aliasCandidates(aliases, specifier)) {
    const found = factory.sync(directory, candidate)
    if (found.path !== undefined) return found
  }
  return factory.sync(directory, specifier)
}

/**
 * Resolves the specifier with every resolver of the module system, each under its condition set.
 */
function resolveAcross(
  resolvers: readonly SetResolver[],
  request: {
    readonly aliases: readonly PathAlias[]
    readonly directory: string
    readonly isRequire: boolean
    readonly specifier: string
  },
): Omit<Resolution, 'isConfigCause'> {
  const { aliases, directory, isRequire, specifier } = request
  const files = new Set<string>()
  const filesInMode = new Set<string>()
  let isBuiltin = false
  for (const resolver of resolvers) {
    if (resolver.isRequire !== isRequire) continue
    const found = syncThroughAliases(resolver.factory, directory, aliases, specifier)
    if (found.builtin) isBuiltin = true
    else if (found.path !== undefined) {
      files.add(found.path)
      if (resolver.isInMode) filesInMode.add(found.path)
    }
  }
  return { files: [...files], filesInMode: [...filesInMode], isBuiltin }
}

/**
 * The resolver for the project in `dir`, for a build whose problems count under `modes`. What each
 * resolution depends on besides the files it returns is noted in `inputs`.
 */
export function createResolver(
  dir: string,
  modes: readonly Mode[],
  inputs: ResolutionInputs = emptyInputs(),
): Resolver {
  const configs = resolverConfigs(dir)
  for (const { file } of configs) inputs.files.add(file)
  const aliases = pathAliasesOf(configs)
  const configFile = configFileIn(dir)
  // A config the resolver cannot load is read through the chain, by TypeScript's rules, and the
  // resolver is given none.
  const isLoaded = configFile === undefined || canLoadConfig(configFile)
  const unreadable = isLoaded ? undefined : unreadableConfig(configs)
  const project = resolversFor(isLoaded ? configFile : undefined, modes)
  const dependency = resolversFor(undefined, modes)
  const cache = new Map<string, Resolution>()
  return {
    configProblems:
      unreadable === undefined
        ? []
        : [configProblem(relativeTo(dir, unreadable.file), unreadable.reason)],
    resolve(importer, specifier, isRequire) {
      const directory = path.dirname(importer)
      const isProject = !isDependencyPath(importer)
      const key = `${isProject}\0${isRequire}\0${directory}\0${specifier}`
      const known = cache.get(key)
      if (known) return known
      const isNamed = isProject && !isRelativeSpecifier(specifier)
      const found = resolveAcross(isProject ? project : dependency, {
        aliases: isNamed && !isLoaded ? aliases : [],
        directory,
        isRequire,
        specifier,
      })
      const resolution = {
        ...found,
        isConfigCause: found.files.length === 0 && isNamed && unreadable !== undefined,
      }
      noteResolution(inputs, { importer, specifier, resolved: resolution.files, aliases })
      cache.set(key, resolution)
      return resolution
    },
  }
}
