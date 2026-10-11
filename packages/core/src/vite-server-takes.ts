/**
 * What a server environment takes from a package `keepFor` lists that it leaves external. The
 * server transforms the consumer's own modules, so its imports of the package are readable even
 * though the package's modules are not part of its graph. Each is recorded name-agnostic (every
 * name counts as a `cx` export) with the file the server loads for it, and judged where the `cx`
 * exports of the package are known: the client graph. A module no environment transformed, and an
 * import the build cannot read, get the untransformed-dependency warning, worded for each. With
 * separate client and server commands each server command keeps its own entry in `cacheDir`, and
 * the client command judges all of them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { AstNode } from './vite-ast.ts'
import type { Taken } from './vite-cx-takes.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { filePathOf } from './vite-css-id.ts'
import { specifiersIn } from './vite-cx-importers.ts'
import { fileOf } from './vite-cx-modules.ts'
import { takesIn, UNREADABLE } from './vite-cx-takes.ts'
import { isDependencyId, isNaveOwn } from './vite-module-kind.ts'
import { compareText } from './vite-problems.ts'
import { serverFileOf } from './vite-server-resolve.ts'
import { packageOfSpecifier } from './vite-untransformed.ts'

const SERVER_TAKES_FILE = 'nave-used-server-takes.json'

/**
 * One import a server module of the consumer's makes of a listed package: the module, root
 * relative, the specifier it writes, what it takes from it (any name counting as a `cx` export),
 * and the file the server loads for it when that is known.
 */
export interface ServerImport {
  readonly file?: string
  /**
   * Whether the module imports the package in a way the build cannot read, such as `require()`.
   */
  readonly isUnreadable?: boolean
  /**
   * Whether an earlier server command recorded it, not a server environment of this process.
   */
  readonly isRecorded?: boolean
  readonly specifier: string
  readonly takes: readonly Taken[]
  readonly taker: string
}

/**
 * A server import whose target the client graph holds: the file it resolves to.
 */
export interface ResolvedServerImport extends ServerImport {
  readonly file: string
}

/**
 * The parse of the module `id`, or `undefined` when it has no text or does not parse.
 */
function parsed(ctx: RenderContext, id: string): AstNode | undefined {
  const code = ctx.getModuleInfo?.(id)?.code
  try {
    return code === null || code === undefined ? undefined : (ctx.parse?.(code) as AstNode)
  } catch {
    return undefined
  }
}

/**
 * The output format of a server environment's bundle: `cjs` loads an external package with
 * `require`, anything else with `import`.
 */
function formatOf(ctx: RenderContext): unknown {
  const build = (
    ctx.environment.config as {
      build?: { rolldownOptions?: { output?: unknown }; rollupOptions?: { output?: unknown } }
    }
  ).build
  const output = build?.rolldownOptions?.output ?? build?.rollupOptions?.output
  const first = Array.isArray(output) ? (output[0] as unknown) : output
  return (first as { format?: unknown } | undefined)?.format
}

/**
 * The conditions a built server loads an external package under: Node's own, for a `require` when
 * the bundle is in the CommonJS format and for an `import` otherwise.
 */
export function conditionsOf(ctx: RenderContext): string[] {
  return ['node', formatOf(ctx) === 'cjs' ? 'require' : 'import', 'module-sync', 'default']
}

/**
 * The imports the module `id` makes of the packages in `externals`: those its parse names, with
 * what they take, and those the module graph shows that the parse does not name.
 */
function importsOf(
  ctx: RenderContext,
  input: { readonly externals: ReadonlySet<string>; readonly id: string; readonly root: string },
): ServerImport[] {
  const { externals, id, root } = input
  const program = parsed(ctx, id)
  const taker = path.relative(root, filePathOf(id)).replaceAll('\\', '/')
  const conditions = conditionsOf(ctx)
  const named = program ? specifiersIn(program).filter((one) => externals.has(one)) : []
  const info = ctx.getModuleInfo?.(id)
  const shown = [...(info?.importedIds ?? []), ...(info?.dynamicallyImportedIds ?? [])]
  const unread = shown.filter((one) => externals.has(one) && !named.includes(one))
  const read = named.map((specifier) => ({
    specifier,
    takes: program ? takesIn(program, { names: undefined, reaches: new Set([specifier]) }) : [],
    taker,
  }))
  const imports = [
    ...read.filter((found) => found.takes.length > 0),
    ...unread.map((specifier) => ({
      isUnreadable: true,
      specifier,
      takes: [UNREADABLE],
      taker,
    })),
  ]
  return imports.map((found) => {
    const file = serverFileOf({
      conditions,
      from: filePathOf(id),
      specifier: found.specifier,
    })
    return { ...found, ...(file !== undefined && { file }) }
  })
}

/**
 * The imports the consumer's modules of a server environment make of a listed package that the
 * environment leaves external.
 */
export function serverImportsOf(ctx: RenderContext, context: UsedContext): ServerImport[] {
  const ids = [...(ctx.getModuleIds?.() ?? [])]
  const isListed = (id: string): boolean => {
    const name = packageOfSpecifier(id)
    return name !== undefined && Object.hasOwn(context.options.keepFor, name)
  }
  const externals = new Set(ids.filter((id) => isListed(id)))
  if (externals.size === 0) return []
  return ids
    .filter((id) => path.isAbsolute(filePathOf(id)) && !isDependencyId(id) && !isNaveOwn(id))
    .flatMap((id) => importsOf(ctx, { externals, id, root: context.root }))
}

/**
 * What names a server build in the file: its environment and its entries.
 */
function buildKeyOf(ctx: RenderContext): string {
  const build = (
    ctx.environment.config as {
      build?: { rolldownOptions?: { input?: unknown }; ssr?: unknown }
    }
  ).build
  return `${ctx.environment.name}\0${JSON.stringify(build?.rolldownOptions?.input ?? build?.ssr ?? '')}`
}

/**
 * The entries an earlier server command left, by server build.
 */
function readEntries(context: UsedContext): Record<string, ServerImport[]> {
  try {
    const parsedFile: unknown = JSON.parse(
      readFileSync(path.join(context.cacheDir, SERVER_TAKES_FILE), 'utf8'),
    )
    const isEntries =
      typeof parsedFile === 'object' && parsedFile !== null && !Array.isArray(parsedFile)
    return isEntries ? (parsedFile as Record<string, ServerImport[]>) : {}
  } catch {
    return {}
  }
}

/**
 * Leaves a server command's imports for the client command that judges them, replacing only the
 * entry of this server build.
 */
export function writeServerImports(
  ctx: RenderContext,
  context: UsedContext,
  imports: readonly ServerImport[],
): void {
  if (context.cacheDir === '') return
  const file = path.join(context.cacheDir, SERVER_TAKES_FILE)
  try {
    mkdirSync(context.cacheDir, { recursive: true })
    const entries = { ...readEntries(context), [buildKeyOf(ctx)]: imports }
    writeFileSync(file, `${JSON.stringify(entries, undefined, 2)}\n`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    ctx.warn(
      `navePlugin(): could not write ${file} (${reason}), so a build of the client run as another process cannot check what your server code takes from a package keepFor lists.`,
    )
  }
}

/**
 * The imports earlier server commands left, or none.
 */
export function readServerImports(context: UsedContext): ServerImport[] {
  if (context.cacheDir === '') return []
  return Object.values(readEntries(context))
    .flat()
    .filter((found) => existsSync(path.resolve(context.root, found.taker)))
    .map((found) => ({ ...found, isRecorded: true }))
}

/**
 * The files of every module the client environment holds.
 */
export function graphOf(ctx: RenderContext): Set<string> {
  return new Set([...(ctx.getModuleIds?.() ?? [])].map((id) => fileOf(id)))
}

/**
 * Splits the imports into those whose target the client graph holds and the build can read, with
 * the file, and those it cannot judge: a module no environment transformed, and an import the
 * build cannot read.
 */
export function judgeable(
  graph: ReadonlySet<string>,
  imports: readonly ServerImport[],
): { known: ResolvedServerImport[]; unknown: ServerImport[] } {
  const known: ResolvedServerImport[] = []
  const unknown: ServerImport[] = []
  for (const found of imports) {
    const { file } = found
    if (file !== undefined && found.isUnreadable !== true && graph.has(fileOf(file))) {
      known.push({ ...found, file })
    } else {
      unknown.push(found)
    }
  }
  return { known, unknown }
}

/**
 * The sentence that says the imports of `takers` come from a record an earlier server build left.
 */
export function recordedSentence(takers: readonly string[]): string | undefined {
  const named = [...new Set(takers)].toSorted(compareText).join(', ')
  if (named === '') return undefined
  return new Set(takers).size === 1
    ? `${named} was read by an earlier server build, not by this one, so what this message says of its imports comes from the record that build left in Vite's cache directory; if the file has changed since, run that server build again to refresh the record, or, if you no longer run that build, delete nave-used-server-takes.json there and run each server build you do.`
    : `${named} were read by earlier server builds, not by this one, so what this message says of their imports comes from the records those builds left in Vite's cache directory; if one of those files has changed since, run the server build that read it again to refresh its record, or, if you no longer run that build, delete nave-used-server-takes.json there and run each server build you do.`
}

/**
 * The takers of the imports an earlier server build recorded, among `imports`.
 */
function recordedTakers(imports: readonly ServerImport[]): string[] {
  return imports.filter((found) => found.isRecorded === true).map((found) => found.taker)
}

/**
 * The words of the warning for the listed package `pkg`, whose server imports the build cannot
 * judge.
 */
function warningFor(pkg: string, input: { found: readonly ServerImport[]; root: string }): string {
  const { found, root } = input
  const listed = found
    .map((one) => {
      if (one.isUnreadable === true)
        return `${one.taker} loads '${one.specifier}' in a way the build cannot read as a take, such as a require() or a # import`
      if (one.file === undefined)
        return `${one.taker} imports '${one.specifier}', and the build cannot tell which file the server loads for it`
      const file = path.relative(root, one.file).replaceAll('\\', '/')
      return `${one.taker} imports '${one.specifier}', which the server loads as ${file}, a file no environment of this build transforms`
    })
    .toSorted(compareText)
    .join('; ')
  const note = recordedSentence(recordedTakers(found))
  const warning = `${pkg}, which keepFor lists, is imported by your server code where the build cannot tell whether that code takes cx from it: ${listed}. Add ${pkg} to ssr.noExternal in your Vite config so the build reads the package and checks what your server code takes; where a file takes cx from it, import cx from @navecss/core/cx there instead.`
  return note === undefined ? warning : `${warning} ${note}`
}

/**
 * Warns, once for each package, about the imports the build cannot judge.
 */
export function warnUnknown(
  ctx: RenderContext,
  context: UsedContext,
  unknown: readonly ServerImport[],
): void {
  const byPackage = new Map<string, ServerImport[]>()
  for (const found of unknown) {
    const pkg = packageOfSpecifier(found.specifier)
    if (pkg === undefined || context.state.warned.has(pkg)) continue
    byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), found])
  }
  for (const [pkg, imports] of byPackage) {
    context.state.warned.add(pkg)
    ctx.warn(warningFor(pkg, { found: imports, root: context.root }))
  }
}
