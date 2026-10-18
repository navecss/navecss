/**
 * The imports the graph treats by what they reach in `@navecss/core` rather than by their text:
 * the files `cxModules` lists, the files of core itself, which the graph does not read, and an
 * import that reaches core's `cx` module in a form the reader does not bind.
 */
import { CX_SOURCE } from '@navecss/core/collect'
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
 * Whether an edge of `importer` reaches core's `cx` module in a form the reader does not bind.
 * The reader binds an import or export of `cx` from the package's own specifier, and reports a
 * dynamic import of it itself; a `require()`, an `import x = require()` or any other specifier
 * that reaches the same file goes unread, so every call made through it would ship with no rule.
 */
export function isUnboundCxEdge(
  resolver: Resolver,
  importer: string,
  edge: Edge,
  files: readonly string[],
): boolean {
  if (!edge.isRequire && edge.specifier === CX_SOURCE) return false
  const cx = new Set(resolver.resolve(importer, CX_SOURCE, false).files)
  if (cx.size === 0) return false
  // core's `cx` has no `require` condition, so a `require()` of it is asked as an import too.
  const reached = edge.isRequire
    ? [...files, ...resolver.resolve(importer, edge.specifier, false).files]
    : files
  return reached.some((file) => cx.has(file))
}

/**
 * The files `cxModules` lists, resolved from the project directory, and the entries that are not
 * relative, which an import names as written.
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
