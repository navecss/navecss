/**
 * What a star re-export exports, to tell whether two stars of one module export the same binding of
 * Nave's `cx` under a name: if they do not, ES exports the name from neither.
 */
import type { AstNode } from './vite-ast.ts'
import type { ModuleHost } from './vite-takes-host.ts'

import { fileOf } from './vite-cx-modules.ts'
import { ownExports, starSources } from './vite-cx-reexported.ts'
import { parseOf, resolvedIds } from './vite-takes-host.ts'

/**
 * The files each specifier resolves to from each importer, asked once: a barrel's specifiers are
 * resolved once however many modules of it give `cx` out.
 */
export type Resolutions = Map<string, Promise<readonly string[]>>

/**
 * The files `specifier` resolves to from the importer `id`, none when it resolves to nothing.
 */
export function resolvedFiles(
  ctx: ModuleHost,
  resolutions: Resolutions,
  input: { readonly id: string; readonly specifier: string },
): Promise<readonly string[]> {
  const key = `${input.id}\0${input.specifier}`
  const known = resolutions.get(key)
  if (known) return known
  const asked = (async (): Promise<readonly string[]> => {
    try {
      const ids = await resolvedIds(ctx, input.specifier, input.id)
      return ids.map((id) => fileOf(id))
    } catch {
      return []
    }
  })()
  resolutions.set(key, asked)
  return asked
}

/**
 * The `cx` exports of each module that gives out `cx`, by file.
 */
export type CxExports = ReadonlyMap<string, ReadonlySet<string>>

interface ExportedNames {
  readonly names: Set<string>
  readonly cx: Set<string>
}

interface Walk {
  readonly cxExports: CxExports
  readonly resolutions: Resolutions
  /**
   * The files already read, which ends a cycle of stars.
   */
  readonly seen: Set<string>
}

/**
 * The names the module `program` of `file` exports itself, and which of them are `cx` exports.
 */
function ownNamesOf(program: AstNode, file: string, cxExports: CxExports): ExportedNames {
  const found: ExportedNames = { names: ownExports(program), cx: new Set() }
  for (const name of found.names) {
    if (cxExports.get(file)?.has(name)) found.cx.add(name)
  }
  return found
}

/**
 * The parse of the module `file`, unless it was read already or has no text.
 */
function unreadProgram(
  ctx: ModuleHost,
  input: { file: string; seen: Set<string> },
): AstNode | undefined {
  const { file, seen } = input
  const code = ctx.getModuleInfo?.(file)?.code
  const isUnread = !seen.has(file) && typeof code === 'string'
  seen.add(file)
  return isUnread ? (parseOf(ctx, code, file) as AstNode | undefined) : undefined
}

/**
 * Adds to `found` the names a star exports, the `cx` ones included.
 */
function addBelow(found: ExportedNames, below: ExportedNames): void {
  for (const name of below.names) {
    found.names.add(name)
    if (below.cx.has(name)) found.cx.add(name)
  }
}

/**
 * Adds to `rivals` the names a star exports with a binding that is not Nave's `cx`.
 */
function addRivals(rivals: Set<string>, exported: ExportedNames): void {
  for (const name of exported.names) {
    if (!exported.cx.has(name)) rivals.add(name)
  }
}

/**
 * Adds to `found` what the stars of the module `program` of `file` export.
 */
async function addStars(
  ctx: ModuleHost,
  input: { file: string; found: ExportedNames; program: AstNode; walk: Walk },
): Promise<void> {
  const { found, file, program, walk } = input
  for (const specifier of starSources(program)) {
    const stars = await resolvedFiles(ctx, walk.resolutions, { id: file, specifier })
    for (const star of stars) addBelow(found, await exportsOf(ctx, { file: star, walk }))
  }
}

/**
 * The names the module `file` exports, other than the default, through its own exports and its
 * stars, and which of them are `cx` exports.
 */
async function exportsOf(
  ctx: ModuleHost,
  input: { readonly file: string; readonly walk: Walk },
): Promise<ExportedNames> {
  const { file, walk } = input
  const program = unreadProgram(ctx, { file, seen: walk.seen })
  if (!program) return { names: new Set(), cx: new Set() }
  const found = ownNamesOf(program, file, walk.cxExports)
  await addStars(ctx, { found, file, program, walk })
  return found
}

/**
 * The names the stars of the module `program`, other than the ones that reach `reaches`, export
 * with a binding that is not Nave's `cx`: a name two stars export with different bindings is
 * exported by neither.
 */
export async function rivalsOf(
  ctx: ModuleHost,
  input: {
    readonly cxExports: CxExports
    readonly id: string
    readonly program: AstNode
    readonly reaches: ReadonlySet<string>
    readonly resolutions: Resolutions
  },
): Promise<Set<string>> {
  const { cxExports, id, program, reaches, resolutions } = input
  const rivals = new Set<string>()
  const others = starSources(program).filter((text) => !reaches.has(text))
  for (const specifier of others) {
    const walk = { cxExports, resolutions, seen: new Set<string>() }
    const files = await resolvedFiles(ctx, resolutions, { id, specifier })
    for (const file of files) addRivals(rivals, await exportsOf(ctx, { file, walk }))
  }
  return rivals
}
