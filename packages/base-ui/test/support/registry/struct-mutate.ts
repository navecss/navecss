/**
 * The small edits a control makes to a clone of the registry: one item, one file, one value.
 */
import path from 'node:path'

import type { LoadedRegistry, RegistryFile, RegistryItem } from './load.ts'

export const itemIn = (registry: LoadedRegistry, name: string): RegistryItem => {
  const item = registry.items.get(name)
  if (item === undefined) throw new Error(`the registry has no item ${name}`)
  return item
}

export const fileIn = (item: RegistryItem, base: string): RegistryFile => {
  const file = item.files.find((candidate) => path.posix.basename(candidate.target) === base)
  if (file === undefined) throw new Error(`${item.name} has no file ${base}`)
  return file
}

/**
 * Rewrites one file's content in a clone, and the item's text in `raw` with it.
 */
export const editFile = (
  registry: LoadedRegistry,
  itemName: string,
  base: string,
  edit: (content: string) => string,
): void => {
  const item = itemIn(registry, itemName)
  const file = fileIn(item, base)
  file.content = edit(file.content ?? '')
  registry.raw.set(`${itemName}.json`, `${JSON.stringify(item, undefined, 2)}\n`)
}

export const removeFile = (registry: LoadedRegistry, fileName: string): void => {
  registry.raw.delete(fileName)
  registry.items.delete(fileName.replace(/\.json$/, ''))
  const at = registry.fileNames.indexOf(fileName)
  if (at !== -1) registry.fileNames.splice(at, 1)
}

export const addFile = (registry: LoadedRegistry, fileName: string, text: string): void => {
  registry.raw.set(fileName, text)
  registry.fileNames.push(fileName)
  registry.fileNames.sort((a, b) => a.localeCompare(b))
}

export const itemsOf = (registry: LoadedRegistry): RegistryItem[] =>
  registry.items.values().toArray()
