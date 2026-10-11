/**
 * The re-exports of `cx` in packages `keepFor` lists that `keepFor` does not stand in for: those
 * through which a module the consumer can change takes a `cx` export. A module that gives Nave's
 * `cx` out has its `cx` exports followed through every forward of them: a module, of the package or
 * of another dependency, that only re-exports one (under any name, by `export *` when it is not the
 * default, by `export * as`, or by importing it and exporting it unchanged), through any number of
 * hops, so a module that takes one from a forward takes it from this one. `keepFor` stands in for
 * the package's own calls, which the consumer cannot make the build read, and never for a route of
 * the consumer's own, so in the module graph the build reads, a module that gives `cx` out stays an
 * error while some module outside the package takes one of its `cx` exports by a route the consumer
 * can change, and `keepFor` clears it otherwise. A server build that leaves the package external
 * holds none of its modules, so a take there is not seen.
 *
 * Two routes, one per remedy, decided take by take. A take is on the `cxModules` route when it is
 * made straight of the module, not of a forward, the module has a clearing specifier (a specifier
 * outside the package that resolves to it from Vite's root, an alias or a tsconfig path included,
 * while every `cx` export of the module is under the name `cx`), and, for an application module,
 * the build can read the take: the problem keeps its `cxModules` line, whether an application or a
 * dependency takes it. Every other take an application module makes is on the other route, and
 * keeps a line that tells that module to import `cx` from Nave instead and says why no `cxModules`
 * entry is printed. A dependency's take off the `cxModules` route that is not a forward (a call, an
 * assignment, a wrapper, or a take the build cannot read) ends the walk and is the package's own
 * call, which `keepFor` stands in for; a module that both calls and forwards counts on both sides,
 * and listing a package that only forwards in `keepFor` changes nothing, since a forward is not a
 * call. A module with takes on both routes prints only its `cxModules` line, and the other line not
 * until a later build, after that one is followed; a further line may come first, such as the one a
 * dependency that re-exports from the module gets once the module is listed.
 */
import type { CxExports, Resolutions } from './vite-cx-star-exports.ts'
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
  input: {
    readonly file: string
    readonly id: string
    readonly names: ReadonlySet<string>
    readonly resolutions: Resolutions
  },
): Promise<Taken[]> {
  const { file, id, names, resolutions } = input
  const code = ctx.getModuleInfo?.(id)?.code
  try {
    const read =
      code === null || code === undefined
        ? undefined
        : await reachingSpecifiers(ctx, { code, file, id, resolutions })
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
    const isPassedOn = take.isPassedOn === true || known?.isPassedOn === true
    byKey.set(key, { ...take, isPassedOn, isReached, names: [...names].toSorted(compareText) })
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
  input: {
    readonly holder: Holder
    readonly importer: string
    readonly isEntry: boolean
    readonly resolutions: Resolutions
  },
): Promise<Routes> {
  const { holder, importer, isEntry, resolutions } = input
  const isDependency = isDependencyId(importer)
  const taker = moduleLabel(context.root, importer)
  const taken = await takenBy(ctx, {
    file: fileOf(holder.id),
    id: importer,
    names: holder.names,
    resolutions,
  })
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
  input: {
    readonly holder: Holder
    readonly isEntry: boolean
    readonly pkg: string
    readonly resolutions: Resolutions
  },
): Promise<Routes> {
  const { holder, isEntry, pkg, resolutions } = input
  const importers = importersOf(ctx, holder.id)
  const entry: Take[] = []
  const told: Take[] = []
  for (const importer of importers) {
    if (!(await isCounted(context, { importer, isEntry, pkg }))) {
      continue
    }

    const routes = await routesOf(ctx, context, { holder, importer, isEntry, resolutions })
    entry.push(...routes.entry)
    told.push(...routes.told)
  }
  return { entry: merged(entry), told: merged(told) }
}

/**
 * The problems of one module of a listed package that stay errors: its re-exports with the
 * specifier that clears them when a module outside the package takes one of its `cx` exports, and,
 * for the takes only an application module can end (of the module, or of a forward of it), all of
 * its problems with those takes.
 */
async function keptOf(
  ctx: RenderContext,
  context: UsedContext,
  input: {
    readonly cxExports: CxExports
    readonly problems: readonly LocatedProblem[]
    readonly resolutions: Resolutions
  },
): Promise<LocatedProblem[]> {
  const { cxExports, problems, resolutions } = input
  const first = problems[0]!
  const pkg = first.pkg!
  const names = new Set(problems.flatMap((problem) => problem.exportedAs ?? []))
  const clearable = problems.filter((problem) => problem.specifier !== undefined)
  const holders = await holdersOf(ctx, { cxExports, id: first.moduleId!, names, resolutions })
  const routed = await Promise.all(
    holders.map((holder) =>
      takesFrom(ctx, context, {
        holder,
        isEntry: clearable.length > 0 && !holder.isReached,
        pkg,
        resolutions,
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
  const resolutions: Resolutions = new Map()
  const cxExports: CxExports = new Map(
    byModule
      .values()
      .map((problems) => [
        fileOf(problems[0]!.moduleId!),
        new Set(problems.flatMap((problem) => problem.exportedAs ?? [])),
      ]),
  )
  const kept = await Promise.all(
    byModule.values().map((problems) => keptOf(ctx, context, { cxExports, problems, resolutions })),
  )
  return kept.flat()
}
