/**
 * What a module is, as to `cxModules`, read from its parse: whether it is listed itself, which of
 * the specifiers it imports name a listed module, and which of those imports the build-end check
 * need not look at again.
 */
import type { AstNode } from './vite-ast.ts'
import type { DeclaredModules, Resolver } from './vite-cx-modules.ts'
import type { UsedContext } from './vite-used.ts'

import { CX_SOURCE } from './vite-collect.ts'
import { specifiersIn } from './vite-cx-importers.ts'
import {
  fileOf,
  isListedFile,
  isNamingListed,
  recognisedKey,
  resolveOrNull,
} from './vite-cx-modules.ts'

interface Reading {
  readonly code: string
  readonly id: string
  readonly program: AstNode
}

/**
 * What the module `id` is, as to `cxModules`: whether it is listed itself, which of the specifiers
 * it imports name a listed module, and `onlyVia`, the listed files it reads a `cx` from when it
 * reads no other (`undefined` when it also imports Nave's own, or reads a source whose file is
 * not known). Each import it recognises is kept, with its specifier, for the build-end check.
 */
export async function declaredReadingOf(
  context: UsedContext,
  resolver: Resolver,
  declared: DeclaredModules | undefined,
  input: { readonly environment: string; readonly module: Reading },
): Promise<{
  readonly declaredSources: Set<string>
  readonly isDeclared: boolean
  readonly onlyVia: ReadonlySet<string> | undefined
}> {
  const { environment, module } = input
  const declaredSources = new Set<string>()
  if (!declared) return { declaredSources, isDeclared: false, onlyVia: undefined }
  const files = new Set<string>()
  let isOnlyListed = true
  for (const source of specifiersIn(module.program)) {
    if (source === CX_SOURCE) {
      isOnlyListed = false
      continue
    }
    const found = await listedFileOf(resolver, declared, source, module.id)
    if (!found) continue
    declaredSources.add(source)
    if (found.file === undefined) {
      isOnlyListed = false
      continue
    }
    files.add(found.file)
    const key = recognisedKey(environment, found.file, module.id)
    context.state.recognised.set(
      key,
      new Set([...(context.state.recognised.get(key) ?? []), source]),
    )
  }
  return {
    declaredSources,
    isDeclared: isListedFile(declared, module.id),
    onlyVia: isOnlyListed && files.size > 0 ? files : undefined,
  }
}

/**
 * The listed file `source` resolves to from `importer`, if it resolves to one.
 */
async function listedFileFrom(
  resolver: Resolver,
  declared: DeclaredModules,
  source: string,
  importer: string,
): Promise<string | undefined> {
  const resolved = await resolveOrNull(resolver, source, importer)
  const file = resolved ? fileOf(resolved.id) : undefined
  return file !== undefined && declared.files.has(file) ? file : undefined
}

/**
 * Whether `source`, written in `importer`, names a listed module, and the file when it is known:
 * an entry that is not relative names its module as written, whether or not it resolved from the
 * root (when it did not, the importer's own resolution says which file), and any other specifier
 * that passes the text test names one when it resolves to a listed file. A `#` import is a
 * subpath import of the nearest `package.json`, so its text names nothing: it binds only when it
 * resolves, from its own module, to a listed file.
 */
async function listedFileOf(
  resolver: Resolver,
  declared: DeclaredModules,
  source: string,
  importer: string,
): Promise<{ readonly file: string | undefined } | undefined> {
  if (declared.entries.has(source)) {
    const id = source.startsWith('#') ? undefined : declared.ids.get(source)
    if (id !== undefined) return { file: fileOf(id) }
    const file = await listedFileFrom(resolver, declared, source, importer)
    return file === undefined && source.startsWith('#') ? undefined : { file }
  }
  if (!isNamingListed(source, declared)) return undefined
  const file = await listedFileFrom(resolver, declared, source, importer)
  return file === undefined ? undefined : { file }
}
