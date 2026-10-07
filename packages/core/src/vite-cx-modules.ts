/**
 * `cxModules`: the modules a consumer lists as re-exporting Nave's `cx`, and what the post-order
 * half does with them. An import is from a listed module when its specifier equals an entry as
 * written, or resolves, from the importing module, to a listed module's file. A module is parsed
 * only when its text can name one (a text test, so an application of thousands of modules parses
 * the importers and no more), and a build-end check compares the importers it recognised with the
 * module graph's, so an import through a spelling the text test cannot see fails the build
 * instead of shipping every call made through it with no rule.
 */
import path from 'node:path'

import type { AstNode } from './vite-ast.ts'
import type { RootState } from './vite-state.ts'
import type { UsedContext } from './vite-used.ts'

import { CX_SOURCE } from './vite-collect.ts'
import { filePathOf } from './vite-css-id.ts'
import { specifiersIn } from './vite-cx-importers.ts'

interface Resolver {
  resolve?(source: string, importer?: string): Promise<{ readonly id: string } | null>
}

export interface DeclaredModules {
  /**
   * The entries as written.
   */
  readonly entries: ReadonlySet<string>
  /**
   * The module id each entry resolves to; an entry that resolves to nothing has none.
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
async function resolveOrNull(
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
 * Resolves every entry from the project root with the host's resolver.
 */
async function resolveEntries(context: UsedContext, resolver: Resolver): Promise<DeclaredModules> {
  const from = path.join(context.root, 'index.html')
  const resolved = await Promise.all(
    context.options.cxModules.map(async (entry) => {
      const found = await resolveOrNull(resolver, entry, from)
      return [entry, found?.id] as const
    }),
  )
  const ids = new Map(resolved.filter((pair): pair is [string, string] => pair[1] !== undefined))
  const files = new Set(ids.values().map((id) => fileOf(id)))
  return {
    entries: new Set(context.options.cxModules),
    ids,
    files,
    names: new Set(files.values().flatMap((file) => namesOf(file))),
  }
}

/**
 * Forgets what an environment resolved and recognised, as it starts building again.
 */
export function forgetDeclared(state: RootState, environment: string): void {
  state.declared.delete(environment)
  const prefix = `${environment}\0`
  for (const key of state.recognised) if (key.startsWith(prefix)) state.recognised.delete(key)
}

/**
 * Whether `specifier`'s last segment, without its extension, is the name of a listed file.
 */
function isNamingListed(specifier: string, declared: DeclaredModules): boolean {
  const segment = specifier.slice(specifier.lastIndexOf('/') + 1)
  if (declared.names.has(segment)) return true
  const extension = path.extname(segment)
  return extension !== '' && declared.names.has(segment.slice(0, -extension.length))
}

// A quoted string with no escape and no line break: the specifiers the text test reads.
const QUOTED = /['"`]([^\n'"\\`]*)['"`]/g

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
function isListedFile(declared: DeclaredModules, id: string): boolean {
  return declared.files.has(fileOf(id))
}

/**
 * Whether the text could import a listed module: it holds an entry as written, or a quoted
 * specifier whose last segment names a listed file. A false candidate is rejected by resolution.
 */
function isMentioningDeclared(code: string, declared: DeclaredModules): boolean {
  for (const entry of declared.entries) if (code.includes(entry)) return true
  for (const match of code.matchAll(QUOTED)) if (isNamingListed(match[1]!, declared)) return true
  return false
}

/**
 * The key a recognised import is held under.
 */
export function recognisedKey(environment: string, file: string, importer: string): string {
  return `${environment}\0${file}\0${importer}`
}

interface Reading {
  readonly code: string
  readonly id: string
  readonly program: AstNode
}

/**
 * What the module `id` is, as to `cxModules`: whether it is listed itself, and which of the
 * specifiers it imports name a listed module. Each import it recognises is kept for the build-end
 * check.
 */
export async function declaredReadingOf(
  context: UsedContext,
  resolver: Resolver,
  declared: DeclaredModules | undefined,
  input: { readonly environment: string; readonly module: Reading },
): Promise<{ readonly declaredSources: Set<string>; readonly isDeclared: boolean }> {
  const { environment, module } = input
  const declaredSources = new Set<string>()
  if (!declared) return { declaredSources, isDeclared: false }
  for (const source of specifiersIn(module.program)) {
    if (source === CX_SOURCE) continue
    const found = await listedFileOf(resolver, declared, source, module.id)
    if (!found) continue
    declaredSources.add(source)
    if (found.file !== undefined) {
      context.state.recognised.add(recognisedKey(environment, found.file, module.id))
    }
  }
  return { declaredSources, isDeclared: isListedFile(declared, module.id) }
}

/**
 * Whether `source`, written in `importer`, names a listed module, and the file when it is known:
 * an entry as written names its module whether or not it resolved, and any other specifier that
 * passes the text test names one when it resolves to a listed file.
 */
async function listedFileOf(
  resolver: Resolver,
  declared: DeclaredModules,
  source: string,
  importer: string,
): Promise<{ readonly file: string | undefined } | undefined> {
  if (declared.entries.has(source)) {
    const id = declared.ids.get(source)
    return { file: id === undefined ? undefined : fileOf(id) }
  }
  if (!isNamingListed(source, declared)) return undefined
  const resolved = await resolveOrNull(resolver, source, importer)
  const file = resolved ? fileOf(resolved.id) : undefined
  return file !== undefined && declared.files.has(file) ? { file } : undefined
}
