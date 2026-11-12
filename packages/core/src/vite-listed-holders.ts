/**
 * The modules that give out `cx` through one of its `cx` exports: the module that exports Nave's
 * `cx`, and every module of a dependency, of the same package or of another, that only re-exports
 * one of those exports (a forward, by `export ... from` or by one of the CommonJS forms
 * `vite-require-takes.ts` reads), however many modules away. A module that takes `cx` from any of
 * them takes it from the first. A dependency's other takes (a call, an assignment, a wrapper, a
 * take the build cannot read) end the walk: they are the package's own calls.
 */
import type { AstNode } from './vite-ast.ts'
import type { ModuleHost } from './vite-takes-host.ts'

import { fileOf } from './vite-cx-modules.ts'
import { reexportedNames } from './vite-cx-reexported.ts'
import {
  type CxExports,
  type Resolutions,
  resolvedFiles,
  rivalsOf,
} from './vite-cx-star-exports.ts'
import { importersOf } from './vite-dependency-reexports.ts'
import { isDependencyId } from './vite-module-id.ts'
import { requireSpecifiersIn, requireTakesIn } from './vite-require-takes.ts'
import { specifiersIn } from './vite-specifiers.ts'
import { parseOf } from './vite-takes-host.ts'

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
 * The specifiers `code` writes that resolve, from the importer `id`, to `file`, and its parse:
 * those it imports or re-exports from, and those it requires by CommonJS.
 */
export async function reachingSpecifiers(
  ctx: ModuleHost,
  input: {
    readonly code: string
    readonly file: string
    readonly id: string
    readonly resolutions: Resolutions
  },
): Promise<{ program: AstNode; reaches: Set<string>; requires: Set<string> } | undefined> {
  const { code, file, id, resolutions } = input
  const program = parseOf(ctx, code, id) as AstNode | undefined
  if (!program) return undefined
  const reachingOf = async (specifiers: readonly string[]): Promise<Set<string>> => {
    const reaching = new Set<string>()
    for (const specifier of specifiers) {
      const files = await resolvedFiles(ctx, resolutions, { id, specifier })
      if (files.includes(file)) reaching.add(specifier)
    }
    return reaching
  }
  const reaches = await reachingOf(specifiersIn(program))
  const requires = await reachingOf(requireSpecifiersIn(program))
  return { program, reaches, requires }
}

/**
 * The names under which the module `id` gives out the `cx` exports `names` of the module `file`.
 */
async function reexportedBy(
  ctx: ModuleHost,
  input: {
    readonly cxExports: CxExports
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
    if (!read) return []
    const { program, reaches, requires } = read
    const forwarded =
      requires.size === 0
        ? []
        : requireTakesIn(program, { names: input.names, reaches: requires, readsForwards: true })
            .given
    if (reaches.size === 0) return forwarded
    const rivals = await rivalsOf(ctx, { ...input, program, reaches })
    const reexported = reexportedNames(program, { names: input.names, reaches, rivals })
    return [...new Set([...reexported, ...forwarded])]
  } catch {
    return []
  }
}

/**
 * The names the dependencies that import the module `id` give out the `cx` exports `names` of it
 * under, by module.
 */
async function reexportsOf(
  ctx: ModuleHost,
  input: {
    readonly cxExports: CxExports
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
  ctx: ModuleHost,
  origin: {
    readonly cxExports: CxExports
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
      cxExports: origin.cxExports,
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
