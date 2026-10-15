import type { Resolutions } from './vite-cx-star-exports.ts'
import type { Take, Taken } from './vite-cx-takes.ts'
/**
 * The takes of a module that gives out `cx`, by the importers the consumer can change, in the two
 * routes: those a `cxModules` entry clears and those only an application module can end by
 * importing `cx` from Nave instead. A dependency that only re-exports is followed by the walk and
 * counts in neither; what else a dependency does with the module is a call.
 */
import type { ResolvedServerImport } from './vite-server-takes.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { pushAll } from './vite-ast.ts'
import { filePathOf } from './vite-css-id.ts'
import { fileOf } from './vite-cx-modules.ts'
import { takesIn, UNREADABLE } from './vite-cx-takes.ts'
import { importersOf } from './vite-dependency-reexports.ts'
import { type Holder, reachingSpecifiers } from './vite-listed-holders.ts'
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
export function merged(takes: readonly Take[]): Take[] {
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

export interface Routes {
  readonly entry: Take[]
  readonly told: Take[]
  /**
   * The takes a dependency makes of the module that do more than re-export it: its calls.
   */
  readonly calls: Take[]
}

/**
 * Whether the takes of the importer count: the application's always, and a dependency's when the
 * module is one a `cxModules` entry clears and the dependency is not the package itself.
 */
async function isCounted(
  context: UsedContext,
  input: {
    readonly importer: string
    readonly isEntry: boolean
    readonly pkg: string
    readonly wantCalls: boolean
  },
): Promise<boolean> {
  const { importer, isEntry, pkg, wantCalls } = input
  if (wantCalls || !isDependencyId(importer)) return true
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
    readonly wantCalls: boolean
  },
): Promise<Routes> {
  const { holder, importer, isEntry, resolutions, wantCalls } = input
  const isDependency = isDependencyId(importer)
  const taker = moduleLabel(context.root, importer)
  const taken = await takenBy(ctx, {
    file: fileOf(holder.id),
    id: importer,
    names: holder.names,
    resolutions,
  })
  const takes = taken.map((take) => ({ ...take, taker, isReached: holder.isReached }))
  if (isDependency) {
    // A dependency that only re-exports is followed to what takes it; what else it does is a call.
    const calls = takes.filter((take) => take.isForward !== true)
    return { entry: isEntry ? calls : [], told: [], calls: wantCalls ? calls : [] }
  }
  const isCleared = (take: Take): boolean => isEntry && take.shape !== 'unreadable'
  return {
    entry: takes.filter((take) => isCleared(take)),
    told: takes.filter((take) => !isCleared(take)),
    calls: [],
  }
}

/**
 * What a server import takes of a holder's `cx` exports: the takes of the recorded import (any
 * name counting as a `cx` export) that name one of them, or take the module whole.
 */
function serverTakesOf(found: ResolvedServerImport, holder: Holder): Take[] {
  const takes: Take[] = []
  for (const taken of found.takes) {
    const names = taken.names.filter((name) => holder.names.has(name))
    const isWhole = taken.names.length === 0
    const hasNamed = holder.names.keys().some((name) => name !== 'default')
    const isTaken = taken.shape === 'star' ? hasNamed : isWhole || names.length > 0
    if (isTaken) {
      const kept = isWhole ? taken.names : names
      takes.push({
        ...taken,
        names: kept,
        taker: found.taker,
        isReached: holder.isReached,
        ...(found.isRecorded === true && { isRecorded: true }),
      })
    }
  }
  return takes
}

/**
 * The takes of the `cx` exports of `holder` by the importers outside its package, in two routes.
 * `entry` holds those a `cxModules` entry clears: the takes, by the application or by another
 * dependency, of a module that has a clearing specifier and exports Nave's `cx` itself, as
 * `isEntry` says. `told` holds the others, which only an application module can end by importing
 * `cx` from Nave instead, and, for a module that has a clearing specifier, the application's takes
 * the build cannot read, since an entry would not make them readable. A dependency's takes that
 * only re-export are followed, not counted; its other takes are `calls` when `wantCalls` is set.
 */
export async function takesFrom(
  ctx: RenderContext,
  context: UsedContext,
  input: {
    readonly holder: Holder
    readonly isEntry: boolean
    readonly pkg: string
    readonly resolutions: Resolutions
    readonly wantCalls: boolean
  },
): Promise<Routes> {
  const { holder, isEntry, pkg, resolutions, wantCalls } = input
  const importers = importersOf(ctx, holder.id)
  const entry: Take[] = []
  const told: Take[] = []
  const calls: Take[] = []
  for (const importer of importers) {
    if (!(await isCounted(context, { importer, isEntry, pkg, wantCalls }))) {
      continue
    }

    const routes = await routesOf(ctx, context, {
      holder,
      importer,
      isEntry,
      resolutions,
      wantCalls,
    })
    pushAll(entry, routes.entry)
    pushAll(told, routes.told)
    pushAll(calls, routes.calls)
  }
  return { entry: merged(entry), told: merged(told), calls: merged(calls) }
}

/**
 * What the imports a server environment makes of the module `holder` take: takes of an
 * application module, on the `cxModules` route when `isEntry` and the take can be read.
 */
export function serverRoutes(
  holder: Holder,
  input: { readonly isEntry: boolean; readonly serverImports: readonly ResolvedServerImport[] },
): { entry: Take[]; told: Take[] } {
  const file = fileOf(holder.id)
  const fromServer = input.serverImports.filter((one) => one.file === file)
  const takes = fromServer.flatMap((found) => serverTakesOf(found, holder))
  const isCleared = (take: Take): boolean => input.isEntry && take.shape !== 'unreadable'
  return {
    entry: takes.filter((take) => isCleared(take)),
    told: takes.filter((take) => !isCleared(take)),
  }
}
