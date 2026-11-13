import type { AstNode } from './vite-ast.ts'
import type { Resolutions } from './vite-cx-star-exports.ts'
import type { Take, Taken } from './vite-cx-takes.ts'
/**
 * The takes of a module that gives out `cx`, by the importers the consumer can change, in the two
 * routes: those a `cxModules` entry clears and those only an application module can end by
 * importing `cx` from Nave instead. A dependency that only re-exports is followed by the walk and
 * counts in neither; what else a dependency does with the module is a call.
 */
import type { ResolvedServerImport } from './vite-server-takes.ts'
import type { ModuleHost, TakesContext } from './vite-takes-host.ts'

import { pushAll } from './vite-ast.ts'
import { fileOf } from './vite-cx-modules.ts'
import { takesIn, UNREADABLE } from './vite-cx-takes.ts'
import { importersOf } from './vite-dependency-reexports.ts'
import { type Holder, reachingSpecifiers } from './vite-listed-holders.ts'
import { isDependencyId } from './vite-module-id.ts'
import { compareText } from './vite-problems.ts'
import { requireTakesIn } from './vite-require-takes.ts'

/**
 * What `program` takes by the specifiers in `reaches`, none when there is none.
 */
function importTakesOf(
  program: AstNode,
  input: {
    readonly isDependency: boolean
    readonly names: ReadonlySet<string>
    readonly reaches: ReadonlySet<string>
  },
): Taken[] {
  return input.reaches.size === 0 ? [] : takesIn(program, input)
}

/**
 * The take of an importer the build cannot read. A dependency's is held: the build cannot tell
 * where what it takes goes.
 */
function unreadableFor(id: string): Taken {
  return isDependencyId(id)
    ? { ...UNREADABLE, isHeld: true, form: 'takes this module in a way the build cannot read' }
    : UNREADABLE
}

/**
 * What the importer `id`, whose parse is `program`, takes by the specifiers it requires in
 * `requires`; a dependency's forwards by CommonJS are read as forwards.
 */
function requireTakesOf(
  program: AstNode,
  input: {
    readonly id: string
    readonly names: ReadonlySet<string>
    readonly requires: ReadonlySet<string>
  },
): Taken[] {
  if (input.requires.size === 0) return []
  return requireTakesIn(program, {
    names: input.names,
    reaches: input.requires,
    readsForwards: isDependencyId(input.id),
  }).takes
}

/**
 * What the importer `id` takes from the module `file`. An importer the build cannot read counts as
 * taking the whole module, since the build cannot tell: its text is missing or does not parse, or
 * it names the module by no specifier the build resolves to it. So does each CommonJS require of
 * the module, whatever else the importer imports from it, but for a dependency's forward by
 * CommonJS, which is followed as an `export ... from` is.
 */
async function takenBy(
  ctx: ModuleHost,
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
    if (!read) return [unreadableFor(id)]
    const { program, reaches, requires } = read
    if (reaches.size === 0 && requires.size === 0) return [unreadableFor(id)]
    return [
      ...importTakesOf(program, { isDependency: isDependencyId(id), names, reaches }),
      ...requireTakesOf(program, { id, names, requires }),
    ]
  } catch {
    return [unreadableFor(id)]
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

/**
 * A dependency's take of a module that gives out `cx` that the build reads neither as calls only
 * nor as a forward: the importer's module, the package it belongs to and what it does, in words.
 */
export interface Held {
  readonly form: string
  readonly importer: string
  readonly pkg: string
  readonly taker: string
}

export interface Routes {
  readonly entry: Take[]
  readonly told: Take[]
  /**
   * The takes a dependency makes of the module that do more than re-export it: its calls.
   */
  readonly calls: Take[]
  /**
   * The takes a dependency makes of the module that the build reads neither as calls only nor as a
   * forward, whatever the dependency is: they stay errors whatever the application imports.
   */
  readonly held: Held[]
}

/**
 * Whether the takes of the importer count: the application's always, and a dependency's when the
 * module is one a `cxModules` entry clears and the dependency is not the package itself.
 */
async function isCounted(
  context: TakesContext,
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
  return (await context.packageOf(importer)) !== pkg
}

/**
 * The takes of the `cx` exports of `holder` by one importer, in the two routes (see `takesFrom`).
 */
async function routesOf(
  ctx: ModuleHost,
  context: TakesContext,
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
  const taker = context.labelOf(importer)
  const taken = await takenBy(ctx, {
    file: fileOf(holder.id),
    id: importer,
    names: holder.names,
    resolutions,
  })
  const takes = taken.map((take) => ({ ...take, taker, isReached: holder.isReached }))
  if (isDependency) {
    // A dependency that only re-exports is followed to what takes it; what else it does is a call,
    // unless the build cannot tell where what it takes goes, which is held and no call.
    const pkg = (await context.packageOf(importer)) ?? taker
    const held = takes
      .filter((take) => take.isHeld === true)
      .map((take) => ({ form: take.form ?? '', importer, pkg, taker }))
    const calls = takes.filter((take) => take.isForward !== true && take.isHeld !== true)
    return { entry: isEntry ? calls : [], told: [], calls: wantCalls ? calls : [], held }
  }
  const isCleared = (take: Take): boolean => isEntry && take.shape !== 'unreadable'
  return {
    entry: takes.filter((take) => isCleared(take)),
    told: takes.filter((take) => !isCleared(take)),
    calls: [],
    held: [],
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
  ctx: ModuleHost,
  context: TakesContext,
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
  const held: Held[] = []
  for (const importer of importers) {
    const routes = await routesOf(ctx, context, {
      holder,
      importer,
      isEntry,
      resolutions,
      wantCalls,
    })
    // A dependency's held take counts whoever the dependency is, the package itself included.
    pushAll(held, routes.held)
    if (!(await isCounted(context, { importer, isEntry, pkg, wantCalls }))) continue
    pushAll(entry, routes.entry)
    pushAll(told, routes.told)
    pushAll(calls, routes.calls)
  }
  return { entry: merged(entry), told: merged(told), calls: merged(calls), held }
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
