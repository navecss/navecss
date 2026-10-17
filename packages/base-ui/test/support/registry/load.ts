/**
 * Reading the registry the build wrote (`dist/registry/`), for the criteria that check it. An absent
 * registry throws: a check that skipped itself over nothing would pass, so it fails instead.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { PACKAGE_DIR } from '../stylesheet.ts'

export const REGISTRY_DIR = path.join(PACKAGE_DIR, 'dist/registry')

export interface RegistryFile {
  content?: string
  path: string
  target: string
  type: string
}

export interface RegistryItem {
  $schema?: string
  author?: string
  dependencies?: string[]
  description: string
  docs: string
  files: RegistryFile[]
  meta?: Record<string, unknown>
  name: string
  registryDependencies?: string[]
  title: string
  type: string
  [key: string]: unknown
}

export interface RegistryIndex {
  $schema?: string
  homepage?: string
  items: RegistryItem[]
  name: string
  [key: string]: unknown
}

export interface LoadedRegistry {
  /**
  The directory it was read from.
   */
  readonly directory: string
  /**
  Every file name in the directory, sorted by code unit.
   */
  readonly fileNames: string[]
  /**
  `registry.json`, parsed.
   */
  index: RegistryIndex
  /**
  Each `base-ui-<subpath>.json`, parsed, by item name.
   */
  items: Map<string, RegistryItem>
  /**
  Every file's text as written, by file name.
   */
  raw: Map<string, string>
}

const byCodeUnit = (a: string, b: string): number => {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * Reads the registry directory. Throws, naming the directory, when it is absent or has no index.
 */
export const loadRegistry = (directory: string = REGISTRY_DIR): LoadedRegistry => {
  if (!existsSync(directory)) {
    throw new Error(
      `${directory} is absent: the package build writes the registry, so run it first`,
    )
  }
  const fileNames = readdirSync(directory).toSorted(byCodeUnit)
  const raw = new Map(
    fileNames.map((name) => [name, readFileSync(path.join(directory, name), 'utf8')] as const),
  )
  const indexText = raw.get('registry.json')
  if (indexText === undefined) throw new Error(`${directory} has no registry.json`)
  const items = new Map<string, RegistryItem>()
  for (const [name, text] of raw) {
    if (name === 'registry.json' || !name.endsWith('.json')) continue
    const item = JSON.parse(text) as RegistryItem
    items.set(item.name, item)
  }
  return { directory, fileNames, index: JSON.parse(indexText) as RegistryIndex, items, raw }
}

/**
 * A deep copy a control may mutate without touching what was read or what is on disk.
 */
export const cloneRegistry = (registry: LoadedRegistry): LoadedRegistry => ({
  ...registry,
  fileNames: [...registry.fileNames],
  index: structuredClone(registry.index),
  items: structuredClone(registry.items),
  raw: new Map(registry.raw),
})

/**
 * Writes a registry (as parsed, items and index) into a directory as the generator prints it, for a
 * control that has to hand a mutated copy to a process.
 */
export const writeRegistry = (registry: LoadedRegistry, directory: string): void => {
  mkdirSync(directory, { recursive: true })
  for (const [name, item] of registry.items) {
    writeFileSync(path.join(directory, `${name}.json`), `${JSON.stringify(item, undefined, 2)}\n`)
  }
  writeFileSync(
    path.join(directory, 'registry.json'),
    `${JSON.stringify(registry.index, undefined, 2)}\n`,
  )
}

/**
 * The content of one file of an item, by its target's base name (`nave-dialog.module.css`).
 */
export const fileOf = (item: RegistryItem, base: string): string => {
  const file = item.files.find((candidate) => path.posix.basename(candidate.target) === base)
  if (file?.content === undefined) throw new Error(`${item.name} has no file ${base}`)
  return file.content
}
