/**
 * The emitted set: the atoms the build ships, fixed when the first client stylesheet holding the
 * atomic layer is handed back to Vite. It is the atoms every environment has read, `keep`, every
 * `keepFor` list, and, when a server invocation ran first, the set it left in the cache directory,
 * closed under the one pair of atoms where one restores what the other removes.
 */
import type { Handshake, PackageRecord } from './vite-handshake.ts'
import type { EnvironmentLike, RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { handshakePath, readHandshake, writeHandshake } from './vite-handshake.ts'
import { compareText } from './vite-problems.ts'
import { collectedAtoms, recordsOf } from './vite-state.ts'

/**
 * What the file records about each package listed in `keepFor`.
 */
function packageRecords(context: UsedContext): Record<string, PackageRecord> {
  const records: Record<string, PackageRecord> = {}
  for (const pkg of Object.keys(context.options.keepFor)) {
    const modules = context.state.modules
      .values()
      .filter((record) => record.pkg === pkg)
      .toArray()
    const places = modules.flatMap((record) => [...record.suppressed, ...record.dynamicCalls])
    records[pkg] = {
      collected: [...new Set(modules.flatMap((record) => [...record.atoms]))].toSorted(compareText),
      unreadable: places.map((place) => `${place.file}:${place.line}:${place.column}`),
    }
  }
  return records
}

/**
 * The `keepFor` keys that name no package any environment of this invocation transformed.
 */
function unmatchedKeys(context: UsedContext): string[] {
  const transformed = new Set(context.state.modules.values().map((record) => record.pkg))
  return Object.keys(context.options.keepFor).filter((pkg) => !transformed.has(pkg))
}

/**
 * `atoms` with the atoms added that restore what an atom in it removes: `srOnlyFocusable` shows
 * again on focus what `srOnly` hides, so a set that holds `srOnly` holds it too. This adds to the
 * emitted set only, not to `keep` or to what `cx.dynamic()` accepts.
 */
function withRestorers(atoms: Set<string>): Set<string> {
  if (atoms.has('srOnly')) atoms.add('srOnlyFocusable')
  return atoms
}

/**
 * The emitted set. A client environment fixes it (and writes the cache file); any other
 * environment reads what is known so far and fixes nothing.
 */
export function emittedSet(
  context: UsedContext,
  environment: EnvironmentLike,
  warn?: (message: string) => void,
): ReadonlySet<string> {
  const { state } = context
  if (state.emitted) return state.emitted
  const atoms = collectedAtoms(state, context.kept)
  if (environment.config.consumer !== 'client') return atoms
  const waiting = context.inProcess ? undefined : readHandshake(context.cacheDir)
  const hasServerSet = waiting !== undefined && waiting.writer !== 'client'
  if (hasServerSet) for (const atom of waiting.emitted) atoms.add(atom)
  withRestorers(atoms)
  state.emitted = atoms
  writeHandshake(
    context.cacheDir,
    {
      emitted: [...atoms],
      writer: 'client',
      consumed: hasServerSet,
      keepFor: packageRecords(context),
      unmatchedKeepFor: unmatchedKeys(context),
    },
    warn,
  )
  return atoms
}

/**
 * One line for each of `atoms` and each module of this server environment that names it, in the
 * form `<module>: names <atom>.`.
 */
function namingLines(ctx: RenderContext, context: UsedContext, atoms: readonly string[]): string[] {
  return recordsOf(context.state, ctx.environment.name).flatMap((record) =>
    atoms.filter((atom) => record.atoms.has(atom)).map((atom) => `${record.file}: names ${atom}.`),
  )
}

/**
 * The words of the failure a server invocation meets when the client's CSS lacks its atoms.
 */
function missingFromClient(
  ctx: RenderContext,
  context: UsedContext,
  missing: readonly string[],
): string {
  return [
    'The client build already wrote its CSS without atoms this server build names, so their rules are missing from it:',
    ...namingLines(ctx, context, missing),
    'List the atoms in keep in navePlugin(), or build the server first (vite build --ssr, then vite build).',
  ].join('\n')
}

/**
 * The words of the warning a server invocation prints when it records its set for the client
 * build that follows and some of its atoms are not in the set the file held.
 */
function notInLastClient(
  ctx: RenderContext,
  context: UsedContext,
  missing: readonly string[],
): string {
  return [
    `${handshakePath(context.cacheDir)} was written by a client build that was already used, so this server build could not be checked against the CSS. These atoms it names are not in that client build's set:`,
    ...namingLines(ctx, context, missing),
    'They are recorded in that file for a client build that runs next; to have them in the CSS, build the server first, then the client (vite build --ssr, then vite build).',
  ].join('\n')
}

/**
 * Leaves this server invocation's set in the file for the client build that runs next, and says
 * so when an atom of it is not in the set the file held: the last client CSS built here.
 */
function recordForNextClient(
  ctx: RenderContext,
  context: UsedContext,
  atoms: ReadonlySet<string>,
  held: readonly string[],
): void {
  writeHandshake(
    context.cacheDir,
    { emitted: [...withRestorers(new Set(atoms))], writer: ctx.environment.name, consumed: false },
    (message) => ctx.warn(message),
  )
  const missing = [...atoms].filter((atom) => !held.includes(atom)).toSorted(compareText)
  if (missing.length > 0) ctx.warn(notInLastClient(ctx, context, missing))
}

/**
 * Checks the atoms of a server invocation against a client set that is waiting for it: a miss
 * fails the build, once; the same miss again, with no client build in between, leaves the set of
 * this build for the client build that follows, because failing again would leave the build the
 * failure recommends failing for good.
 */
function checkWaitingClient(
  ctx: RenderContext,
  context: UsedContext,
  atoms: ReadonlySet<string>,
  file: Handshake,
): void {
  const missing = [...atoms].filter((atom) => !file.emitted.includes(atom)).toSorted(compareText)
  const failed = file.serverFailed ?? []
  if (missing.length === 0) {
    writeHandshake(context.cacheDir, { ...file, consumed: true }, (message) => ctx.warn(message))
  } else if (missing.every((atom) => failed.includes(atom))) {
    recordForNextClient(ctx, context, atoms, file.emitted)
  } else {
    // The file is not marked checked, so a server build against this CSS fails until its atoms
    // are in it or it has failed once on them; the file keeps what it failed on.
    writeHandshake(
      context.cacheDir,
      { ...file, serverFailed: [...new Set([...failed, ...missing])] },
      (message) => ctx.warn(message),
    )
    ctx.error(missingFromClient(ctx, context, missing))
  }
}

/**
 * The atoms a server environment named that the client set lacks, checked against the file a
 * client invocation left: a build of the server run after the client. A client set that is no
 * longer waiting for this build (a server build checked it, or it took a server set) is no set
 * to check against: this build leaves its own set for the client build that may follow.
 */
export function checkServerInvocation(ctx: RenderContext, context: UsedContext): void {
  if (context.cacheDir === '' || context.inProcess || context.state.emitted) return
  const atoms = new Set(recordsOf(context.state, ctx.environment.name).flatMap((r) => [...r.atoms]))
  const file = readHandshake(context.cacheDir)
  if (file?.writer !== 'client') {
    const emitted = [...withRestorers(new Set([...atoms, ...(file?.emitted ?? [])]))]
    writeHandshake(
      context.cacheDir,
      { emitted, writer: ctx.environment.name, consumed: false },
      (message) => ctx.warn(message),
    )
  } else if (file.consumed) {
    recordForNextClient(ctx, context, atoms, file.emitted)
  } else {
    checkWaitingClient(ctx, context, atoms, file)
  }
}
