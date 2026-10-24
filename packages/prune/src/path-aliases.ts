/**
 * The `paths` aliases of the resolver's config chain, and the places an alias could have sent a
 * specifier: a `paths` entry lists targets in order, and the first that exists wins, so a file
 * created at an earlier target changes what the alias resolves to.
 */
import path from 'node:path'

import type { ConfigFile } from './config-chain.ts'

/**
 * One `paths` entry: the pattern, and its targets as absolute path patterns, in the order the
 * resolver tries them.
 */
export interface PathAlias {
  readonly pattern: string
  readonly targets: readonly string[]
}

interface CompilerOptions {
  readonly baseUrl?: unknown
  readonly paths?: unknown
}

/**
 * The `compilerOptions` of a parsed config, or none.
 */
function compilerOptionsOf(config: unknown): CompilerOptions {
  if (typeof config !== 'object' || config === null) return {}
  const options = (config as { compilerOptions?: unknown }).compilerOptions
  return typeof options === 'object' && options !== null ? options : {}
}

/**
 * The directories a `paths` target may be relative to: every `baseUrl` the chain sets, and the
 * directory of the config that sets the `paths`. Taking all of them can only add places to watch.
 */
function basesOf(configs: readonly ConfigFile[], definer: ConfigFile): string[] {
  const bases = new Set([path.dirname(definer.file)])
  for (const { file, config } of configs) {
    const { baseUrl } = compilerOptionsOf(config)
    if (typeof baseUrl === 'string') bases.add(path.resolve(path.dirname(file), baseUrl))
  }
  return [...bases]
}

const CONFIG_DIR = /\$\{configDir\}/gu

/**
 * The directory of the config the project is built from, which `${configDir}` in a `paths` target
 * stands for.
 */
function rootDirectoryOf(configs: readonly ConfigFile[], definer: ConfigFile): string {
  return path.dirname((configs[0] ?? definer).file)
}

/**
 * A `paths` target as absolute path patterns: the one `${configDir}` makes absolute, or the target
 * relative to each of the `bases`.
 */
function absoluteTargets(target: string, bases: readonly string[], root: string): string[] {
  const expanded = target.replaceAll(CONFIG_DIR, () => root)
  return path.isAbsolute(expanded) ? [expanded] : bases.map((base) => path.resolve(base, expanded))
}

/**
 * The `paths` aliases the chain sets, with their targets made absolute, and for each `baseUrl` the
 * alias of every bare specifier to that directory, which the resolver tries before `node_modules`
 * whether or not there is a `paths`.
 */
export function pathAliasesOf(configs: readonly ConfigFile[]): PathAlias[] {
  const baseUrlAliases = configs.flatMap(({ file, config }) => {
    const { baseUrl } = compilerOptionsOf(config)
    if (typeof baseUrl !== 'string') return []
    return [{ pattern: '*', targets: [path.resolve(path.dirname(file), baseUrl, '*')] }]
  })
  const pathsAliases = configs.flatMap((definer) => {
    const { paths } = compilerOptionsOf(definer.config)
    if (typeof paths !== 'object' || paths === null) return []
    const bases = basesOf(configs, definer)
    const root = rootDirectoryOf(configs, definer)
    return Object.entries(paths).map(([pattern, targets]) => ({
      pattern,
      targets: (Array.isArray(targets) ? targets : [])
        .filter((target): target is string => typeof target === 'string')
        .flatMap((target) => absoluteTargets(target, bases, root)),
    }))
  })
  return [...pathsAliases, ...baseUrlAliases]
}

/**
 * What a `*` in the pattern stands for in the specifier, `''` for a pattern with none that the
 * specifier equals, or `undefined` when the pattern does not match.
 */
function capturedBy(pattern: string, specifier: string): string | undefined {
  const star = pattern.indexOf('*')
  if (star === -1) return pattern === specifier ? '' : undefined
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  const isMatch =
    specifier.length >= prefix.length + suffix.length &&
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix)
  return isMatch ? specifier.slice(prefix.length, specifier.length - suffix.length) : undefined
}

/**
 * Every path the aliases could send `specifier` to, absolute and without an extension.
 */
export function aliasCandidates(aliases: readonly PathAlias[], specifier: string): string[] {
  return aliases.flatMap(({ pattern, targets }) => {
    const captured = capturedBy(pattern, specifier)
    if (captured === undefined) return []
    return targets.map((target) => target.replace('*', () => captured))
  })
}
