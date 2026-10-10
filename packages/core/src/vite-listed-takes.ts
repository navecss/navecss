/**
 * The re-exports of `cx` in packages `keepFor` lists that `keepFor` does not stand in for: those
 * through which a module the consumer can change takes a `cx` export. `keepFor` stands in for the
 * package's own calls, which the consumer cannot make the build read, and never for a route of the
 * consumer's own, so a module that gives `cx` out stays an error exactly while some importer takes
 * one of its `cx` exports by a route the consumer can change, and nothing else does.
 *
 * Two routes, one per remedy. A module with a clearing specifier (every `cx` export is under the
 * name `cx`) is cleared by a `cxModules` entry, so any module outside the package, application or
 * dependency, taking one keeps it. A module without one has no entry that clears it, so only an
 * application module taking one keeps it, with a line that tells that module to import `cx` from
 * Nave instead. A dependency that takes a renamed export is the package's own call, which `keepFor`
 * stands in for.
 */
import type { AstNode } from './vite-ast.ts'
import type { Take, Taken } from './vite-cx-takes.ts'
import type { RenderContext } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { filePathOf } from './vite-css-id.ts'
import { specifiersIn } from './vite-cx-importers.ts'
import { fileOf } from './vite-cx-modules.ts'
import { takesIn } from './vite-cx-takes.ts'
import { importersOf, isResolvingTo, withClearingSpecifiers } from './vite-dependency-reexports.ts'
import { isDependencyId, moduleLabel, packageNameOf } from './vite-module-kind.ts'
import { compareText } from './vite-problems.ts'

/**
 * The specifiers `code` writes that resolve, from the importer `id`, to `file`, and its parse.
 */
async function reachingSpecifiers(
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
 * What the importer `id` takes from the module `file`. An importer whose text cannot be read counts
 * as taking the whole module, since the build cannot tell.
 */
async function takenBy(
  ctx: RenderContext,
  input: { readonly file: string; readonly id: string; readonly names: ReadonlySet<string> },
): Promise<Taken[]> {
  const { file, id, names } = input
  const code = ctx.getModuleInfo?.(id)?.code
  try {
    const read =
      code === null || code === undefined
        ? undefined
        : await reachingSpecifiers(ctx, { code, file, id })
    if (!read) return [{ shape: 'namespace', names: [] }]
    return read.reaches.size === 0 ? [] : takesIn(read.program, { names, reaches: read.reaches })
  } catch {
    return [{ shape: 'namespace', names: [] }]
  }
}

/**
 * The takes of one shape by one taker, each once with the names of all of them in code-unit order.
 */
function merged(takes: readonly Take[]): Take[] {
  const byKey = new Map<string, Take>()
  for (const take of takes) {
    const key = `${take.taker}\0${take.shape}`
    const known = byKey.get(key)
    const names = new Set([...(known?.names ?? []), ...take.names])
    byKey.set(key, { ...take, names: [...names].toSorted(compareText) })
  }
  return byKey.values().toArray()
}

/**
 * The takes of the `cx` exports `names` of the module `id` of `pkg`, by every importer the
 * consumer can change: the application's, and the other dependencies' when `isApplicationOnly`
 * is not set.
 */
async function takesFrom(
  ctx: RenderContext,
  context: UsedContext,
  input: {
    readonly id: string
    readonly isApplicationOnly: boolean
    readonly names: ReadonlySet<string>
    readonly pkg: string
  },
): Promise<Take[]> {
  const found: Take[] = []
  for (const importer of importersOf(ctx, input.id)) {
    if (isDependencyId(importer)) {
      if (input.isApplicationOnly) continue
      const owner = await packageNameOf(filePathOf(importer), context.packageNames)
      if (owner === input.pkg) continue
    }
    const taker = moduleLabel(context.root, importer)
    const taken = await takenBy(ctx, { file: fileOf(input.id), id: importer, names: input.names })
    found.push(...taken.map((take) => ({ ...take, taker })))
  }
  return merged(found)
}

/**
 * The problems of `module`, a module of a listed package, that stay errors: its re-exports with the
 * specifier that clears them when any importer outside the package takes one of its `cx` exports,
 * and, for a module with no such specifier, all of its problems with the application's takes.
 */
async function keptOf(
  ctx: RenderContext,
  context: UsedContext,
  problems: readonly LocatedProblem[],
): Promise<LocatedProblem[]> {
  const first = problems[0]!
  const names = new Set(problems.flatMap((problem) => problem.exportedAs ?? []))
  const clearable = problems.filter((problem) => problem.specifier !== undefined)
  const isApplicationOnly = clearable.length === 0
  const takes = await takesFrom(ctx, context, {
    id: first.moduleId!,
    isApplicationOnly,
    names,
    pkg: first.pkg!,
  })
  if (takes.length === 0) return []
  return isApplicationOnly ? problems.map((problem) => ({ ...problem, takes })) : clearable
}

/**
 * The problems of the listed packages that give `cx` out and that `keepFor` does not clear, given
 * the problems their listing suppressed.
 */
export async function takenReexports(
  ctx: RenderContext,
  context: UsedContext,
  standingIn: readonly LocatedProblem[],
): Promise<LocatedProblem[]> {
  const exporting = standingIn.filter((problem) => problem.exportedAs !== undefined)
  const located = await withClearingSpecifiers(ctx, context, exporting)
  const byModule = new Map<string, LocatedProblem[]>()
  for (const problem of located) {
    if (problem.moduleId === undefined || problem.pkg === undefined) continue
    byModule.set(problem.moduleId, [...(byModule.get(problem.moduleId) ?? []), problem])
  }
  const kept = await Promise.all(
    byModule.values().map((problems) => keptOf(ctx, context, problems)),
  )
  return kept.flat()
}
