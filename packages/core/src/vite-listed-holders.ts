/**
 * The modules of a package that give out `cx` through one of its `cx` exports: the module that
 * exports Nave's `cx`, and every module of the same package that re-exports one of those exports,
 * however many modules away. A module that takes `cx` from any of them takes it from the first.
 */
import type { AstNode } from './vite-ast.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { filePathOf } from './vite-css-id.ts'
import { specifiersIn } from './vite-cx-importers.ts'
import { fileOf } from './vite-cx-modules.ts'
import { reexportedNames } from './vite-cx-reexported.ts'
import { importersOf, isResolvingTo } from './vite-dependency-reexports.ts'
import { isDependencyId, packageNameOf } from './vite-module-kind.ts'

/**
 * A module of a package that gives out `cx`: the `cx` exports it holds, and whether it holds them
 * by re-exporting another module's of the same package rather than by exporting Nave's itself.
 */
export interface Holder {
  readonly id: string
  readonly names: ReadonlySet<string>
  readonly isReached: boolean
}

/**
 * The specifiers `code` writes that resolve, from the importer `id`, to `file`, and its parse.
 */
export async function reachingSpecifiers(
  ctx: RenderContext,
  input: { readonly code: string; readonly file: string; readonly id: string },
): Promise<{ program: AstNode; reaches: Set<string> } | undefined> {
  const { code, file, id } = input
  const program = ctx.parse?.(code) as AstNode | undefined
  if (!program) return undefined
  const reaches = new Set<string>()
  for (const specifier of specifiersIn(program)) {
    if (await isResolvingTo(ctx, { file, from: id, specifier })) reaches.add(specifier)
  }
  return { program, reaches }
}

/**
 * The modules of `pkg` that import the module `id`.
 */
async function importersInside(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly id: string; readonly pkg: string },
): Promise<string[]> {
  const found: string[] = []
  for (const importer of importersOf(ctx, input.id)) {
    if (!isDependencyId(importer)) continue
    const owner = await packageNameOf(filePathOf(importer), context.packageNames)
    if (owner === input.pkg) found.push(importer)
  }
  return found
}

/**
 * The names under which the module `id` gives out the `cx` exports `names` of the module `file`.
 */
async function reexportedBy(
  ctx: RenderContext,
  input: { readonly file: string; readonly id: string; readonly names: ReadonlySet<string> },
): Promise<string[]> {
  const code = ctx.getModuleInfo?.(input.id)?.code
  if (code === null || code === undefined) return []
  try {
    const read = await reachingSpecifiers(ctx, { ...input, code })
    return read && read.reaches.size > 0
      ? reexportedNames(read.program, { names: input.names, reaches: read.reaches })
      : []
  } catch {
    return []
  }
}

/**
 * The names the modules of `pkg` that import the module `id` give out the `cx` exports `names` of
 * it under, by module.
 */
async function reexportsOf(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly id: string; readonly names: ReadonlySet<string>; readonly pkg: string },
): Promise<Map<string, string[]>> {
  const importers = await importersInside(ctx, context, input)
  const found = new Map<string, string[]>()
  for (const importer of importers) {
    const added = await reexportedBy(ctx, {
      file: fileOf(input.id),
      id: importer,
      names: input.names,
    })
    if (added.length > 0) found.set(importer, added)
  }
  return found
}

/**
 * The module `origin`, which gives out the `cx` exports `names`, and every module of its package
 * that re-exports them, however many modules away, each with the names it gives them out under.
 */
export async function holdersOf(
  ctx: RenderContext,
  context: UsedContext,
  origin: { readonly id: string; readonly names: ReadonlySet<string>; readonly pkg: string },
): Promise<Holder[]> {
  const held = new Map<string, ReadonlySet<string>>([[origin.id, origin.names]])
  const queue = [origin.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    const reexports = await reexportsOf(ctx, context, {
      id,
      names: held.get(id)!,
      pkg: origin.pkg,
    })
    for (const [importer, added] of reexports) {
      const known = held.get(importer) ?? new Set<string>()
      const isNew = importer !== origin.id && added.some((name) => !known.has(name))
      if (isNew) {
        held.set(importer, new Set([...known, ...added]))
        queue.push(importer)
      }
    }
  }
  return held
    .entries()
    .map(([id, names]) => ({ id, names, isReached: id !== origin.id }))
    .toArray()
}
