/**
 * The checks on what an item depends on: the dependency names, the flat `meta`, the packages a copied
 * file may not import, and the files of other items it may not reach. Each takes a registry and
 * returns the problems it found, so a control can run the same function over a mutated clone.
 */
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { LoadedRegistry, RegistryFile, RegistryItem } from './load.ts'

import { isInsidePackage, specifiersOf } from './struct-imports.ts'
import { itemsOf } from './struct-mutate.ts'

export interface PeerManifest {
  peerDependencies: Record<string, string>
  version: string
}

const BARE_PACKAGE_NAME = /^(?:@[^/@]+\/)?[^/@]+$/

const dependencyListProblems = (item: RegistryItem, manifest: PeerManifest): string[] => {
  if (!Array.isArray(item.dependencies)) return [`${item.name}: has no dependencies array`]
  const expected = Object.keys(manifest.peerDependencies).toSorted((a, b) => a.localeCompare(b))
  const problems: string[] = []
  for (const dependency of item.dependencies) {
    if (!BARE_PACKAGE_NAME.test(dependency)) {
      problems.push(`${item.name}: dependency ${dependency} carries a version specifier`)
    } else if (!expected.includes(dependency)) {
      problems.push(`${item.name}: dependency ${dependency} is not a peer dependency name`)
    }
  }
  for (const peer of expected) {
    if (!item.dependencies.includes(peer)) {
      problems.push(`${item.name}: peer dependency ${peer} is missing from dependencies`)
    }
  }
  return problems
}

const forbiddenKeyProblems = (item: RegistryItem): string[] =>
  ['devDependencies', 'registryDependencies']
    .filter((key) => Object.hasOwn(item, key))
    .map((key) => `${item.name}: has a ${key} key`)

const metaProblems = (item: RegistryItem, manifest: PeerManifest): string[] => {
  const expected = { peerDependencies: manifest.peerDependencies, version: manifest.version }
  return isDeepStrictEqual(item.meta, expected)
    ? []
    : [`${item.name}: meta is ${JSON.stringify(item.meta)}, not ${JSON.stringify(expected)}`]
}

/**
 * Dependencies are the manifest's peer names, bare, `meta` is `{ version, peerDependencies }` and
 * nothing more, and no item has `devDependencies` or `registryDependencies`.
 */
export const dependencyProblems = (registry: LoadedRegistry, manifest: PeerManifest): string[] =>
  itemsOf(registry).flatMap((item) => [
    ...dependencyListProblems(item, manifest),
    ...forbiddenKeyProblems(item),
    ...metaProblems(item, manifest),
  ])

const PACKAGES_A_COPY_MAY_NOT_IMPORT = [
  ['@navecss', 'core'],
  ['@navecss', 'base-ui'],
] as const

const fileImports = (file: RegistryFile): string[] =>
  specifiersOf(path.posix.basename(file.target), file.content ?? '')

/**
 * No copied file imports `@navecss/core` or `@navecss/base-ui`, or a path into either, in any form.
 */
export const forbiddenImportProblems = (registry: LoadedRegistry): string[] =>
  itemsOf(registry).flatMap((item) =>
    item.files.flatMap((file) =>
      fileImports(file)
        .filter((specifier) =>
          PACKAGES_A_COPY_MAY_NOT_IMPORT.some(([scope, name]) =>
            isInsidePackage(specifier, scope, name),
          ),
        )
        .map(
          (specifier) => `${item.name}: ${path.posix.basename(file.target)} imports ${specifier}`,
        ),
    ),
  )

const RESOLVES_AS = ['', '.ts', '.tsx', '.css', '/index.ts']

const isInsideItem = (from: RegistryFile, specifier: string, targets: Set<string>): boolean => {
  const resolved = path.posix.join(path.posix.dirname(from.target), specifier)
  return RESOLVES_AS.some((suffix) => targets.has(`${resolved}${suffix}`))
}

const relativeImportProblems = (item: RegistryItem): string[] => {
  const targets = new Set(item.files.map((file) => file.target))
  return item.files.flatMap((file) =>
    fileImports(file)
      .filter((specifier) => specifier.startsWith('.'))
      .filter((specifier) => !isInsideItem(file, specifier, targets))
      .map(
        (specifier) =>
          `${item.name}: ${path.posix.basename(file.target)} imports ${specifier}, outside the item's files`,
      ),
  )
}

/**
 * No item has a `registryDependencies` key, and no copied file imports a relative path that is not
 * one of its own item's targets.
 */
export const independenceProblems = (registry: LoadedRegistry): string[] =>
  itemsOf(registry).flatMap((item) => [
    ...(Object.hasOwn(item, 'registryDependencies')
      ? [`${item.name}: has a registryDependencies key`]
      : []),
    ...relativeImportProblems(item),
  ])
