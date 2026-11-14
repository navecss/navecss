/**
 * The build-end judgement of the re-exports of `cx` that a package `keepFor` lists gives out: which
 * of them stay errors because a module of the consumer takes a `cx` export through them, with the
 * line that clears each. The Vite plugin calls it at build end, and a host with another module
 * graph (see `ModuleHost`) calls it over its own, so both say the same thing about the same code.
 */
import type { Prepared } from './vite-listed-takes.ts'
import type { ResolvedServerImport } from './vite-server-takes.ts'
import type { ModuleHost, TakesContext } from './vite-takes-host.ts'
import type { LocatedProblem } from './vite-used-report.ts'

import { withoutEchoes } from './vite-declared-echoes.ts'
import { withClearingSpecifiers } from './vite-dependency-reexports.ts'
import { decideReexports, prepareReexports } from './vite-listed-takes.ts'
import { isSecondHop } from './vite-used-package-lines.ts'

/**
 * What reading one module found: its problems, those a `keepFor` entry stands in for set aside
 * (`suppressed`), and the listed files it reads a `cx` from when it reads no other (`onlyVia`).
 */
export interface ModuleOutcome {
  readonly onlyVia?: ReadonlySet<string> | undefined
  readonly problems: readonly LocatedProblem[]
  readonly suppressed: readonly LocatedProblem[]
}

/**
 * The problems the build fails with, given what each module's reading found: those of a package
 * `keepFor` lists are only the ones its listing does not stand in for, a listed module that
 * exports a `cx` the build does not follow and a `cx` export that a module the consumer can
 * change takes. `serverImports` are the imports a server environment makes of a listed package it
 * leaves external, when the host has such environments.
 * @param host The module graph of the build.
 * @param context The project root, the options, and the lookups that need the file system.
 * @param modules What each module's reading found.
 * @param serverImports What the server environments imported of a listed package.
 * @returns The problems to report, and what was read of the takes of each re-exporting module.
 */
export async function judgeReexports(
  host: ModuleHost,
  context: TakesContext,
  modules: readonly ModuleOutcome[],
  serverImports: readonly ResolvedServerImport[] = [],
): Promise<{ prepared: Prepared[]; problems: LocatedProblem[] }> {
  const kept = await withClearingSpecifiers(
    host,
    context,
    withoutEchoes(
      modules.map((module) => ({
        onlyVia: module.onlyVia,
        problems: [
          ...module.problems,
          ...module.suppressed.filter((problem) => problem.kind === 'declared'),
        ],
      })),
    ),
  )
  // A hand-out of `cx` the build cannot follow to an export is no call `keepFor` stands in for:
  // it stays an error whatever the application imports.
  const suppressed = modules.flatMap((module) => module.suppressed)
  const held = suppressed
    .filter((problem) => problem.isUnboundHandOut === true)
    .map((problem) => ({ ...problem, isHeld: true }))
  // A dependency's re-export of a listed module's `cx` is judged by what takes it, listed or not.
  const standingIn = [
    ...suppressed.filter((problem) => problem.isUnboundHandOut !== true),
    ...kept.filter((problem) => isSecondHop(problem)),
  ]
  const rest = kept.filter((problem) => !isSecondHop(problem))
  const prepared = await prepareReexports(host, context, standingIn)
  return { problems: [...rest, ...held, ...decideReexports(prepared, serverImports)], prepared }
}
