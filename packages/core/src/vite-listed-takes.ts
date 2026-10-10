/**
 * The re-exports of `cx` in packages `keepFor` lists that `keepFor` does not stand in for: those
 * through which a module the consumer can change takes a `cx` export. A module's `cx` exports are
 * followed through the package's own re-exports of them, so a module that takes one from another
 * module of the package, one hop away or more, takes it from this one. `keepFor` stands in for the
 * package's own calls, which the consumer cannot make the build read, and never for a route of the
 * consumer's own, so in the module graph the build reads, a module that gives `cx` out stays an
 * error while some module outside the package takes one of its `cx` exports by a route the consumer
 * can change, and `keepFor` clears it otherwise. A server build that leaves the package external
 * holds none of its modules, so a take there is not seen.
 *
 * Two routes, one per remedy. A module with a clearing specifier (a specifier outside the package
 * that resolves to it, an alias or a tsconfig path included, while every `cx` export of the module
 * is under the name `cx`) is cleared by a `cxModules` entry, so any module outside the package,
 * application or dependency, taking one keeps it. A module without one has no entry that clears it,
 * so only an application module taking one keeps it, with a line that tells that module to import
 * `cx` from Nave instead. A dependency that takes a `cx` export of a module without one is counted
 * with the package's own calls, which `keepFor` stands in for.
 */
import type { Take, Taken } from './vite-cx-takes.ts'
import type { RenderContext } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { filePathOf } from './vite-css-id.ts'
import { fileOf } from './vite-cx-modules.ts'
import { takesIn, UNREADABLE } from './vite-cx-takes.ts'
import { importersOf, withClearingSpecifiers } from './vite-dependency-reexports.ts'
import { type Holder, holdersOf, reachingSpecifiers } from './vite-listed-holders.ts'
import { isDependencyId, moduleLabel, packageNameOf } from './vite-module-kind.ts'
import { compareText } from './vite-problems.ts'

/**
 * What the importer `id` takes from the module `file`. An importer the build cannot read counts as
 * taking the whole module, since the build cannot tell: its text is missing or does not parse, or
 * it names the module by no specifier the build resolves to it (a `require()`).
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
    if (!read || read.reaches.size === 0) return [UNREADABLE]
    return takesIn(read.program, { names, reaches: read.reaches })
  } catch {
    return [UNREADABLE]
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
    const isReached = take.isReached || known?.isReached === true
    byKey.set(key, { ...take, isReached, names: [...names].toSorted(compareText) })
  }
  return byKey.values().toArray()
}

interface Routes {
  readonly entry: Take[]
  readonly told: Take[]
}

/**
 * Whether the takes of the importer count: the application's always, and a dependency's when the
 * module is one a `cxModules` entry clears and the dependency is not the package itself.
 */
async function isCounted(
  context: UsedContext,
  input: { readonly importer: string; readonly isEntry: boolean; readonly pkg: string },
): Promise<boolean> {
  const { importer, isEntry, pkg } = input
  if (!isDependencyId(importer)) return true
  if (!isEntry) return false
  return (await packageNameOf(filePathOf(importer), context.packageNames)) !== pkg
}

/**
 * The takes of the `cx` exports of `holder` by one importer, in the two routes (see `takesFrom`).
 */
async function routesOf(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly holder: Holder; readonly importer: string; readonly isEntry: boolean },
): Promise<Routes> {
  const { holder, importer, isEntry } = input
  const isDependency = isDependencyId(importer)
  const taker = moduleLabel(context.root, importer)
  const taken = await takenBy(ctx, { file: fileOf(holder.id), id: importer, names: holder.names })
  const takes = taken.map((take) => ({ ...take, taker, isReached: holder.isReached }))
  const isCleared = (take: Take): boolean =>
    isEntry && (isDependency || take.shape !== 'unreadable')
  return {
    entry: takes.filter((take) => isCleared(take)),
    told: takes.filter((take) => !isCleared(take)),
  }
}

/**
 * The takes of the `cx` exports of `holder` by the importers outside its package, in two routes.
 * `entry` holds those a `cxModules` entry clears: the takes, by the application or by another
 * dependency, of a module that has a clearing specifier and exports Nave's `cx` itself, as
 * `isEntry` says. `told` holds the others, which only an application module can end by importing
 * `cx` from Nave instead, and, for a module that has a clearing specifier, the application's takes
 * the build cannot read, since an entry would not make them readable.
 */
async function takesFrom(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly holder: Holder; readonly isEntry: boolean; readonly pkg: string },
): Promise<Routes> {
  const { holder, isEntry, pkg } = input
  const importers = importersOf(ctx, holder.id)
  const entry: Take[] = []
  const told: Take[] = []
  for (const importer of importers) {
    if (!(await isCounted(context, { importer, isEntry, pkg }))) {
      continue
    }

    const routes = await routesOf(ctx, context, { holder, importer, isEntry })
    entry.push(...routes.entry)
    told.push(...routes.told)
  }
  return { entry: merged(entry), told: merged(told) }
}

/**
 * The problems of `module`, a module of a listed package, that stay errors: its re-exports with the
 * specifier that clears them when a module outside the package takes one of its `cx` exports, or
 * one the package's other modules re-export from it, and, for the takes only an application module
 * can end, all of its problems with those takes.
 */
async function keptOf(
  ctx: RenderContext,
  context: UsedContext,
  problems: readonly LocatedProblem[],
): Promise<LocatedProblem[]> {
  const first = problems[0]!
  const { pkg } = first
  const names = new Set(problems.flatMap((problem) => problem.exportedAs ?? []))
  const clearable = problems.filter((problem) => problem.specifier !== undefined)
  const holders = await holdersOf(ctx, context, { id: first.moduleId!, names, pkg: pkg! })
  const routed = await Promise.all(
    holders.map((holder) =>
      takesFrom(ctx, context, {
        holder,
        isEntry: clearable.length > 0 && !holder.isReached,
        pkg: pkg!,
      }),
    ),
  )
  if (routed.some(({ entry }) => entry.length > 0)) return clearable
  const told = merged(routed.flatMap((route) => route.told))
  return told.length === 0 ? [] : problems.map((problem) => ({ ...problem, takes: told }))
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
