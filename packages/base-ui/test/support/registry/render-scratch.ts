/**
 * The copies as files on disk, for the criteria that import, compile or lint them. A scratch
 * directory sits inside the package (the copies resolve `react` and Base UI through its
 * `node_modules`, and the render runs apply their aliases to files Vite transforms, which files under
 * `node_modules` are not) and is removed when the test is done.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { RegistryItem } from './load.ts'

import { PACKAGE_DIR } from '../stylesheet.ts'

/**
 * A new, empty directory named `<prefix>XXXXXX` under `parent` (relative to the package).
 */
export const makeScratchDirectory = (parent: string, prefix: string): string => {
  const base = path.join(PACKAGE_DIR, parent)
  mkdirSync(base, { recursive: true })
  return mkdtempSync(path.join(base, prefix))
}

export const removeScratchDirectory = (directory: string): void => {
  rmSync(directory, { force: true, recursive: true })
}

/**
 * Writes an item's files into a directory under their target's base name and returns those names.
 */
export const writeItemFiles = (item: RegistryItem, directory: string): string[] =>
  item.files.map((file) => {
    if (file.content === undefined) throw new Error(`${item.name}: ${file.target} has no content`)
    const name = path.posix.basename(file.target)
    writeFileSync(path.join(directory, name), file.content)
    return name
  })

/**
 * Writes every given item into one directory (the file names are prefixed by subpath, and every
 * item's licence file is the same bytes), and returns each item's file names by item name.
 */
export const writeCopies = (
  items: Iterable<RegistryItem>,
  directory: string,
): Map<string, string[]> =>
  new Map([...items].map((item) => [item.name, writeItemFiles(item, directory)] as const))
