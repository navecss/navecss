/**
 * What steers the plugin's read of the code besides the files it opens: the resolver's config
 * files and their chain, the `package.json` files it opens, the directories a specifier could have
 * matched in, and the links through `node_modules` the packages were found by. A change to any of
 * them after the plugin ran changes what the code reaches, so the record holds each, and the
 * build's check compares them with the disk.
 */
import { existsSync, realpathSync, statSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'

import type { PathAlias } from './path-aliases.ts'

import { packageNameOfSpecifier } from './packages.ts'
import { aliasCandidates } from './path-aliases.ts'
import { isDependencyPath } from './source-files.ts'

const MODULE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])

/**
 * The entries of a directory that could be what a specifier names: those called `stem`, or
 * `stem.` and an extension.
 */
export interface Stem {
  readonly directory: string
  readonly stem: string
}

export interface ResolutionInputs {
  /**
   * Files the resolution depends on, absolute, whether they exist or not: a config file that is
   * not there is one the resolver looked for.
   */
  readonly files: Set<string>
  /**
   * The entries of directories that a specifier could have matched, by directory and stem.
   */
  readonly stems: Map<string, Stem>
  /**
   * Where a package was looked for through `node_modules`, absolute, nearest first: in a
   * directory that has a `node_modules`, the package's place in it (a link or a directory when the
   * package is there, nothing when it is not); in one that has none, the `node_modules` itself,
   * which a later install would create.
   */
  readonly links: Set<string>
  /**
   * The nearest `package.json` above a directory, once found.
   */
  readonly manifests: Map<string, string | undefined>
  /**
   * The (directory, package) pairs whose `node_modules` candidates were noted.
   */
  readonly probed: Set<string>
}

/**
 * Inputs with nothing noted yet.
 */
export function emptyInputs(): ResolutionInputs {
  return {
    files: new Set(),
    stems: new Map(),
    links: new Set(),
    manifests: new Map(),
    probed: new Set(),
  }
}

/**
 * The nearest `package.json` at or above `directory`, or `undefined`. Each directory searched
 * that has none is noted with its absent `package.json`, since creating one changes which
 * `package.json` governs the files below.
 */
function nearestManifest(inputs: ResolutionInputs, directory: string): string | undefined {
  if (inputs.manifests.has(directory)) return inputs.manifests.get(directory)
  const file = path.join(directory, 'package.json')
  const parent = path.dirname(directory)
  let found: string | undefined
  if (existsSync(file)) {
    found = file
  } else {
    // A `package.json` created here would be the nearest one.
    inputs.files.add(file)
    if (parent !== directory) found = nearestManifest(inputs, parent)
  }
  inputs.manifests.set(directory, found)
  return found
}

/**
 * Notes the `package.json` that governs `directory`.
 */
function noteManifestOf(inputs: ResolutionInputs, directory: string): void {
  const manifest = nearestManifest(inputs, directory)
  if (manifest !== undefined) inputs.files.add(manifest)
}

/**
 * A file name without the extension a module is imported with, as the resolver's extension alias
 * reads it: `util.js` is looked for as `util.ts`.
 */
function stemOf(name: string): string {
  const extension = path.extname(name)
  return MODULE_EXTENSIONS.has(extension) ? name.slice(0, -extension.length) : name
}

/**
 * Notes that the entries of `directory` called `stem` steer the resolution.
 */
function noteStem(inputs: ResolutionInputs, directory: string, stem: string): void {
  inputs.stems.set(`${directory}\0${stem}`, { directory, stem })
}

/**
 * Notes the `package.json` in `directory`, by its real path, as the resolver returns files; nothing
 * when there is none.
 */
function noteManifestIn(inputs: ResolutionInputs, directory: string): void {
  try {
    inputs.files.add(realpathSync(path.join(directory, 'package.json')))
  } catch {
    // No `package.json` there.
  }
}

/**
 * Notes where a relative specifier could have matched: beside the path it names, and, if that is
 * a directory, in it.
 */
function noteRelative(
  inputs: ResolutionInputs,
  importerDirectory: string,
  specifier: string,
): void {
  const target = path.resolve(importerDirectory, specifier)
  noteStem(inputs, path.dirname(target), stemOf(path.basename(target)))
  try {
    if (!statSync(target).isDirectory()) return
  } catch {
    return
  }
  noteStem(inputs, target, 'index')
  noteManifestIn(inputs, target)
}

/**
 * Notes where a file the specifier resolved to could have been something else: beside it under
 * the same name with another extension, and, for an `index` file, beside its directory.
 */
function noteResolvedFile(inputs: ResolutionInputs, file: string): void {
  const directory = path.dirname(file)
  const stem = stemOf(path.basename(file))
  noteStem(inputs, directory, stem)
  if (stem === 'index') noteStem(inputs, path.dirname(directory), path.basename(directory))
}

/**
 * Notes each place a package named by `specifier` was looked for from `importerDirectory`, in
 * every directory up to the one that holds it: the package's place in a `node_modules` that is
 * there, and the `node_modules` of a directory that has none, which one entry per directory
 * covers whatever the package. A name no `node_modules` holds (an alias, a typo) notes nothing.
 */
function noteLinks(inputs: ResolutionInputs, importerDirectory: string, specifier: string): void {
  const name = packageNameOfSpecifier(specifier)
  const key = `${importerDirectory}\0${name}`
  if (inputs.probed.has(key)) return
  inputs.probed.add(key)
  const candidates: string[] = []
  for (let directory = importerDirectory; ; directory = path.dirname(directory)) {
    const modules = path.join(directory, 'node_modules')
    const candidate = path.join(modules, name)
    candidates.push(existsSync(modules) ? candidate : modules)
    if (existsSync(candidate)) {
      for (const looked of candidates) inputs.links.add(looked)
      noteManifestIn(inputs, candidate)
      return
    }
    if (path.dirname(directory) === directory) return
  }
}

/**
 * Notes where a specifier an alias could have sent elsewhere was looked for: each path the
 * aliases list for it, as a relative specifier is noted.
 */
function noteAliasTargets(
  inputs: ResolutionInputs,
  aliases: readonly PathAlias[],
  specifier: string,
): void {
  for (const candidate of aliasCandidates(aliases, specifier)) {
    noteRelative(inputs, path.dirname(candidate), candidate)
  }
}

/**
 * Notes what resolving `specifier` from `importer` depended on, given the files it resolved to and
 * the `paths` aliases of the project's config.
 */
export function noteResolution(
  inputs: ResolutionInputs,
  input: {
    readonly aliases: readonly PathAlias[]
    readonly importer: string
    readonly resolved: readonly string[]
    readonly specifier: string
  },
): void {
  const { importer, specifier, resolved, aliases } = input
  const importerDirectory = path.dirname(importer)
  noteManifestOf(inputs, importerDirectory)
  const isRelative = specifier.startsWith('.') || path.isAbsolute(specifier)
  if (isRelative) {
    noteRelative(inputs, importerDirectory, specifier)
  } else if (!isBuiltin(specifier)) {
    if (!specifier.startsWith('#')) noteLinks(inputs, importerDirectory, specifier)
    if (!isDependencyPath(importerDirectory)) noteAliasTargets(inputs, aliases, specifier)
  }
  for (const file of resolved) {
    noteManifestOf(inputs, path.dirname(file))
    if (!isDependencyPath(file)) noteResolvedFile(inputs, file)
  }
}
