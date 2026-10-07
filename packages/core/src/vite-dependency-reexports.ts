/**
 * What a consumer can write in `cxModules` to clear a dependency's re-export of `cx`: a specifier
 * that resolves, from the project root, to the file that holds it. The package's name when its
 * entry is that file, else a package subpath through which a module outside the package imports
 * it. A file only the package itself imports has none, and its problem is cleared by the
 * package's `keepFor` line instead: a deep path to it is not the package's public surface, and an
 * `exports` map may forbid it.
 */
import path from 'node:path'

import type { RenderContext } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { filePathOf } from './vite-css-id.ts'
import { specifiersOf } from './vite-cx-importers.ts'
import { declaredModulesFor, entriesNaming, fileOf } from './vite-cx-modules.ts'
import { isDependencyId, packageNameOf } from './vite-module-kind.ts'
import { compareText } from './vite-problems.ts'
import { isListableReexport } from './vite-used-package-lines.ts'

interface Resolution {
  readonly file: string
  readonly from: string
  readonly specifier: string
}

/**
 * Whether the specifier, written in `from`, resolves to `file`.
 */
export async function isResolvingTo(ctx: RenderContext, input: Resolution): Promise<boolean> {
  try {
    const resolved = await ctx.resolve?.(input.specifier, input.from)
    return resolved !== null && resolved !== undefined && fileOf(resolved.id) === input.file
  } catch {
    return false
  }
}

/**
 * The ids of the modules that import the module `id`, statically or dynamically.
 */
function importersOf(ctx: RenderContext, id: string): string[] {
  const info = ctx.getModuleInfo?.(id)
  return [...new Set([...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])])]
}

/**
 * The subpaths of `pkg` that the module `importer`, written outside it, uses to import `file`.
 */
async function subpathsWritten(
  ctx: RenderContext,
  input: { readonly file: string; readonly importer: string; readonly pkg: string },
): Promise<string[]> {
  const { file, importer, pkg } = input
  const code = ctx.getModuleInfo?.(importer)?.code
  if (code === null || code === undefined) return []
  const written = specifiersOf(ctx, { id: importer, code }) ?? []
  const found: string[] = []
  const subpaths = written.filter((text) => text.startsWith(`${pkg}/`))
  for (const specifier of subpaths) {
    if (await isResolvingTo(ctx, { file, from: importer, specifier })) found.push(specifier)
  }
  return found
}

/**
 * The package subpaths through which a module outside `pkg` imports the module `id`, in
 * code-unit order.
 */
async function subpathsInto(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly id: string; readonly pkg: string },
): Promise<string[]> {
  const found = new Set<string>()
  for (const importer of importersOf(ctx, input.id)) {
    const owner = isDependencyId(importer)
      ? await packageNameOf(filePathOf(importer), context.packageNames)
      : undefined
    if (owner === input.pkg) continue
    const written = await subpathsWritten(ctx, { file: fileOf(input.id), importer, pkg: input.pkg })
    for (const specifier of written) found.add(specifier)
  }
  return found.values().toArray().toSorted(compareText)
}

/**
 * The specifier that clears a re-export of `cx` held by the module `id` of `pkg`, or `undefined`.
 */
async function clearingSpecifier(
  ctx: RenderContext,
  context: UsedContext,
  input: { readonly id: string; readonly pkg: string },
): Promise<string | undefined> {
  const from = path.join(context.root, 'index.html')
  const file = fileOf(input.id)
  if (await isResolvingTo(ctx, { file, from, specifier: input.pkg })) return input.pkg
  const subpaths = await subpathsInto(ctx, context, input)
  for (const specifier of subpaths) {
    if (await isResolvingTo(ctx, { file, from, specifier })) return specifier
  }
  return undefined
}

/**
 * The problems with each dependency re-export of `cx` given the specifier that clears it, when it
 * has one (the report prints a `cxModules` line for those and the package's `keepFor` line for the
 * others), and each dependency's listed module that exports a `cx` the build does not follow given
 * the entries that name it, which the report tells the consumer to remove.
 */
export async function withClearingSpecifiers(
  ctx: RenderContext,
  context: UsedContext,
  problems: readonly LocatedProblem[],
): Promise<LocatedProblem[]> {
  const asked = new Map<string, Promise<string | undefined>>()
  const clearing = (pkg: string, id: string): Promise<string | undefined> => {
    const known = asked.get(id)
    if (known) return known
    const answer = clearingSpecifier(ctx, context, { id, pkg })
    asked.set(id, answer)
    return answer
  }
  const entriesOf = async (id: string): Promise<string[]> => {
    const declared = await declaredModulesFor(context, ctx, ctx.environment.name)
    return declared ? entriesNaming(declared, id) : []
  }
  return await Promise.all(
    problems.map(async (problem) => {
      const { moduleId, pkg } = problem
      if (pkg === undefined || moduleId === undefined) return problem
      if (problem.kind === 'declared') return { ...problem, entries: await entriesOf(moduleId) }
      if (!isListableReexport(problem)) return problem
      const specifier = await clearing(pkg, moduleId)
      return specifier === undefined ? problem : { ...problem, specifier }
    }),
  )
}
