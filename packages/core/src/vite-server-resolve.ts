/**
 * The file a server loads for an import of a package it leaves external. A server environment
 * resolves such an import to the specifier itself, not to a file, and a package's `exports` can
 * name a different file for the server's conditions than for the client's, so the file is found
 * here, by the rules of the `exports` map under the server's conditions, from the importer.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

type Target = Readonly<Record<string, unknown>> | readonly unknown[] | string | null | undefined

const PACKAGE_NAME = /^(@[^/]+\/[^/]+|[^./@][^/]*)(\/.*)?$/
const EXTENSIONS = ['', '.js', '.mjs', '.cjs', '/index.js', '/index.mjs', '/index.cjs']

/**
 * The directory of the package `name`, found from `directory` upward.
 */
function packageDirectory(directory: string, name: string): string | undefined {
  for (let current = directory; ; current = path.dirname(current)) {
    const found = path.join(current, 'node_modules', name)
    if (existsSync(path.join(found, 'package.json'))) return found
    if (path.dirname(current) === current) return undefined
  }
}

/**
 * The file a target names under the conditions: a string is the file, an array the first that
 * resolves, an object the first of its keys that is a condition that holds.
 */
function targetFile(
  target: Target,
  input: { conditions: ReadonlySet<string>; match: string },
): string | undefined {
  if (typeof target === 'string') return target.split('*').join(input.match)
  if (Array.isArray(target)) {
    return target
      .map((item) => targetFile(item as Target, input))
      .find((file) => file !== undefined)
  }
  if (target === null || typeof target !== 'object') return undefined
  const entries = Object.entries(target as Record<string, unknown>)
  const key = entries.find(([name]) => input.conditions.has(name) || name === 'default')
  return key === undefined ? undefined : targetFile(key[1] as Target, input)
}

/**
 * The target the `exports` map holds for the subpath, with what its pattern's star matched.
 */
function exportsEntry(
  exported: Target,
  subpath: string,
): { match: string; target: Target } | undefined {
  const isMap =
    exported !== null &&
    typeof exported === 'object' &&
    !Array.isArray(exported) &&
    Object.keys(exported).every((key) => key.startsWith('.'))
  if (!isMap) return subpath === '.' ? { match: '', target: exported } : undefined
  const map = exported as Record<string, Target>
  if (Object.hasOwn(map, subpath)) return { match: '', target: map[subpath] }
  const patterns = Object.keys(map)
    .filter((key) => key.includes('*') && subpath.startsWith(key.slice(0, key.indexOf('*'))))
    .toSorted((a, b) => b.length - a.length)
  const pattern = patterns.find((key) => subpath.endsWith(key.slice(key.indexOf('*') + 1)))
  if (pattern === undefined) return undefined
  const [head, tail] = pattern.split('*') as [string, string]
  return { match: subpath.slice(head.length, subpath.length - tail.length), target: map[pattern] }
}

/**
 * The first of the candidate paths that is a file.
 */
function existingFile(base: string): string | undefined {
  return EXTENSIONS.map((extension) => `${base}${extension}`).find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  )
}

/**
 * The `package.json` of the package in `directory`.
 */
function manifestOf(directory: string): { exports?: Target; main?: string } | undefined {
  try {
    return JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as {
      exports?: Target
      main?: string
    }
  } catch {
    return undefined
  }
}

/**
 * The path, relative to the package, the subpath names: what the `exports` map says under the
 * conditions, or, for a package with none, its `main` or the subpath itself.
 */
function relativeTarget(
  manifest: { exports?: Target; main?: string },
  input: { readonly conditions: ReadonlySet<string>; readonly subpath: string },
): string | undefined {
  const { conditions, subpath } = input
  if (manifest.exports === undefined) {
    return subpath === '.' ? (manifest.main ?? 'index.js') : subpath
  }
  const entry = exportsEntry(manifest.exports, subpath)
  return entry ? targetFile(entry.target, { conditions, match: entry.match }) : undefined
}

/**
 * The file `specifier` names from the module at `from` under the conditions, or `undefined` when
 * it names no file of a package found in `node_modules`.
 */
export function serverFileOf(input: {
  readonly conditions: readonly string[]
  readonly from: string
  readonly specifier: string
}): string | undefined {
  const parts = PACKAGE_NAME.exec(input.specifier)
  const directory = parts && packageDirectory(path.dirname(input.from), parts[1]!)
  const manifest = directory ? manifestOf(directory) : undefined
  if (!parts || !directory || !manifest) return undefined
  const subpath = parts[2] === undefined ? '.' : `.${parts[2]}`
  const relative = relativeTarget(manifest, { conditions: new Set(input.conditions), subpath })
  const file = relative === undefined ? undefined : existingFile(path.join(directory, relative))
  return file === undefined ? undefined : realpathSync(file)
}
