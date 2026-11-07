/**
 * What a consumer can write in `cxModules` to clear a dependency's re-export of `cx`: a specifier
 * that resolves, from the project root, to the file that holds it, for a re-export under the name
 * `cx`. The package's name when its entry is that file, else a specifier through which a module
 * outside the package imports it: a package subpath, or an alias or a tsconfig path that names the
 * file. A file only the package itself imports has none, and neither has a re-export under another
 * name, as a default or inside a namespace, which a listed module may not hold: the package's
 * `keepFor` line clears each instead. A deep path to an internal file is not the package's public
 * surface, and an `exports` map may forbid it.
 */
import type { ModuleHost, TakesContext } from './vite-takes-host.ts'
import type { LocatedProblem } from './vite-used-report.ts'

import { declaredModulesFor, entriesNaming, fileOf } from './vite-cx-modules.ts'
import { isDependencyId } from './vite-module-id.ts'
import { rootEntryOf } from './vite-path-text.ts'
import { compareText } from './vite-problems.ts'
import { specifiersOf } from './vite-specifiers.ts'
import { resolvedIds } from './vite-takes-host.ts'
import { isListableReexport } from './vite-used-package-lines.ts'

interface Resolution {
  readonly file: string
  readonly from: string
  readonly specifier: string
}

/**
 * Whether the specifier, written in `from`, resolves to `file`.
 */
export async function isResolvingTo(ctx: ModuleHost, input: Resolution): Promise<boolean> {
  try {
    const resolved = await resolvedIds(ctx, input.specifier, input.from)
    return resolved.some((id) => fileOf(id) === input.file)
  } catch {
    return false
  }
}

/**
 * The ids of the modules that import the module `id`, statically or dynamically.
 */
export function importersOf(ctx: ModuleHost, id: string): string[] {
  const info = ctx.getModuleInfo?.(id)
  return [...new Set([...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])])]
}

/**
 * The specifiers the module `importer`, written outside the package, uses to import `file`.
 */
async function specifiersWritten(
  ctx: ModuleHost,
  input: { readonly file: string; readonly importer: string },
): Promise<string[]> {
  const { file, importer } = input
  const code = ctx.getModuleInfo?.(importer)?.code
  if (code === null || code === undefined) return []
  const written = specifiersOf(ctx, { id: importer, code }) ?? []
  const found: string[] = []
  for (const specifier of written) {
    if (await isResolvingTo(ctx, { file, from: importer, specifier })) found.push(specifier)
  }
  return found
}

/**
 * The specifiers through which a module outside `pkg` imports the module `id`, in code-unit order.
 */
async function specifiersInto(
  ctx: ModuleHost,
  context: TakesContext,
  input: { readonly id: string; readonly pkg: string },
): Promise<string[]> {
  const found = new Set<string>()
  for (const importer of importersOf(ctx, input.id)) {
    const owner = isDependencyId(importer) ? await context.packageOf(importer) : undefined
    if (owner === input.pkg) continue
    const written = await specifiersWritten(ctx, { file: fileOf(input.id), importer })
    for (const specifier of written) found.add(specifier)
  }
  return found.values().toArray().toSorted(compareText)
}

/**
 * The specifier that clears a re-export of `cx` held by the module `id` of `pkg`, or `undefined`.
 */
async function clearingSpecifier(
  ctx: ModuleHost,
  context: TakesContext,
  input: { readonly id: string; readonly pkg: string },
): Promise<string | undefined> {
  const from = rootEntryOf(context.root)
  const file = fileOf(input.id)
  if (await isResolvingTo(ctx, { file, from, specifier: input.pkg })) return input.pkg
  const specifiers = await specifiersInto(ctx, context, input)
  for (const specifier of specifiers) {
    if (await isResolvingTo(ctx, { file, from, specifier })) return specifier
  }
  return undefined
}

/**
 * The problems with each dependency re-export of `cx` given the specifier that clears it, when it
 * has one (the report prints a `cxModules` line for those and the package's `keepFor` line for the
 * others), and each dependency's listed module that exports a `cx` the build does not follow given
 * the entries that name it, which the report tells the consumer to remove. A module that gives
 * `cx` out under another name anywhere has no clearing specifier for any of its re-exports, since
 * listing the module would make it a problem of the listed kind instead.
 */
export async function withClearingSpecifiers(
  ctx: ModuleHost,
  context: TakesContext,
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
  const renamed = new Set(
    problems.flatMap((problem) =>
      problem.isRenamed === true && problem.moduleId !== undefined ? [problem.moduleId] : [],
    ),
  )
  return await Promise.all(
    problems.map(async (problem) => {
      const { moduleId, pkg } = problem
      if (pkg === undefined || moduleId === undefined) return problem
      if (problem.kind === 'declared') return { ...problem, entries: await entriesOf(moduleId) }
      if (!isListableReexport(problem)) return problem
      if (renamed.has(moduleId)) return { ...problem, isRenamed: true }
      const specifier = await clearing(pkg, moduleId)
      return specifier === undefined ? problem : { ...problem, specifier }
    }),
  )
}
