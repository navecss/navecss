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
 * holds none of its modules, so each application module of that build that imports one is read with
 * the same take test, against the `cx` exports the client graph knows for it: a take of a known one
 * is kept as on the client, an import of a module that holds none takes nothing, and an import of a
 * module no environment transformed gets the untransformed-dependency warning instead; with
 * separate client and server commands, the server one records its imports and the next client one
 * judges them.
 *
 * Two routes, one per remedy, decided take by take. A take is on the `cxModules` route when it
 * imports the module itself and is not a forward, the module has a clearing specifier (a specifier
 * outside the package that resolves to it from Vite's root, an alias or a tsconfig path included,
 * while every `cx` export of the module is under the name `cx`), and, for an application module,
 * the build can read the take: the problem keeps its `cxModules` line, whether an application
 * module or a dependency that does more than forward it takes it. Every other take an application
 * module makes is on the other route, and keeps a line that tells that module to import `cx` from
 * Nave instead and says why no `cxModules` entry is printed. A dependency's take off the
 * `cxModules` route that is not a forward (a call, an assignment, a wrapper, or a take the build
 * cannot read) ends the walk and is the package's own call, which `keepFor` stands in for; a module
 * that both calls and forwards counts on both sides, and listing a package that only forwards in
 * `keepFor` changes nothing, since a forward is not a call. A module with takes on both routes
 * prints only its `cxModules` line, and the others not until a later build, after that one is
 * followed. Once the module is listed, a forward of it is judged as the forward of a module
 * `cxModules` lists: an application module's take at its end gets the import line, and a
 * dependency's call through it the forwarding package's `keepFor` line unless that package is
 * listed.
 */
import type { CxExports, Resolutions } from './vite-cx-star-exports.ts'
import type { ResolvedServerImport } from './vite-server-takes.ts'
import type { RenderContext } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { fileOf } from './vite-cx-modules.ts'
import { withClearingSpecifiers } from './vite-dependency-reexports.ts'
import { holdersOf } from './vite-listed-holders.ts'
import { merged, takesFrom } from './vite-listed-routes.ts'
import { compareText } from './vite-problems.ts'
import { isSecondHop } from './vite-used-package-lines.ts'

interface Walk {
  readonly cxExports: CxExports
  readonly resolutions: Resolutions
  readonly serverImports: readonly ResolvedServerImport[]
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
  input: { readonly problems: readonly LocatedProblem[]; readonly walk: Walk },
): Promise<LocatedProblem[]> {
  const { problems, walk } = input
  const first = problems[0]!
  const pkg = first.pkg!
  const names = new Set(problems.flatMap((problem) => problem.exportedAs ?? []))
  const clearable = problems.filter((problem) => problem.specifier !== undefined)
  const holders = await holdersOf(ctx, { ...walk, id: first.moduleId!, names })
  const routed = await Promise.all(
    holders.map((holder) =>
      takesFrom(ctx, context, {
        holder,
        isEntry: clearable.length > 0 && !holder.isReached,
        pkg,
        resolutions: walk.resolutions,
        serverImports: walk.serverImports,
        wantCalls: false,
      }),
    ),
  )
  if (routed.some(({ entry }) => entry.length > 0)) return clearable
  const told = merged(routed.flatMap((route) => route.told))
  return told.length === 0 ? [] : problems.map((problem) => ({ ...problem, takes: told }))
}

/**
 * The problems of one dependency module that re-exports the `cx` of a listed module, judged by
 * what takes the re-export: the application modules that do, whatever the package, and the
 * dependencies that call through it, which the package's `keepFor` entry stands in for.
 */
async function keptHop(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly problems: readonly LocatedProblem[]; readonly walk: Walk },
): Promise<LocatedProblem[]> {
  const { problems, walk } = input
  const first = problems[0]!
  const pkg = first.pkg!
  const names = new Set(problems.flatMap((problem) => problem.exportedAs ?? []))
  const holders = await holdersOf(ctx, { ...walk, id: first.moduleId!, names })
  const routed = await Promise.all(
    holders.map((holder) =>
      takesFrom(ctx, context, {
        holder,
        isEntry: false,
        pkg,
        resolutions: walk.resolutions,
        serverImports: walk.serverImports,
        wantCalls: true,
      }),
    ),
  )
  const told = merged(routed.flatMap((route) => route.told))
  const callers = [...new Set(routed.flatMap((route) => route.calls.map((call) => call.taker)))]
  const isListed = Object.hasOwn(context.options.keepFor, pkg)
  return [
    ...(told.length === 0 ? [] : problems.map((problem) => ({ ...problem, takes: told }))),
    ...(isListed || callers.length === 0
      ? []
      : problems.map((problem) => ({ ...problem, callers: callers.toSorted(compareText) }))),
  ]
}

/**
 * The problems of the packages that give `cx` out and that `keepFor` does not clear, given the
 * problems their listing suppressed and the dependency re-exports of a listed module's `cx`, with
 * the imports a server environment makes of a listed package.
 */
export async function takenReexports(
  ctx: RenderContext,
  context: UsedContext,
  input: {
    readonly serverImports?: readonly ResolvedServerImport[]
    readonly standingIn: readonly LocatedProblem[]
  },
): Promise<LocatedProblem[]> {
  const exporting = input.standingIn.filter((problem) => problem.exportedAs !== undefined)
  const located = await withClearingSpecifiers(ctx, context, exporting)
  const byModule = new Map<string, LocatedProblem[]>()
  const hops = new Map<string, LocatedProblem[]>()
  for (const problem of located) {
    if (problem.moduleId === undefined || problem.pkg === undefined) continue
    const group = isSecondHop(problem) ? hops : byModule
    group.set(problem.moduleId, [...(group.get(problem.moduleId) ?? []), problem])
  }
  const cxExports: CxExports = new Map(
    [...byModule.values(), ...hops.values()].map((problems) => [
      fileOf(problems[0]!.moduleId!),
      new Set(problems.flatMap((problem) => problem.exportedAs ?? [])),
    ]),
  )
  const walk: Walk = { cxExports, resolutions: new Map(), serverImports: input.serverImports ?? [] }
  const kept = await Promise.all([
    ...byModule.values().map((problems) => keptOf(ctx, context, { problems, walk })),
    ...hops.values().map((problems) => keptHop(ctx, context, { problems, walk })),
  ])
  return kept.flat()
}
