/**
 * The build-end check that every module importing Nave's own `cx` file was recognised as doing so.
 * The collector recognises an import by the specifier `@navecss/core/cx` as written, but a Vite
 * alias is resolved after the text is read, so an import through one (`#cx`) would be unfollowed
 * and every call made through it would ship with no rule. The module graph does not lie: it lists
 * the importers of the resolved file, so any importer whose text lacks the specifier reached it
 * another way, and the build fails naming the importer and the specifier it used.
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

interface Importer {
  readonly id: string
  readonly code: string
}

/**
 * The ids of the modules that import `cxId`, statically or dynamically.
 */
function importerIdsOf(ctx: RenderContext, cxId: string): string[] {
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
 * The importer `id` with its text, unless it is Nave's own, in a package `keepFor` stands in for,
 * or holds the specifier in its text, where the collector read it.
 */
async function candidateOf(
  ctx: RenderContext,
  context: UsedContext,
  id: string,
): Promise<Importer | undefined> {
  const code = ctx.getModuleInfo?.(id)?.code
  if (code === null || code === undefined) return undefined
  if (code.includes(CX_SOURCE) || isNaveOwn(id)) return undefined
  return (await isStoodInFor(context, id)) ? undefined : { id, code }
}

/**
 * Every module specifier written in `program`: imports, re-exports and dynamic imports.
 */
function specifiersIn(program: AstNode): string[] {
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
 * Every specifier `importer` writes, or none when its text cannot be read.
 */
function specifiersOf(ctx: RenderContext, importer: Importer): string[] {
  try {
    return specifiersIn(ctx.parse?.(importer.code) as AstNode)
  } catch {
    return []
  }
}

/**
 * Which of `specifiers`, as written in `importer`, resolve to `cxId`.
 */
async function specifiersOfCx(
  ctx: RenderContext,
  importer: Importer,
  specifiers: readonly string[],
  cxId: string,
): Promise<string[]> {
  const found: string[] = []
  for (const specifier of specifiers) {
    const resolved = await ctx.resolve?.(specifier, importer.id)
    if (resolved?.id === cxId) found.push(specifier)
  }
  return found
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
 * The line for `importer` when the collector did not read it as importing `cx`, or `undefined`
 * when it did: an escape in the specifier hides it from a search of the text, not from the reading.
 */
async function lineOf(
  ctx: RenderContext,
  context: UsedContext,
  importer: Importer,
  cxId: string,
): Promise<string | undefined> {
  const written = specifiersOf(ctx, importer)
  if (written.includes(CX_SOURCE)) return undefined
  const specifiers = await specifiersOfCx(ctx, importer, written, cxId)
  return lineFor(moduleLabel(context.root, importer.id), specifiers)
}

/**
 * Fails the build when a module imports Nave's `cx` through a specifier the collector did not
 * read, since every call it makes would ship with no rule.
 */
export async function checkCxImporters(ctx: RenderContext, context: UsedContext): Promise<void> {
  const resolved = await ctx.resolve?.(CX_SOURCE, path.join(context.root, 'index.html'))
  if (!resolved) return
  const lines: string[] = []
  for (const id of importerIdsOf(ctx, resolved.id)) {
    const importer = await candidateOf(ctx, context, id)
    const line = importer && (await lineOf(ctx, context, importer, resolved.id))
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
