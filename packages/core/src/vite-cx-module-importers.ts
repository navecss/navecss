/**
 * The build-end check of the importers of the modules `cxModules` lists. It compares each
 * specifier through which a module of the graph imports a listed module with the specifiers the
 * post-order half recognised in that module: a specifier it did not recognise reached a listed
 * module outside its text test, so every call made through it would ship with no rule, whatever
 * else the importer imports. A listed module is every module id whose file, query removed, is a
 * listed file, so the importers of `./ui?v=1` are checked like those of `./ui`. The module graph
 * carries no source map at build end, so the error names each importer and the specifier, never a
 * position.
 */
import path from 'node:path'

import type { DeclaredModules } from './vite-cx-modules.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { filePathOf } from './vite-css-id.ts'
import {
  candidateOf,
  type Importer,
  importerIdsOf,
  isResolvingToCx,
  specifiersOf,
} from './vite-cx-importers.ts'
import { importerErrorOf } from './vite-cx-module-lines.ts'
import { declaredModulesFor, fileOf, recognisedKey } from './vite-cx-modules.ts'
import { isResolvingTo } from './vite-dependency-reexports.ts'
import { isDependencyId, moduleLabel, packageNameOf } from './vite-module-kind.ts'

/**
 * The extensions Vite's resolver tries when a specifier writes none.
 */
const RESOLVED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])

/**
 * One importer of a listed module with a specifier the post-order half did not recognise: where it
 * is, the entry that names the module, and the specifiers it reaches the module through.
 */
export interface ListedImporter {
  readonly importer: string
  readonly label: string
  readonly entry: string
  /**
   * The specifiers the importer wrote that reach the module and were not recognised, in the order
   * written; none when no specifier could be found in the file.
   */
  readonly specifiers: readonly string[]
  /**
   * The relative specifier the importer could write for the listed module, ending in its name;
   * empty for a file in a dependency, which has none to write.
   */
  readonly replacement: string
  /**
   * The package the importer belongs to when it lies in a dependency.
   */
  readonly pkg: string | undefined
}

/**
 * The entry as written that names the listed file of `id`.
 */
function entryOf(declared: DeclaredModules, id: string): string {
  const file = fileOf(id)
  for (const [entry, resolved] of declared.ids) if (fileOf(resolved) === file) return entry
  return id
}

/**
 * The relative specifier from `importer` to the listed file of `id`, in the spelling its own name
 * ends in. Written without an extension Vite resolves when that resolves, from the importer, to the
 * listed file itself: another file of the same stem (`index.js` beside `index.ts`) is tried first
 * by Vite, so the plain spelling would rebind the import to it. Otherwise the file's own name.
 */
async function replacementFor(
  ctx: RenderContext,
  input: { readonly id: string; readonly importer: string },
): Promise<string> {
  const file = fileOf(input.id)
  const extension = path.posix.extname(file)
  const relativeTo = (target: string): string => {
    const relative = path.posix.relative(path.posix.dirname(fileOf(input.importer)), target)
    return relative.startsWith('../') ? relative : `./${relative}`
  }
  if (!RESOLVED_EXTENSIONS.has(extension)) return relativeTo(file)
  const short = relativeTo(file.slice(0, -extension.length))
  const isLanding = await isResolvingTo(ctx, { file, from: input.importer, specifier: short })
  return isLanding ? short : relativeTo(file)
}

/**
 * The specifiers `importer` writes that reach the listed module `id` and were not recognised.
 * An importer recognised through some specifier is asked of its other specifiers only; one that
 * was not recognised at all is asked of every specifier, so the error can name the one it reached
 * the module through.
 */
async function unrecognisedSpecifiers(
  ctx: RenderContext,
  input: {
    readonly answers: Map<string, boolean>
    readonly id: string
    readonly importer: Importer
    readonly recognised: ReadonlySet<string> | undefined
  },
): Promise<string[]> {
  const { answers, id, importer, recognised } = input
  const known = { cxId: id, answers }
  const found: string[] = []
  const unread = (specifiersOf(ctx, importer) ?? []).filter((text) => !recognised?.has(text))
  for (const specifier of unread) {
    if (await isResolvingToCx(ctx, specifier, importer, known)) found.push(specifier)
  }
  return found
}

/**
 * The importer of the listed module `id`, with the specifiers it reaches it through that were not
 * recognised, or `undefined` when every one was.
 */
async function unrecognisedOf(
  ctx: RenderContext,
  context: UsedContext,
  input: {
    readonly answers: Map<string, boolean>
    readonly declared: DeclaredModules
    readonly id: string
    readonly importer: string
  },
): Promise<ListedImporter | undefined> {
  const { answers, declared, id } = input
  const importer = await candidateOf(ctx, context, input.importer)
  if (!importer) return undefined
  const recognised = context.state.recognised.get(
    recognisedKey(ctx.environment.name, fileOf(id), importer.id),
  )
  const specifiers = await unrecognisedSpecifiers(ctx, { answers, id, importer, recognised })
  if (recognised !== undefined && specifiers.length === 0) return undefined
  const pkg = isDependencyId(importer.id)
    ? await packageNameOf(filePathOf(importer.id), context.packageNames)
    : undefined
  return {
    importer: importer.id,
    label: moduleLabel(context.root, importer.id),
    entry: entryOf(declared, id),
    specifiers,
    replacement: pkg === undefined ? await replacementFor(ctx, { id, importer: importer.id }) : '',
    pkg,
  }
}

/**
 * The ids of the modules whose file is a listed file: the ones the entries resolved to, and any
 * other id of the graph that names one of those files, as `./ui?v=1` does.
 */
function listedIdsIn(ctx: RenderContext, declared: DeclaredModules): Set<string> {
  const ids = new Set(declared.ids.values())
  const graph = ctx.getModuleIds?.() ?? []
  for (const id of graph) {
    if (declared.files.has(fileOf(id))) ids.add(id)
  }
  return ids
}

/**
 * The map entry for `item`, an importer of the file of `id`: keyed by importer and file, so an
 * importer of one file through two ids is one importer, with the specifiers of both.
 */
function merged(
  found: ReadonlyMap<string, ListedImporter>,
  item: ListedImporter,
  id: string,
): [string, ListedImporter] {
  const key = `${item.importer}\0${fileOf(id)}`
  const specifiers = new Set([...(found.get(key)?.specifiers ?? []), ...item.specifiers])
  return [key, { ...item, specifiers: [...specifiers] }]
}

/**
 * The importers of the listed modules whose imports the post-order half did not all recognise,
 * with the specifiers each reaches its module through. An importer of one file through two ids is
 * one importer.
 */
async function unrecognisedImporters(
  ctx: RenderContext,
  context: UsedContext,
  declared: DeclaredModules,
): Promise<ListedImporter[]> {
  const found = new Map<string, ListedImporter>()
  for (const id of listedIdsIn(ctx, declared)) {
    const answers = new Map<string, boolean>()
    for (const importer of importerIdsOf(ctx, id)) {
      const item = await unrecognisedOf(ctx, context, { answers, declared, id, importer })
      if (item) found.set(...merged(found, item, id))
    }
  }
  return found.values().toArray()
}

/**
 * The build-end error for modules that import a listed module through a specifier the post-order
 * half did not recognise, or `undefined` when there are none. `configured` is the `cxModules` list
 * the array it prints extends, and `report` the text of the report printed before it in the same
 * failure.
 */
export async function declaredImporterError(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly configured: readonly string[]; readonly report: string | undefined },
): Promise<string | undefined> {
  const declared = await declaredModulesFor(context, ctx, ctx.environment.name)
  if (!declared) return undefined
  const found = await unrecognisedImporters(ctx, context, declared)
  return found.length === 0 ? undefined : importerErrorOf(found, input)
}
