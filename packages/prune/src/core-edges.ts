/**
 * The imports the graph treats by what they reach in `@navecss/core` rather than by their text:
 * the files `cxModules` lists, the files of core itself, which the graph does not read, and an
 * import that reaches core's `cx` module in a form the reader does not bind.
 */
import { CX_SOURCE } from '@navecss/core/collect'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { Edge } from './edges.ts'
import type { PackageInfo } from './packages.ts'
import type { Resolver } from './resolve.ts'

export const CORE_PACKAGE = '@navecss/core'

/**
 * Whether a file is one of `@navecss/core`'s own, which the graph does not read: its `cx` is the
 * binding the reader looks for, not a use of it.
 */
export function isCoreFile(packageOf: (file: string) => PackageInfo, file: string): boolean {
  return packageOf(file).name === CORE_PACKAGE
}

/**
 * Every file an export map entry names, under any condition, however nested.
 */
function targetsOf(entry: unknown): string[] {
  if (typeof entry === 'string') return [entry]
  if (typeof entry !== 'object' || entry === null) return []
  return Object.values(entry as Record<string, unknown>).flatMap((value) => targetsOf(value))
}

/**
 * The `./cx` files of the core package rooted at `dir`, none when `dir` holds another package.
 */
function cxFilesOfPackage(dir: string): ReadonlySet<string> {
  try {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>
      name?: string
    }
    if (manifest.name !== CORE_PACKAGE) return new Set()
    return new Set(targetsOf(manifest.exports?.['./cx']).map((target) => path.resolve(dir, target)))
  } catch {
    return new Set()
  }
}

/**
 * Returns a test of whether a file is the `./cx` module of a copy of core, wherever that copy
 * lives (nested in a package, vendored, installed under another name): the nearest
 * `package.json` above the file is core's, and its `./cx` export names the file under some
 * condition. Each `package.json` it opens is added to `read`.
 */
export function createCxFileTest(read = new Set<string>()): (file: string) => boolean {
  const byPackage = new Map<string, ReadonlySet<string>>()
  return (file) => {
    for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
      if (existsSync(path.join(dir, 'package.json'))) {
        if (!byPackage.has(dir)) {
          read.add(path.join(dir, 'package.json'))
          byPackage.set(dir, cxFilesOfPackage(dir))
        }
        return byPackage.get(dir)?.has(file) === true
      }
      if (path.dirname(dir) === dir) return false
    }
  }
}

/**
 * Whether an edge of `importer` reaches core's `cx` module in a form the reader does not bind.
 * The reader binds an import or export of `cx` from the package's own specifier, and reports a
 * dynamic import of it itself; a `require()`, an `import x = require()` or any other specifier
 * that reaches the same file goes unread, so every call made through it would ship with no rule.
 */
export function isUnboundCxEdge(
  walk: { readonly isCxFile: (file: string) => boolean; readonly resolver: Resolver },
  importer: string,
  edge: Edge,
  files: readonly string[],
): boolean {
  if (!edge.isRequire && edge.specifier === CX_SOURCE) return false
  const { resolver, isCxFile } = walk
  const cx = new Set(resolver.resolve(importer, CX_SOURCE, false).files)
  // core's `cx` has no `require` condition, so a `require()` of it is asked as an import too.
  const reached = edge.isRequire
    ? [...files, ...resolver.resolve(importer, edge.specifier, false).files]
    : files
  return reached.some((file) => cx.has(file) || isCxFile(file))
}

/**
 * The files `cxModules` lists, resolved from the project directory, and the entries that are not
 * relative, which an import counts as naming when it is written the same. An entry that starts
 * with `#` is bound by file instead: an import of it counts only when the scope of the importing
 * file maps it to one of the listed files.
 */
export function declaredModules(
  dir: string,
  cxModules: readonly string[],
  resolver: Resolver,
): { entries: Set<string>; files: Set<string> } {
  const files = new Set<string>()
  const entries = new Set<string>()
  const from = path.join(dir, 'next.config')
  for (const entry of cxModules) {
    if (entry === CX_SOURCE) continue
    const found = resolver.resolve(from, entry, false).files
    for (const file of found) files.add(file)
    if (!entry.startsWith('.') && !path.isAbsolute(entry)) entries.add(entry)
  }
  return { files, entries }
}
