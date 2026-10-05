/**
 * Reading the built package: its manifest, its modules and its declaration files.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { PACKAGE_DIR } from './stylesheet.ts'

export const DIST_DIR = path.join(PACKAGE_DIR, 'dist')
export const SRC_DIR = path.join(PACKAGE_DIR, 'src')

export const manifest = (): {
  exports: Record<string, unknown>
  license: string
  sideEffects: unknown
} => JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as never

/**
Every file under a directory with one of the extensions, as paths relative to it.
 */
export const filesUnder = (directory: string, extensions: readonly string[]): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .toSorted()

export const readDist = (relative: string): string =>
  readFileSync(path.join(DIST_DIR, relative), 'utf8')

/**
Imports a built module of the package.
 */
export const importDist = (relative: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ pathToFileURL(path.join(DIST_DIR, relative)).href) as Promise<
    Record<string, unknown>
  >
