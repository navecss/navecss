/**
 * The emitted set: the atoms the build ships, fixed when the first client stylesheet holding the
 * atomic layer is handed back to Vite. It is the atoms every environment has read, `keep`, every
 * `keepFor` list, and, when a server invocation ran first, the set it left in the cache directory.
 */
import type { PackageRecord } from './vite-handshake.ts'
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
 * The words of the failure a server invocation meets when the client's CSS lacks its atoms.
 */
function missingFromClient(
  ctx: RenderContext,
  context: UsedContext,
  missing: readonly string[],
): string {
  const lines = recordsOf(context.state, ctx.environment.name).flatMap((record) =>
    missing
      .filter((atom) => record.atoms.has(atom))
      .map((atom) => `${record.file}: names ${atom}.`),
  )
  return [
    'The client build already wrote its CSS without atoms this server build names, so their rules are missing from it:',
    ...lines,
    'List the atoms in keep in navePlugin(), or build the server first (vite build --ssr, then vite build).',
  ].join('\n')
}

/**
 * The atoms a server environment named that the client set lacks, checked against the file a
 * client invocation left: a build of the server run after the client. When the file is not
 * waiting for this build, the check cannot be made, the build says so, and its atoms are left in
 * the file for the client build that may follow.
 */
export function checkServerInvocation(ctx: RenderContext, context: UsedContext): void {
  if (context.cacheDir === '' || context.inProcess || context.state.emitted) return
  const atoms = new Set(recordsOf(context.state, ctx.environment.name).flatMap((r) => [...r.atoms]))
  const file = readHandshake(context.cacheDir)
  if (file?.writer !== 'client') {
    const emitted = [...new Set([...atoms, ...(file?.emitted ?? [])])]
    writeHandshake(
      context.cacheDir,
      { emitted, writer: ctx.environment.name, consumed: false },
      (message) => ctx.warn(message),
    )
    return
  }
  if (file.consumed) {
    // A client build that has taken a server set, or been checked against one, is no set to check
    // against. The atoms of this server build are left for a client build that follows it.
    writeHandshake(
      context.cacheDir,
      { emitted: [...atoms], writer: ctx.environment.name, consumed: false },
      (message) => ctx.warn(message),
    )
    ctx.warn(
      `${handshakePath(context.cacheDir)} was written by a client build that was already used, so this server build could not be checked against the CSS. Its atoms are recorded in that file for a client build that runs next; to have them in the CSS, build the server first, then the client (vite build --ssr, then vite build).`,
    )
    return
  }
  const missing = [...atoms].filter((atom) => !file.emitted.includes(atom)).toSorted(compareText)
  // A miss fails before the file is marked checked, so every server build against this CSS fails
  // until its atoms are in it, not only the first.
  if (missing.length > 0) ctx.error(missingFromClient(ctx, context, missing))
  writeHandshake(context.cacheDir, { ...file, consumed: true }, (message) => ctx.warn(message))
}
