/**
 * Reading `extend`, once per run, for both halves of the plugin: the `@nave` expansion and the
 * names of the consumer's own atoms. A path is read the way `@navecss/core/postcss` reads it:
 * resolved against the project directory, refused when it names no file, a `.json` file parsed
 * from its text, any other module loaded by a URL keyed on its content so an edit is seen.
 */
import type { AtomDefinition } from '@navecss/core/postcss'

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { NaveOptions } from './options.ts'

import { digestOf } from './digest.ts'

export type ExtendMap = Readonly<Record<string, AtomDefinition>>

/**
 * The file a path-valued `extend` names, read against the project directory. Throws, naming the
 * path as given and the directory, when it names no file.
 */
function extendFileOf(specifier: string, dir: string): string {
  const file = path.resolve(dir, specifier)
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`@nave: cannot find extend module "${specifier}" from "${dir}"`)
  }
  return file
}

/**
 * The default export of the module in `file`, or the parsed text of a `.json` file.
 */
async function defaultExportOf(file: string): Promise<unknown> {
  if (path.extname(file).toLowerCase() === '.json') {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  }
  const url = `${pathToFileURL(file).href}?v=${digestOf(readFileSync(file))}`
  return ((await import(url)) as { default?: unknown }).default
}

/**
 * The map a path-valued `extend` names. Throws when the path names no file, or a module whose
 * default export is not a plain object.
 */
async function loadExtendFile(specifier: string, dir: string): Promise<ExtendMap> {
  const file = extendFileOf(specifier, dir)
  const value = await defaultExportOf(file)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `@nave: extend module "${file}" must have a default export that is a plain object`,
    )
  }
  return value as ExtendMap
}

/**
 * The consumer's own atoms `extend` defines, or `undefined` when there is no `extend`. Throws when
 * a path names no file or a module whose default export is not a plain object. Core's plugin
 * validates the map when the stylesheet's plugin is made.
 */
export async function loadExtend(
  options: NaveOptions,
  dir: string,
): Promise<ExtendMap | undefined> {
  const { extend } = options
  return typeof extend === 'string' ? await loadExtendFile(extend, dir) : extend
}
