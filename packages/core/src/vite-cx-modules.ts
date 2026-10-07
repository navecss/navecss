/**
 * `cxModules`: the modules a consumer lists as re-exporting Nave's `cx`, and what the post-order
 * half does with them. An import is from a listed module when its specifier resolves, from the
 * importing module, to a listed module's file, or, for an entry that is not relative, when it
 * equals the entry as written (a relative specifier names a file relative to the module that
 * writes it, so its text alone names nothing). An entry that is, or resolves to, Nave's own `cx`
 * module is no entry: that module is always followed. A module is parsed only when its text can
 * name a listed one (a text test, so an application of thousands of modules parses the importers
 * and no more), and a build-end check compares the importers it recognised with the module
 * graph's, so an import through a spelling the text test cannot see fails the build instead of
 * shipping every call made through it with no rule.
 */
import path from 'node:path'

import type { RootState } from './vite-state.ts'
import type { UsedContext } from './vite-used.ts'

import { CX_SOURCE } from './vite-collect.ts'
import { filePathOf } from './vite-css-id.ts'
import { textTestOf } from './vite-cx-text-test.ts'

export interface Resolver {
  resolve?(source: string, importer?: string): Promise<{ readonly id: string } | null>
}

export interface DeclaredModules {
  /**
   * The entries a specifier may equal as written: every entry but a relative one.
   */
  readonly entries: ReadonlySet<string>
  /**
   * The module id each entry resolves to from the project root; an entry that resolves to nothing
   * has none.
   */
  readonly ids: ReadonlyMap<string, string>
  /**
   * The files the entries resolve to.
   */
  readonly files: ReadonlySet<string>
  /**
   * The names a specifier's last segment may carry to name a listed file: its name without its
   * extension, and its directory's when it is an `index` file.
   */
  readonly names: ReadonlySet<string>
  /**
   * Finds, in a module's text, a quoted specifier that can name a listed file: one whose last
   * segment is one of `names`, or a directory specifier that writes no name when a listed file
   * is an `index` file. `undefined` when no listed file resolved.
   */
  readonly textTest: RegExp | undefined
}

/**
 * Whether an entry or a specifier is relative: a path from the module that writes it, whatever
 * `?query` or `#hash` follows it (`.?v=1` is the directory `.`).
 */
export function isRelative(text: string): boolean {
  const cut = text.search(/[#?]/)
  const path = cut === -1 ? text : text.slice(0, cut)
  return path === '.' || path === '..' || path.startsWith('./') || path.startsWith('../')
}

/**
 * A module id as a forward-slash file path, query removed.
 */
export function fileOf(id: string): string {
  return filePathOf(id).replaceAll('\\', '/')
}

/**
 * The names a specifier may end in to name `file`.
 */
function namesOf(file: string): string[] {
  const name = path.basename(file, path.extname(file))
  return name === 'index' ? [name, path.basename(path.dirname(file))] : [name]
}

/**
 * The entries as written whose file, resolved from the project root, is the file of the module
 * `id`.
 */
export function entriesNaming(declared: DeclaredModules, id: string): string[] {
  const file = fileOf(id)
  return declared.ids
    .entries()
    .filter(([, resolved]) => fileOf(resolved) === file)
    .map(([entry]) => entry)
    .toArray()
}

/**
 * The listed modules for one environment of the build, resolved from the project root once and
 * held until the environment starts building again. `undefined` when none are listed.
 */
export async function declaredModulesFor(
  context: UsedContext,
  resolver: Resolver,
  environment: string,
): Promise<DeclaredModules | undefined> {
  const { cxModules } = context.options
  if (cxModules.length === 0) return undefined
  const known = context.state.declared.get(environment)
  if (known) return known
  const made = resolveEntries(context, resolver)
  context.state.declared.set(environment, made)
  return made
}

/**
 * What the host's resolver says of `source` from `importer`: nothing when it has no answer or fails.
 */
export async function resolveOrNull(
  resolver: Resolver,
  source: string,
  importer: string,
): Promise<{ readonly id: string } | undefined> {
  try {
    return (await resolver.resolve?.(source, importer)) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Resolves every entry from the project root with the host's resolver, leaving out an entry that
 * is, or resolves to, Nave's own `cx` module.
 */
async function resolveEntries(context: UsedContext, resolver: Resolver): Promise<DeclaredModules> {
  const from = path.join(context.root, 'index.html')
  const nave = await resolveOrNull(resolver, CX_SOURCE, from)
  const naveFile = nave === undefined ? undefined : fileOf(nave.id)
  const resolved = await Promise.all(
    context.options.cxModules.map(async (entry) => {
      const found = await resolveOrNull(resolver, entry, from)
      return [entry, found?.id] as const
    }),
  )
  const kept = resolved.filter(
    ([entry, id]) => entry !== CX_SOURCE && (id === undefined || fileOf(id) !== naveFile),
  )
  const ids = new Map(kept.filter((pair): pair is [string, string] => pair[1] !== undefined))
  const files = new Set(ids.values().map((id) => fileOf(id)))
  const names = new Set(files.values().flatMap((file) => namesOf(file)))
  return {
    entries: new Set(kept.map(([entry]) => entry).filter((entry) => !isRelative(entry))),
    ids,
    files,
    names,
    textTest: textTestOf(names),
  }
}

/**
 * Forgets what an environment resolved and recognised, as it starts building again.
 */
export function forgetDeclared(state: RootState, environment: string): void {
  state.declared.delete(environment)
  const prefix = `${environment}\0`
  for (const key of state.recognised.keys())
    if (key.startsWith(prefix)) state.recognised.delete(key)
}

/**
 * The last path segment of a specifier, as the text test reads it: without a `?query` or a
 * `#hash` (a leading `#` begins a Node subpath import and is part of the specifier), without a
 * trailing `/`, and `index` for a directory specifier that writes no name.
 */
function lastSegmentOf(specifier: string): string {
  const cut = specifier.slice(1).search(/[#?]/)
  const bare = (cut === -1 ? specifier : specifier.slice(0, cut + 1)).replace(/\/+$/, '')
  const segment = bare.slice(bare.lastIndexOf('/') + 1)
  return segment === '.' || segment === '..' ? 'index' : segment
}

/**
 * Whether `specifier`'s last segment, without its extension, is the name of a listed file.
 */
export function isNamingListed(specifier: string, declared: DeclaredModules): boolean {
  const segment = lastSegmentOf(specifier)
  if (declared.names.has(segment)) return true
  const extension = path.extname(segment)
  return extension !== '' && declared.names.has(segment.slice(0, -extension.length))
}

/**
 * Whether the module could be about a listed module: it is one itself, or its text can import
 * one. Always `false` when `cxModules` lists none.
 */
export function isAboutListed(
  input: { readonly code: string; readonly id: string },
  declared: DeclaredModules | undefined,
): boolean {
  if (!declared) return false
  return isListedFile(declared, input.id) || isMentioningDeclared(input.code, declared)
}

/**
 * Whether the module `id` is one of the listed files. It is always read, whatever its text says,
 * since a listed module that exports a `cx` of its own is a problem.
 */
export function isListedFile(declared: DeclaredModules, id: string): boolean {
  return declared.files.has(fileOf(id))
}

/**
 * Whether the text could import a listed module: it holds an entry as written, or a quoted
 * specifier whose last segment names a listed file. A false candidate is rejected by resolution.
 */
function isMentioningDeclared(code: string, declared: DeclaredModules): boolean {
  for (const entry of declared.entries) if (code.includes(entry)) return true
  return declared.textTest?.test(code) ?? false
}

/**
 * The key the recognised imports of one importer of a listed file are held under; the value is the
 * specifiers it was recognised through.
 */
export function recognisedKey(environment: string, file: string, importer: string): string {
  return `${environment}\0${file}\0${importer}`
}
