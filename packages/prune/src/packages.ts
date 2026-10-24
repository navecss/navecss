/**
 * What the graph needs to know about the package a file belongs to.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export interface PackageInfo {
  readonly name: string | undefined
  /**
   * Whether the package lists `@navecss/core`, or a package named in `cxModules`, in its
   * `dependencies` or `peerDependencies`: its imports are checked.
   */
  readonly isNaveAware: boolean
}

const NO_PACKAGE: PackageInfo = { name: undefined, isNaveAware: false }

/**
 * The package name a specifier names: `@scope/name` or `name`, without a subpath.
 */
export function packageNameOfSpecifier(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

/**
 * Reads `package.json` of the package that holds a file under `node_modules`, caching by directory.
 * Each `package.json` it opens is added to `read`.
 */
export function createPackageReader(
  naveNames: ReadonlySet<string>,
  read = new Set<string>(),
): (file: string) => PackageInfo {
  const cache = new Map<string, PackageInfo>()
  const infoAt = (dir: string): PackageInfo => {
    const manifestFile = path.join(dir, 'package.json')
    if (!existsSync(manifestFile)) return NO_PACKAGE
    read.add(manifestFile)
    try {
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
        dependencies?: Record<string, string>
        name?: string
        peerDependencies?: Record<string, string>
      }
      const listed = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
      ])
      const isNaveAware = [...naveNames].some((name) => listed.has(name))
      return { name: manifest.name, isNaveAware }
    } catch {
      return NO_PACKAGE
    }
  }
  return (file) => {
    let dir = path.dirname(file)
    const visited: string[] = []
    for (;;) {
      const known = cache.get(dir)
      if (known) return fill(cache, visited, known)
      visited.push(dir)
      const info = infoAt(dir)
      if (info !== NO_PACKAGE) return fill(cache, visited, info)
      const parent = path.dirname(dir)
      if (parent === dir || path.basename(dir) === 'node_modules') return NO_PACKAGE
      dir = parent
    }
  }
}

/**
 * Remembers `info` for every directory visited on the way to it.
 */
function fill(
  cache: Map<string, PackageInfo>,
  visited: readonly string[],
  info: PackageInfo,
): PackageInfo {
  for (const dir of visited) cache.set(dir, info)
  return info
}
