/**
 * Resolving and loading a PostCSS `extend` module specifier, split out
 * of `postcss.ts` to keep that file under the project's file-length lint.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

import type { ExtendMap } from './directive/resolve.ts'

/**
 * Resolves an `extend` module specifier against `process.cwd()` at plugin
 * construction: an unresolvable specifier fails right
 * there, naming the specifier and the directory, so the error surfaces when
 * the host's config loads rather than on the first stylesheet.
 *
 * `fs`/`url` are namespace imports, not named ones: a named import
 * (`import { existsSync } from 'node:fs'`) fails to even LOAD this module
 * under a browser-targeting bundler (Vite's client externalization rejects
 * the binding at import time, not merely on use), which breaks importing
 * `postcss.ts` in any context that never calls this function at all — a real
 * bundled Vitest browser-mode suite hit exactly this. A namespace import
 * only fails on the property ACCESS these two functions never reach unless
 * `extend` is genuinely a specifier.
 */
export function resolveExtendSpecifier(specifier: string): string {
  const dir = process.cwd()
  const file = path.resolve(dir, specifier)
  // A directory resolves (an empty specifier, or one ending "/", both land
  // on one) but is never a loadable module: caught here, at construction,
  // rather than left to surface later as a directory-import error from the
  // dynamic `import()` this specifier eventually feeds.
  const stats = fs.existsSync(file) ? fs.statSync(file) : undefined
  if (!stats?.isFile()) {
    throw new Error(`@nave: cannot find extend module "${specifier}" from "${dir}"`)
  }
  return file
}

/**
 * Whether `file`'s extension is `.json`, ASCII case-insensitively: the one
 * other file type Node's own `import()` loads without a bundler in between,
 * alongside a JavaScript module.
 */
function isJsonPath(file: string): boolean {
  return path.extname(file).toLowerCase() === '.json'
}

/**
 * A variable, not an inline object literal at the `import()` call site, so
 * a bundler's own downlevel transform for import attributes (which some
 * versions rewrite from `with` to the older, now Node-incompatible `assert`
 * keyword) never recognises this as that syntax to rewrite: `import()`'s
 * second argument is ordinary data to it, opaque past this point.
 */
const JSON_MODULE_IMPORT_OPTIONS: ImportCallOptions = { with: { type: 'json' } }

/**
 * Reads `moduleUrl`'s default export as one run's extend map. A `.json`
 * path loads as a JSON module (an import attribute Node requires for that
 * type), whose default export is the parsed top-level value — the web
 * standard for loading JSON this way, rather than a bespoke `readFile` +
 * `JSON.parse` path with its own cache-busting and error shape to maintain.
 */
async function importExtendMap(moduleUrl: string, file: string): Promise<ExtendMap> {
  const loaded = (
    isJsonPath(file) ? await import(moduleUrl, JSON_MODULE_IMPORT_OPTIONS) : await import(moduleUrl)
  ) as { default?: unknown }
  const value = loaded.default
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `@nave: extend module "${file}" must have a default export that is a plain object`,
    )
  }
  return value as ExtendMap
}

/**
 * Loads `file`'s default export as one run's extend map. Cache-busts on the
 * file's own content hash so a dev server sees an edit without a process
 * restart (Node's `import()` cache cannot otherwise be
 * invalidated) — a `mtime`/size key would miss a size-preserving edit, or one
 * whose mtime a build step restores to its old value. `cache` is the plugin
 * instance's own map, so concurrent runs against an unchanged file share one
 * `import()` instead of racing two.
 */
function loadExtendModule(
  file: string,
  cache: Map<string, Promise<ExtendMap>>,
): Promise<ExtendMap> {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const moduleUrl = `${url.pathToFileURL(file).href}?v=${digest}`
  const cached = cache.get(moduleUrl)
  if (cached) return cached

  const pending = importExtendMap(moduleUrl, file)
  cache.set(moduleUrl, pending)
  return pending
}

/**
 * Awaits `loadExtendModule` and applies its result via `setExtend`. Kept as
 * its own `async` function so `postcss.ts`'s `Once` hook — which must return
 * a bare `undefined`, not a promise, for the object form (only the
 * specifier form is async) — never has to be declared `async` itself; an
 * `async` function always returns a promise, awaited or not.
 */
export async function applyExtendModule(
  file: string,
  cache: Map<string, Promise<ExtendMap>>,
  setExtend: (value: ExtendMap) => void,
): Promise<void> {
  setExtend(await loadExtendModule(file, cache))
}
