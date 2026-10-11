/**
 * What a server environment takes from a package `keepFor` lists that it leaves external. The
 * server transforms the consumer's own modules, so its imports of the package are readable even
 * though the package's modules are not part of its graph. Each is recorded name-agnostic (every
 * name counts as a `cx` export), and judged where the `cx` exports of the package are known: the
 * client graph. A take of a module no environment transformed gets the untransformed-dependency
 * warning, worded for that case. With separate client and server commands the server's imports
 * wait in `cacheDir`, and the client command judges them.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { AstNode } from './vite-ast.ts'
import type { Taken } from './vite-cx-takes.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { filePathOf } from './vite-css-id.ts'
import { specifiersIn } from './vite-cx-importers.ts'
import { fileOf } from './vite-cx-modules.ts'
import { takesIn } from './vite-cx-takes.ts'
import { isDependencyId, isNaveOwn } from './vite-module-kind.ts'
import { compareText } from './vite-problems.ts'
import { packageOfSpecifier } from './vite-untransformed.ts'

const SERVER_TAKES_FILE = 'nave-used-server-takes.json'

/**
 * One import a server module of the consumer's makes of a listed package: the module, root
 * relative, the specifier it writes, and what it takes from it, any name counting as a `cx` export.
 */
export interface ServerImport {
  readonly specifier: string
  readonly takes: readonly Taken[]
  readonly taker: string
}

/**
 * A server import whose target the client graph read: the file it resolves to there.
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
 * What the module `id` takes by each specifier it writes that is in `externals`.
 */
function importsOf(
  ctx: RenderContext,
  input: { readonly externals: ReadonlySet<string>; readonly id: string; readonly root: string },
): ServerImport[] {
  const { externals, id, root } = input
  const program = parsed(ctx, id)
  if (!program) return []
  const taker = path.relative(root, filePathOf(id)).replaceAll('\\', '/')
  return specifiersIn(program)
    .filter((specifier) => externals.has(specifier))
    .map((specifier) => ({
      specifier,
      takes: takesIn(program, { names: undefined, reaches: new Set([specifier]) }),
      taker,
    }))
    .filter((found) => found.takes.length > 0)
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
 * Leaves a server invocation's imports for the client invocation that judges them.
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
    writeFileSync(file, `${JSON.stringify(imports, undefined, 2)}\n`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    ctx.warn(
      `navePlugin(): could not write ${file} (${reason}), so a build of the client run as another process cannot check what your server code takes from a package keepFor lists.`,
    )
  }
}

/**
 * The imports an earlier server invocation left, or none.
 */
export function readServerImports(context: UsedContext): ServerImport[] {
  if (context.cacheDir === '') return []
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(context.cacheDir, SERVER_TAKES_FILE), 'utf8'),
    )
    return Array.isArray(parsed) ? (parsed as ServerImport[]) : []
  } catch {
    return []
  }
}

/**
 * The id `specifier` resolves to from `from`, or `undefined` when it does not resolve.
 */
async function resolvedOrNone(
  ctx: RenderContext,
  specifier: string,
  from: string,
): Promise<string | undefined> {
  try {
    const resolved = await ctx.resolve?.(specifier, from)
    return resolved?.id
  } catch {
    return undefined
  }
}

/**
 * Splits the imports into those whose target the client graph holds, with the file, and those no
 * environment transformed, which the build cannot judge.
 */
export async function judgeable(
  ctx: RenderContext,
  context: UsedContext,
  imports: readonly ServerImport[],
): Promise<{ known: ResolvedServerImport[]; unknown: ServerImport[] }> {
  const known: ResolvedServerImport[] = []
  const unknown: ServerImport[] = []
  for (const found of imports) {
    const from = path.join(context.root, found.taker)
    const resolved = await resolvedOrNone(ctx, found.specifier, from)
    const isRead = resolved !== undefined && Boolean(ctx.getModuleInfo?.(resolved))
    if (resolved !== undefined && isRead) known.push({ ...found, file: fileOf(resolved) })
    else unknown.push(found)
  }
  return { known, unknown }
}

/**
 * The words of the warning for the listed package `pkg`, whose modules the server imports and no
 * environment transforms.
 */
function warningFor(pkg: string, found: readonly ServerImport[]): string {
  const isOne = new Set(found.map((one) => one.specifier)).size === 1
  const [modules, them, it] = isOne ? ['a module', 'it', 'it'] : ['modules', 'them', 'one']
  const imports = found
    .map((one) => `${one.taker} imports '${one.specifier}'`)
    .toSorted(compareText)
    .join(', ')
  return `${pkg}, which keepFor lists, has ${modules} no environment of this build transforms, so the build cannot tell whether your server code takes cx from ${them}: ${imports}. Add ${pkg} to ssr.noExternal in your Vite config so the build reads ${them} and checks what your server code takes; where a file takes cx from ${it}, import cx from @navecss/core/cx there instead.`
}

/**
 * Warns, once for each package, about the imports whose target no environment transformed.
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
    ctx.warn(warningFor(pkg, imports))
  }
}
