/**
 * The build-end check of the importers of the modules `cxModules` lists: the importers the module
 * graph holds that the post-order half did not recognise reached a listed module through a
 * specifier outside its text test, so every call they make would ship with no rule. A listed
 * module is every module id whose file, query removed, is a listed file, so the importers of
 * `./ui?v=1` are checked like those of `./ui`. The module graph carries no source map at build
 * end, so the error names each importer and the specifier, never a position.
 */
import path from 'node:path'

import type { DeclaredModules } from './vite-cx-modules.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { candidateOf, importerIdsOf, isResolvingToCx, specifiersOf } from './vite-cx-importers.ts'
import { declaredModulesFor, fileOf, isRelative, recognisedKey } from './vite-cx-modules.ts'
import { moduleLabel } from './vite-module-kind.ts'
import { compareText, cxModulesArray } from './vite-problems.ts'

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
 * One importer of a listed module that the post-order half did not recognise: where it is, the
 * entry that names the module, and the specifiers it reaches the module through.
 */
interface Unrecognised {
  readonly importer: string
  readonly label: string
  readonly entry: string
  readonly specifiers: readonly string[]
  /**
   * The relative specifier the importer could write for the listed module, ending in its name.
   */
  readonly replacement: string
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
 * The relative specifier that names the listed module `id` from `importer`: its path from the
 * importer's directory, in the spelling its own name ends in, without an extension Vite
 * resolves.
 */
function replacementFor(importer: string, id: string): string {
  const file = fileOf(id)
  const extension = path.posix.extname(file)
  const target = RESOLVED_EXTENSIONS.has(extension) ? file.slice(0, -extension.length) : file
  const relative = path.posix.relative(path.posix.dirname(fileOf(importer)), target)
  return relative.startsWith('../') ? relative : `./${relative}`
}

/**
 * The importer of the listed module `id`, with the specifiers it reaches it through.
 */
async function unrecognisedOf(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly declared: DeclaredModules; readonly id: string; readonly importer: string },
): Promise<Unrecognised | undefined> {
  const { declared, id } = input
  const importer = await candidateOf(ctx, context, input.importer)
  if (!importer) return undefined
  const known = { cxId: id, answers: new Map<string, boolean>() }
  const written = specifiersOf(ctx, importer) ?? []
  const specifiers: string[] = []
  for (const specifier of written) {
    if (await isResolvingToCx(ctx, specifier, importer, known)) specifiers.push(specifier)
  }
  return {
    importer: importer.id,
    label: moduleLabel(context.root, importer.id),
    entry: entryOf(declared, id),
    specifiers,
    replacement: replacementFor(importer.id, id),
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
 * The importers of the listed modules that no recognised import accounts for, each with the id of
 * the listed module it imports.
 */
function unrecognisedPairs(
  ctx: RenderContext,
  context: UsedContext,
  declared: DeclaredModules,
): { id: string; importer: string }[] {
  const isRecognised = (id: string, importer: string): boolean =>
    context.state.recognised.has(recognisedKey(ctx.environment.name, fileOf(id), importer))
  return listedIdsIn(ctx, declared)
    .values()
    .flatMap((id) =>
      importerIdsOf(ctx, id)
        .filter((importer) => !isRecognised(id, importer))
        .map((importer) => ({ id, importer })),
    )
    .toArray()
}

/**
 * The importers of the listed modules that were not recognised, with the specifiers each reaches
 * its module through. An importer of one file through two ids is one importer.
 */
async function unrecognisedImporters(
  ctx: RenderContext,
  context: UsedContext,
  declared: DeclaredModules,
): Promise<Unrecognised[]> {
  const found = new Map<string, Unrecognised>()
  for (const pair of unrecognisedPairs(ctx, context, declared)) {
    const item = await unrecognisedOf(ctx, context, { declared, ...pair })
    if (!item) continue
    const key = `${item.importer}\0${fileOf(pair.id)}`
    const kept = found.get(key)
    const specifiers = new Set([...(kept?.specifiers ?? []), ...item.specifiers])
    found.set(key, { ...item, specifiers: [...specifiers] })
  }
  return found.values().toArray()
}

/**
 * `'a', 'b'`: the specifiers as the error quotes them.
 */
function quoted(specifiers: readonly string[]): string {
  return specifiers.map((specifier) => `'${specifier}'`).join(', ')
}

/**
 * The lines for one importer: one for the relative specifiers it writes, which say what to write
 * in their place, one for the others, or one saying no specifier could be found.
 */
function linesOf(item: Unrecognised): { none: string[]; other: string[]; relative: string[] } {
  const entry = `'${item.entry}'`
  const relative = item.specifiers.filter((specifier) => isRelative(specifier))
  const other = item.specifiers.filter((specifier) => !isRelative(specifier))
  const place = relative.length === 1 ? 'its' : 'their'
  return {
    relative:
      relative.length === 0
        ? []
        : [
            `${item.label}: imports ${entry} as ${quoted(relative)}. Write '${item.replacement}' in ${place} place.`,
          ],
    other: other.length === 0 ? [] : [`${item.label}: imports ${entry} as ${quoted(other)}.`],
    none:
      item.specifiers.length > 0
        ? []
        : [
            `${item.label}: imports ${entry} through a specifier the build could not find in the file.`,
          ],
  }
}

const RELATIVE_REMEDY =
  'Adding a relative specifier to cxModules would not clear this: a relative entry is read from the project root. Instead of the rewrite'
const NO_SPECIFIER_REMEDY =
  "Where the build could not find the specifier, import the module there by a specifier ending in the listed file's name, or by an alias or package name added to cxModules."

/**
 * The remedy lines, in the order they are read: what a relative specifier cannot do, what to do
 * when no specifier was found, and last the array to paste.
 */
function remedyOf(
  found: readonly Unrecognised[],
  lines: readonly ReturnType<typeof linesOf>[],
  configured: readonly string[],
): string[] {
  const remedy: string[] = []
  const relativeCount = lines.reduce((count, line) => count + line.relative.length, 0)
  if (relativeCount === 1) {
    remedy.push(
      `${RELATIVE_REMEDY} its line gives, the file can import the module through an alias for it, added to cxModules.`,
    )
  } else if (relativeCount > 1) {
    remedy.push(
      `${RELATIVE_REMEDY} each line gives, a file can import the module through an alias for it, added to cxModules.`,
    )
  }
  if (lines.some((line) => line.none.length > 0)) remedy.push(NO_SPECIFIER_REMEDY)
  const added = [
    ...new Set(
      found.flatMap((item) => item.specifiers.filter((specifier) => !isRelative(specifier))),
    ),
  ]
  const array = cxModulesArray(configured, added)
  if (array !== undefined) {
    const each = added.length === 1 ? 'the specifier' : 'each specifier'
    remedy.push(`Add ${each}, as written, to cxModules in navePlugin(): cxModules: ${array}.`)
  }
  return remedy
}

/**
 * The build-end error for modules that import a listed module through a specifier the post-order
 * half did not recognise, or `undefined` when there are none.
 */
export async function declaredImporterError(
  ctx: RenderContext,
  context: UsedContext,
): Promise<string | undefined> {
  const declared = await declaredModulesFor(context, ctx, ctx.environment.name)
  if (!declared) return undefined
  const found = await unrecognisedImporters(ctx, context, declared)
  if (found.length === 0) return undefined
  const lines = found.map((item) => linesOf(item))
  const count = new Set(found.map((item) => item.importer)).size
  const first =
    count === 1
      ? '1 file imports a module listed in cxModules through a specifier the build does not recognise, so the build did not read that file for cx() calls.'
      : `${count} files import a module listed in cxModules through a specifier the build does not recognise, so the build did not read those files for cx() calls.`
  return [
    first,
    ...lines
      .flatMap((line) => [...line.relative, ...line.other, ...line.none])
      .toSorted(compareText),
    ...remedyOf(found, lines, context.options.cxModules),
  ].join('\n')
}
