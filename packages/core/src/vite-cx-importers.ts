/**
 * The build-end check that every import of Nave's own `cx` file was recognised as one. The
 * collector recognises an import by the specifier `@navecss/core/cx` as written, but a Vite alias
 * is resolved after the text is read, so an import through one (`#cx`) would be unfollowed and
 * every call made through it would ship with no rule. The module graph does not lie: it lists the
 * importers of the resolved file, and the specifiers each one writes are read from its parse, so
 * an importer that reaches the file through any specifier but the package's, whatever else its
 * text says and whatever else it imports, fails the build naming the importer and the specifier.
 */
import path from 'node:path'

import type { AstNode } from './vite-ast.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { childrenOf, nodeAt, staticStringOf } from './vite-ast.ts'
import { CX_SOURCE } from './vite-collect.ts'
import { filePathOf } from './vite-css-id.ts'
import { isDependencyId, isNaveOwn, moduleLabel, packageNameOf } from './vite-module-kind.ts'
import { compareText } from './vite-problems.ts'

export interface Importer {
  readonly id: string
  readonly code: string
}

/**
 * The ids of the modules that import `cxId`, statically or dynamically.
 */
export function importerIdsOf(ctx: RenderContext, cxId: string): string[] {
  const info = ctx.getModuleInfo?.(cxId)
  return [...new Set([...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])])]
}

/**
 * Whether the module is in a package that `keepFor` stands in for.
 */
async function isStoodInFor(context: UsedContext, id: string): Promise<boolean> {
  if (!isDependencyId(id)) return false
  const pkg = await packageNameOf(filePathOf(id), context.packageNames)
  return pkg !== undefined && Object.hasOwn(context.options.keepFor, pkg)
}

/**
 * The importer `id` with its text, unless it is Nave's own or in a package `keepFor` stands in for.
 */
export async function candidateOf(
  ctx: RenderContext,
  context: UsedContext,
  id: string,
): Promise<Importer | undefined> {
  const code = ctx.getModuleInfo?.(id)?.code
  if (code === null || code === undefined || isNaveOwn(id)) return undefined
  return (await isStoodInFor(context, id)) ? undefined : { id, code }
}

/**
 * Every module specifier written in `program`: imports, re-exports and dynamic imports.
 */
export function specifiersIn(program: AstNode): string[] {
  const found = new Set<string>()
  const stack: AstNode[] = [program]
  while (stack.length > 0) {
    const node = stack.pop()!
    const source = staticStringOf(nodeAt(node, 'source'))
    if (source !== undefined) found.add(source)
    stack.push(...childrenOf(node))
  }
  return [...found]
}

/**
 * Every specifier `importer` writes, or `undefined` when its text cannot be read.
 */
export function specifiersOf(ctx: RenderContext, importer: Importer): string[] | undefined {
  try {
    return specifiersIn(ctx.parse?.(importer.code) as AstNode)
  } catch {
    return undefined
  }
}

/**
 * Whether `specifier` resolves to `cxId` from `importer`, asked once for each importer and
 * specifier: a subpath import (`#cx`) resolves through the nearest `package.json`, so the same
 * text can name different files from different importers. A relative specifier is asked too, since
 * it can name the installed file.
 */
export async function isResolvingToCx(
  ctx: RenderContext,
  specifier: string,
  importer: Importer,
  known: { readonly answers: Map<string, boolean>; readonly cxId: string },
): Promise<boolean> {
  if (specifier === CX_SOURCE) return false
  const key = `${importer.id}\0${specifier}`
  const answered = known.answers.get(key)
  if (answered !== undefined) return answered
  const resolved = await ctx.resolve?.(specifier, importer.id)
  const isCx = resolved?.id === known.cxId
  known.answers.set(key, isCx)
  return isCx
}

/**
 * The line for one importer: the module, and the specifier it reaches `cx` through.
 */
function lineFor(label: string, specifiers: readonly string[]): string {
  if (specifiers.length === 0) {
    return `${label}: imports cx through a specifier the build does not read.`
  }
  return `${label}: imports cx from ${specifiers.map((specifier) => `'${specifier}'`).join(', ')}.`
}

/**
 * The line for `importer` when the collector did not read all of its imports of `cx`, or
 * `undefined` when it did: the specifiers it writes that reach the file other than as the
 * package's own, or, when there are none, the lack of the package's specifier in what it writes.
 */
async function lineOf(
  ctx: RenderContext,
  context: UsedContext,
  importer: Importer,
  known: { readonly answers: Map<string, boolean>; readonly cxId: string },
): Promise<string | undefined> {
  const written = specifiersOf(ctx, importer)
  const unread: string[] = []
  const specifiers = written ?? []
  for (const specifier of specifiers) {
    if (await isResolvingToCx(ctx, specifier, importer, known)) unread.push(specifier)
  }
  const label = moduleLabel(context.root, importer.id)
  if (unread.length > 0) return lineFor(label, unread)
  // An escape in the specifier hides it from a search of the text, not from the parse.
  const isRead = written?.includes(CX_SOURCE) ?? importer.code.includes(CX_SOURCE)
  return isRead ? undefined : lineFor(label, [])
}

/**
 * Fails the build when a module imports Nave's `cx` through a specifier the collector did not
 * read, since every call it makes would ship with no rule.
 */
export async function checkCxImporters(ctx: RenderContext, context: UsedContext): Promise<void> {
  const resolved = await ctx.resolve?.(CX_SOURCE, path.join(context.root, 'index.html'))
  if (!resolved) return
  const known = { cxId: resolved.id, answers: new Map<string, boolean>() }
  const lines: string[] = []
  for (const id of importerIdsOf(ctx, resolved.id)) {
    const importer = await candidateOf(ctx, context, id)
    const line = importer && (await lineOf(ctx, context, importer, known))
    if (line) lines.push(line)
  }
  if (lines.length === 0) return
  const count = lines.length === 1 ? '1 module imports' : `${lines.length} modules import`
  ctx.error(
    [
      `${count} cx through a specifier the build does not follow, so the atoms its calls name would not ship:`,
      ...lines.toSorted(compareText),
      "Import cx from '@navecss/core/cx' directly where it is called.",
    ].join('\n'),
  )
}
