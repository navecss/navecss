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
 * Where a call the build could not read is: `path:line:column`, or the path alone when no source
 * map leads to a line.
 */
function positionText(place: { column: number; file: string; line: number }): string {
  return place.line === 0 ? place.file : `${place.file}:${place.line}:${place.column}`
}

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
      unreadable: places.map((place) => positionText(place)),
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
 * What a client invocation takes from the file an earlier invocation left: the set of a server
 * invocation that ran first, or, from a client invocation's file, the atoms server builds failed
 * on against its CSS. `took` says whether it took a set at all, empty or not.
 */
function takenFromCache(context: UsedContext): { atoms: readonly string[]; took: boolean } {
  const file = context.inProcess ? undefined : readHandshake(context.cacheDir)
  if (file === undefined) return { atoms: [], took: false }
  if (file.writer !== 'client') return { atoms: file.emitted, took: true }
  const pending = file.pending ?? []
  return { atoms: pending, took: pending.length > 0 }
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
  const taken = takenFromCache(context)
  for (const atom of taken.atoms) atoms.add(atom)
  withRestorers(atoms)
  state.emitted = atoms
  writeHandshake(
    context.cacheDir,
    {
      emitted: [...atoms],
      writer: 'client',
      consumed: taken.took,
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
    `They are recorded in ${handshakePath(context.cacheDir)} for the next client build. List the atoms in keep in navePlugin(), or build the client again, then the server (vite build, then vite build --ssr). To keep this from recurring, build the server first, then the client (vite build --ssr, then vite build).`,
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
 * Checks the atoms of a server invocation against a client set that is waiting for it. A miss
 * fails the build, every time: the client CSS on disk still lacks the atoms. The build records
 * its atoms in the file as pending, and the next client build ships them.
 */
function checkWaitingClient(
  ctx: RenderContext,
  context: UsedContext,
  atoms: ReadonlySet<string>,
  file: Handshake,
): void {
  const missing = [...atoms].filter((atom) => !file.emitted.includes(atom)).toSorted(compareText)
  if (missing.length === 0) {
    // What an earlier server build failed on is not named by this one, so it is not shipped.
    writeHandshake(context.cacheDir, { ...file, consumed: true, pending: [] }, (message) => {
      ctx.warn(message)
    })
    return
  }
  const pending = [...new Set([...(file.pending ?? []), ...withRestorers(new Set(atoms))])]
  writeHandshake(context.cacheDir, { ...file, pending }, (message) => ctx.warn(message))
  ctx.error(missingFromClient(ctx, context, missing))
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
