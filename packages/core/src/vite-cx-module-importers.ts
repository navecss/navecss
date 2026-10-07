/**
 * The build-end check of the importers of the modules `cxModules` lists: the importers the module
 * graph holds that the post-order half did not recognise reached a listed module through a
 * specifier outside its text test, so every call they make would ship with no rule. The module
 * graph carries no source map at build end, so the error names each importer and the specifier,
 * never a position.
 */
import type { DeclaredModules } from './vite-cx-modules.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { candidateOf, importerIdsOf, isResolvingToCx, specifiersOf } from './vite-cx-importers.ts'
import { declaredModulesFor, fileOf, recognisedKey } from './vite-cx-modules.ts'
import { moduleLabel } from './vite-module-kind.ts'
import { compareText } from './vite-problems.ts'

/**
 * The entry as written that names the listed module `id`.
 */
function entryOf(declared: DeclaredModules, id: string): string {
  for (const [entry, resolved] of declared.ids) if (resolved === id) return entry
  return id
}

interface Unrecognised {
  readonly line: string
  readonly specifiers: readonly string[]
}

/**
 * The line for an importer of a listed module that the post-order half did not recognise, with
 * the specifiers it reaches the module through.
 */
async function unrecognisedLine(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly declared: DeclaredModules; readonly id: string; readonly importer: string },
): Promise<Unrecognised | undefined> {
  const { declared, id } = input
  const importer = await candidateOf(ctx, context, input.importer)
  if (!importer) return undefined
  const known = { cxId: id, answers: new Map<string, boolean>() }
  const specifiers = specifiersOf(ctx, importer) ?? []
  const reaching: string[] = []
  for (const specifier of specifiers) {
    if (await isResolvingToCx(ctx, specifier, importer, known)) reaching.push(specifier)
  }
  const label = moduleLabel(context.root, importer.id)
  const entry = `'${entryOf(declared, id)}'`
  const as = reaching.map((specifier) => `'${specifier}'`).join(', ')
  return {
    specifiers: reaching,
    line:
      reaching.length > 0
        ? `${label}: imports ${entry} as ${as}.`
        : `${label}: imports ${entry} through a specifier the build could not read.`,
  }
}

/**
 * The array the remedy prints: the entries as written, then each specifier to add, once.
 */
function remedyList(entries: readonly string[], added: ReadonlySet<string>): string {
  const extra = [...added].filter((specifier) => !entries.includes(specifier)).toSorted(compareText)
  return `[${[...entries, ...extra].map((entry) => `'${entry}'`).join(', ')}]`
}

/**
 * The importers of the listed module `id` that were not recognised, with the specifiers each
 * reaches it through.
 */
async function unrecognisedImporters(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly declared: DeclaredModules; readonly id: string },
): Promise<Unrecognised[]> {
  const found: Unrecognised[] = []
  for (const importer of importerIdsOf(ctx, input.id)) {
    const key = recognisedKey(ctx.environment.name, fileOf(input.id), importer)
    if (context.state.recognised.has(key)) continue
    const line = await unrecognisedLine(ctx, context, { ...input, importer })
    if (line) found.push(line)
  }
  return found
}

/**
 * The first line and the remedy's opening, which agree with the number of importers.
 */
function wording(count: number): { first: string; remedy: string; who: string } {
  return count === 1
    ? {
        first: '1 file imports a module',
        remedy: 'Add the specifier, as written, to cxModules in navePlugin(): ',
        who: 'its',
      }
    : {
        first: `${count} files import a module`,
        remedy: 'Add each specifier, as written, to cxModules in navePlugin(): ',
        who: 'their',
      }
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
  const found: Unrecognised[] = []
  const ids = new Set(declared.ids.values())
  for (const id of ids) {
    found.push(...(await unrecognisedImporters(ctx, context, { declared, id })))
  }
  if (found.length === 0) return undefined
  const added = new Set(found.flatMap((item) => item.specifiers))
  const { first, remedy, who } = wording(found.length)
  return [
    `${first} listed in cxModules through a specifier the build does not recognise, so the build did not read ${who} cx() calls.`,
    ...found.map((item) => item.line).toSorted(compareText),
    `${remedy}cxModules: ${remedyList(context.options.cxModules, added)}.`,
  ].join('\n')
}
