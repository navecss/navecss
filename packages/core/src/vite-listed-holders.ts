/**
 * The modules that give out `cx` through one of its `cx` exports: the module that exports Nave's
 * `cx`, and every module of a dependency, of the same package or of another, that only re-exports
 * one of those exports (a forward), however many modules away. A module that takes `cx` from any of
 * them takes it from the first. A dependency's other takes (a call, an assignment, a wrapper, a
 * take the build cannot read) end the walk: they are the package's own calls.
 */
import type { AstNode } from './vite-ast.ts'
import type { RenderContext } from './vite-types.ts'

import { specifiersIn } from './vite-cx-importers.ts'
import { fileOf } from './vite-cx-modules.ts'
import { reexportedNames } from './vite-cx-reexported.ts'
import { importersOf } from './vite-dependency-reexports.ts'
import { isDependencyId } from './vite-module-kind.ts'

/**
 * A module that gives out `cx`: the `cx` exports it holds, and whether it holds them by forwarding
 * another module's rather than by exporting Nave's itself.
 */
export interface Holder {
  readonly id: string
  readonly names: ReadonlySet<string>
  readonly isReached: boolean
}

/**
 * The file each specifier resolves to from each importer, asked once: a barrel's specifiers are
 * resolved once however many modules of it give `cx` out.
 */
export type Resolutions = Map<string, Promise<string | undefined>>

/**
 * The file `specifier` resolves to from the importer `id`.
 */
function resolvedFile(
  ctx: RenderContext,
  resolutions: Resolutions,
  input: { readonly id: string; readonly specifier: string },
): Promise<string | undefined> {
  const key = `${input.id}\0${input.specifier}`
  const known = resolutions.get(key)
  if (known) return known
  const asked = (async (): Promise<string | undefined> => {
    try {
      const resolved = await ctx.resolve?.(input.specifier, input.id)
      return resolved ? fileOf(resolved.id) : undefined
    } catch {
      return undefined
    }
  })()
  resolutions.set(key, asked)
  return asked
}

/**
 * The specifiers `code` writes that resolve, from the importer `id`, to `file`, and its parse.
 */
export async function reachingSpecifiers(
  ctx: RenderContext,
  input: {
    readonly code: string
    readonly file: string
    readonly id: string
    readonly resolutions: Resolutions
  },
): Promise<{ program: AstNode; reaches: Set<string> } | undefined> {
  const { code, file, id, resolutions } = input
  const program = ctx.parse?.(code) as AstNode | undefined
  if (!program) return undefined
  const reaches = new Set<string>()
  for (const specifier of specifiersIn(program)) {
    if ((await resolvedFile(ctx, resolutions, { id, specifier })) === file) reaches.add(specifier)
  }
  return { program, reaches }
}

/**
 * The names under which the module `id` gives out the `cx` exports `names` of the module `file`.
 */
async function reexportedBy(
  ctx: RenderContext,
  input: {
    readonly file: string
    readonly id: string
    readonly names: ReadonlySet<string>
    readonly resolutions: Resolutions
  },
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
 * The names the dependencies that import the module `id` give out the `cx` exports `names` of it
 * under, by module.
 */
async function reexportsOf(
  ctx: RenderContext,
  input: {
    readonly id: string
    readonly names: ReadonlySet<string>
    readonly resolutions: Resolutions
  },
): Promise<Map<string, string[]>> {
  const importers = importersOf(ctx, input.id).filter((importer) => isDependencyId(importer))
  const found = new Map<string, string[]>()
  for (const importer of importers) {
    const added = await reexportedBy(ctx, { ...input, file: fileOf(input.id), id: importer })
    if (added.length > 0) found.set(importer, added)
  }
  return found
}

/**
 * The module `origin`, which gives out the `cx` exports `names`, and every dependency module that
 * forwards them, however many modules and packages away, each with the names it gives them out
 * under.
 */
export async function holdersOf(
  ctx: RenderContext,
  origin: {
    readonly id: string
    readonly names: ReadonlySet<string>
    readonly resolutions: Resolutions
  },
): Promise<Holder[]> {
  const held = new Map<string, ReadonlySet<string>>([[origin.id, origin.names]])
  const queue = [origin.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    const reexports = await reexportsOf(ctx, {
      id,
      names: held.get(id)!,
      resolutions: origin.resolutions,
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
