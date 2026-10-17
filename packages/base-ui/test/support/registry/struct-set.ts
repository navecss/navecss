/**
 * The checks on which files the registry holds and on the index that lists them. Each takes a
 * registry and what it is expected to hold, and returns the problems it found, so a control can run
 * the same function over a mutated clone.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { registrySchema } from 'shadcn/schema'

import type { LoadedRegistry, RegistryFile, RegistryItem } from './load.ts'

const INDEX_FILE = 'registry.json'

export const itemFileName = (subpath: string): string => `base-ui-${subpath}.json`

/**
 * The styled subpaths of a package directory, derived as `styled-subpaths.ts` derives them for this
 * package, for a directory a control has edited.
 */
export const styledSubpathsIn = (packageDirectory: string): string[] => {
  const manifest = JSON.parse(
    readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
  ) as { exports: Record<string, unknown> }
  return Object.keys(manifest.exports)
    .filter((key) => !['.', './package.json', './styles.css'].includes(key))
    .map((key) => key.slice(2))
    .filter((subpath) => {
      const generated = path.join(packageDirectory, 'src', subpath, 'parts.generated.ts')
      return existsSync(generated) && readFileSync(generated, 'utf8').includes('nave-base-ui-')
    })
    .toSorted((a, b) => a.localeCompare(b))
}

const nameInside = (text: string | undefined): string | undefined => {
  if (text === undefined) return undefined
  try {
    return (JSON.parse(text) as { name?: string }).name
  } catch {
    return undefined
  }
}

const missingAndUnexpected = (registry: LoadedRegistry, expectedFiles: Set<string>): string[] => [
  ...[...expectedFiles]
    .filter((name) => !registry.fileNames.includes(name))
    .map((name) => `${name} is missing`),
  ...registry.fileNames
    .filter((name) => !expectedFiles.has(name))
    .map((name) => `${name} is not an item of a styled subpath, nor the index`),
]

const nameProblems = (registry: LoadedRegistry, styled: readonly string[]): string[] =>
  styled.flatMap((subpath) => {
    const file = itemFileName(subpath)
    if (!registry.fileNames.includes(file)) return []
    const name = nameInside(registry.raw.get(file))
    return name === `base-ui-${subpath}` ? [] : [`${file} is named ${String(name)}`]
  })

const indexNamedAsItemProblems = (registry: LoadedRegistry): string[] =>
  registry.fileNames
    .filter((name) => name !== INDEX_FILE)
    .filter((name) => nameInside(registry.raw.get(name)) === 'registry')
    .map((name) => `${name} is an item named registry`)

/**
 * One `base-ui-<s>.json` per styled subpath, named for it, and `registry.json`: no other file, no
 * item named `registry`.
 */
export const setProblems = (registry: LoadedRegistry, styled: readonly string[]): string[] => {
  const expectedFiles = new Set([...styled.map((subpath) => itemFileName(subpath)), INDEX_FILE])
  return [
    ...missingAndUnexpected(registry, expectedFiles),
    ...nameProblems(registry, styled),
    ...indexNamedAsItemProblems(registry),
  ]
}

/**
 * The homepage of a package page that npm derives from `repository`: the repository's web address,
 * then `/tree/main/<directory>#readme`.
 */
export const homepageFromRepository = (repository: { directory?: string; url: string }): string => {
  const web = repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
  return `${web}/tree/main/${repository.directory ?? ''}#readme`
}

const filesOfIndexItem = (item: RegistryItem): RegistryFile[] =>
  Array.isArray(item.files) ? item.files : []

const itemFilesProblems = (item: RegistryItem, indexed: RegistryItem): string[] => {
  const expected = item.files.map(({ path: filePath, target, type }) => ({
    path: filePath,
    target,
    type,
  }))
  const listed = filesOfIndexItem(indexed)
  const problems = listed
    .filter((file) => 'content' in file)
    .map((file) => `${item.name}: the index carries content for ${file.path}`)
  const stripped = listed.map(({ path: filePath, target, type }) => ({
    path: filePath,
    target,
    type,
  }))
  if (JSON.stringify(stripped) !== JSON.stringify(expected)) {
    problems.push(`${item.name}: the index lists other files, or the same in another order`)
  }
  return problems
}

const indexItemProblems = (registry: LoadedRegistry, itemNames: readonly string[]): string[] => {
  const listed = new Map(registry.index.items.map((entry) => [entry.name, entry]))
  return [
    ...itemNames.filter((name) => !listed.has(name)).map((name) => `${name} is not in the index`),
    ...registry.index.items
      .map((entry) => entry.name)
      .filter((name) => !itemNames.includes(name))
      .map((name) => `${name} is in the index and is not an item`),
    ...(registry.index.items.length === listed.size ? [] : ['the index lists an item twice']),
    ...itemNames.flatMap((name) => {
      const item = registry.items.get(name)
      const entry = listed.get(name)
      return item === undefined || entry === undefined ? [] : itemFilesProblems(item, entry)
    }),
  ]
}

/**
 * The index validates against the pinned CLI's `registrySchema`, is named `navecss`, has the given
 * homepage, and lists exactly the named items with their files' `path`, `type` and `target` in the
 * item order and no `content`.
 */
export const indexProblems = (
  registry: LoadedRegistry,
  itemNames: readonly string[],
  homepage: string,
): string[] => {
  const parsed = registrySchema.safeParse(registry.index)
  return [
    ...(parsed.success
      ? []
      : parsed.error.issues.map(
          (issue) => `registry.json: ${issue.path.join('.')}: ${issue.message}`,
        )),
    ...(registry.index.name === 'navecss' ? [] : [`registry.json is named ${registry.index.name}`]),
    ...(registry.index.homepage === homepage
      ? []
      : [`registry.json homepage is ${String(registry.index.homepage)}, not ${homepage}`]),
    ...indexItemProblems(registry, itemNames),
  ]
}
