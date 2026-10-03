/**
 * Which module is whose: Nave's own, a dependency's (a path under `node_modules`), or the
 * application's; the name of the package a dependency's module belongs to; and the path a message
 * prints for a module, relative to the project root.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { filePathOf } from './vite-css-id.ts'

/**
 * The directories of the installed `@navecss/core` package that hold its modules: this file sits
 * in one of them, `src/` (run from source) or `dist/` (run from the package), and the package
 * ships nothing else that is JavaScript. (Naming them, not the whole package directory, keeps a
 * project that lives inside this repository, such as a test fixture, from reading as Nave's own.)
 */
const NAVE_MODULE_DIRS = ['src', 'dist'].map(
  (name) =>
    `${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', name).replaceAll('\\', '/')}/`,
)

/**
 * A module id as a forward-slash path, query removed.
 */
function pathOfId(id: string): string {
  return filePathOf(id).replaceAll('\\', '/')
}

/**
 * Whether the module lies inside the installed `@navecss/core` package's module directories.
 */
export function isNaveOwn(id: string): boolean {
  const file = pathOfId(id)
  return NAVE_MODULE_DIRS.some((directory) => file.startsWith(directory))
}

/**
 * Whether the module's resolved path lies under `node_modules`.
 */
export function isDependencyId(id: string): boolean {
  return pathOfId(id).includes('/node_modules/')
}

/**
 * The `name` in the nearest `package.json` above `file` that has one, or `undefined`. A nested
 * `package.json` without a name, as some `dist/` folders carry, is skipped.
 */
export async function packageNameOf(
  file: string,
  cache: Map<string, Promise<string | undefined>>,
): Promise<string | undefined> {
  const directory = path.dirname(file)
  const cached = cache.get(directory)
  if (cached) return cached
  const found = nameAbove(directory, cache)
  cache.set(directory, found)
  return found
}

/**
 * The name in `directory`'s `package.json`, or else the one above it.
 */
async function nameAbove(
  directory: string,
  cache: Map<string, Promise<string | undefined>>,
): Promise<string | undefined> {
  const name = await readName(directory)
  const parent = path.dirname(directory)
  if (name !== undefined || parent === directory) return name
  return packageNameOf(directory, cache)
}

/**
 * The `name` of the `package.json` in `directory`, if there is one.
 */
async function readName(directory: string): Promise<string | undefined> {
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as {
      name?: unknown
    }
    return typeof manifest.name === 'string' ? manifest.name : undefined
  } catch {
    return undefined
  }
}

/**
 * The path a message names `id` by: relative to `root`, forward slashes, no query. A virtual
 * module has no file to be relative to, so it is named by the id the host gave it, a leading NUL
 * written `\0`.
 */
export function moduleLabel(root: string, id: string): string {
  const file = filePathOf(id)
  if (file.startsWith('\0')) return String.raw`\0${file.slice(1)}`
  if (!path.isAbsolute(file)) return file
  return path.relative(root, file).replaceAll('\\', '/')
}
