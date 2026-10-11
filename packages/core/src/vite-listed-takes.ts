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
import { type Holder, holdersOf } from './vite-listed-holders.ts'
import { merged, type Routes, serverRoutes, takesFrom } from './vite-listed-routes.ts'
import { compareText } from './vite-problems.ts'
import { isSecondHop } from './vite-used-package-lines.ts'

interface Walk {
  readonly cxExports: CxExports
  readonly resolutions: Resolutions
}

/**
 * One module that gives out `cx` with what the build read of its takes: the holders of its `cx`
 * exports and the takes the importers of the build make of each. The imports a server environment
 * makes are added when they are known, which can be after the environment that read the rest has
 * ended.
 */
export interface Prepared {
  readonly holders: readonly Holder[]
  readonly isHop: boolean
  readonly isListed: boolean
  /**
   * Whether the module has a clearing specifier: a take of the module itself by an application
   * module or a calling dependency is then on the `cxModules` route.
   */
  readonly hasEntry: boolean
  readonly problems: readonly LocatedProblem[]
  readonly routed: readonly Routes[]
}

/**
 * Reads what the importers of the build take of one module that gives out `cx`.
 */
async function prepareOne(
  ctx: RenderContext,
  context: UsedContext,
  input: {
    readonly isHop: boolean
    readonly problems: readonly LocatedProblem[]
    readonly walk: Walk
  },
): Promise<Prepared> {
  const { isHop, problems, walk } = input
  const first = problems[0]!
  const pkg = first.pkg!
  const names = new Set(problems.flatMap((problem) => problem.exportedAs ?? []))
  const hasEntry = !isHop && problems.some((problem) => problem.specifier !== undefined)
  const holders = await holdersOf(ctx, { ...walk, id: first.moduleId!, names })
  const routed = await Promise.all(
    holders.map((holder) =>
      takesFrom(ctx, context, {
        holder,
        isEntry: hasEntry && !holder.isReached,
        pkg,
        resolutions: walk.resolutions,
        wantCalls: isHop,
      }),
    ),
  )
  const isListed = Object.hasOwn(context.options.keepFor, pkg)
  return { hasEntry, holders, isHop, isListed, problems, routed }
}

/**
 * The problems of a module that gives out `cx` that stay errors, given the takes of the build and
 * of the server environments: for the takes only an application module can end (of the module, or
 * of a forward of it), the problems with those takes; a take a `cxModules` entry clears keeps only
 * the problems that have the specifier; a dependency module that re-exports a listed module's `cx`
 * also keeps the callers whose calls only the package's `keepFor` entry stands in for.
 */
function decideOne(
  prepared: Prepared,
  serverImports: readonly ResolvedServerImport[],
): LocatedProblem[] {
  const { hasEntry, holders, isHop, isListed, problems, routed } = prepared
  const fromServer = holders.map((holder) =>
    serverRoutes(holder, { isEntry: hasEntry && !holder.isReached, serverImports }),
  )
  const entry = [...routed.flatMap((route) => route.entry), ...fromServer.flatMap((r) => r.entry)]
  if (entry.length > 0) return problems.filter((problem) => problem.specifier !== undefined)
  const told = merged([
    ...routed.flatMap((route) => route.told),
    ...fromServer.flatMap((route) => route.told),
  ])
  const callers = isHop && !isListed ? callersOf(routed) : []
  if (told.length === 0 && callers.length === 0) return []
  return problems.map((problem) => ({
    ...problem,
    ...(told.length > 0 && { takes: told }),
    ...(callers.length > 0 && { callers }),
  }))
}

/**
 * The modules, root-relative, of other dependencies whose takes of a re-export do more than
 * re-export it, in code-unit order.
 */
function callersOf(routed: readonly Routes[]): string[] {
  const callers = new Set(routed.flatMap((route) => route.calls.map((call) => call.taker)))
  return [...callers].toSorted(compareText)
}

/**
 * Reads what the importers of the build take of the modules of the problems that give `cx` out:
 * the problems their listing suppressed and the dependency re-exports of a listed module's `cx`.
 */
export async function prepareReexports(
  ctx: RenderContext,
  context: UsedContext,
  standingIn: readonly LocatedProblem[],
): Promise<Prepared[]> {
  const exporting = standingIn.filter((problem) => problem.exportedAs !== undefined)
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
  const walk: Walk = { cxExports, resolutions: new Map() }
  return await Promise.all([
    ...byModule
      .values()
      .map((problems) => prepareOne(ctx, context, { isHop: false, problems, walk })),
    ...hops.values().map((problems) => prepareOne(ctx, context, { isHop: true, problems, walk })),
  ])
}

/**
 * The problems that give `cx` out and that `keepFor` does not clear, given what the build read of
 * their takes and the imports a server environment makes of a listed package.
 */
export function decideReexports(
  prepared: readonly Prepared[],
  serverImports: readonly ResolvedServerImport[],
): LocatedProblem[] {
  return prepared.flatMap((one) => decideOne(one, serverImports))
}
