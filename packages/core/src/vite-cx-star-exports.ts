/**
 * What a star re-export exports, to tell whether two stars of one module export the same binding of
 * Nave's `cx` under a name: if they do not, ES exports the name from neither.
 */
import type { AstNode } from './vite-ast.ts'
import type { RenderContext } from './vite-types.ts'

import { fileOf } from './vite-cx-modules.ts'
import { ownExports, starSources } from './vite-cx-reexported.ts'

/**
 * The file each specifier resolves to from each importer, asked once: a barrel's specifiers are
 * resolved once however many modules of it give `cx` out.
 */
export type Resolutions = Map<string, Promise<string | undefined>>

/**
 * The file `specifier` resolves to from the importer `id`.
 */
export function resolvedFile(
  ctx: RenderContext,
  resolutions: Resolutions,
  input: { readonly id: string; readonly specifier: string },
): Promise<string | undefined> {
  const key = `${input.id}\0${input.specifier}`
  const known = resolutions.get(key)
  if (known) return known
  const asked = (async (): Promise<string | undefined> => {
    try {
      const resolved = await ctx.resolve?.(input.specifier, input.id)
      return resolved ? fileOf(resolved.id) : undefined
    } catch {
      return undefined
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
  ctx: RenderContext,
  input: { file: string; seen: Set<string> },
): AstNode | undefined {
  const { file, seen } = input
  const code = ctx.getModuleInfo?.(file)?.code
  const isUnread = !seen.has(file) && typeof code === 'string'
  seen.add(file)
  return isUnread ? (ctx.parse?.(code) as AstNode | undefined) : undefined
}

/**
 * Adds to `found` what the stars of the module `program` of `file` export.
 */
async function addStars(
  ctx: RenderContext,
  input: { file: string; found: ExportedNames; program: AstNode; walk: Walk },
): Promise<void> {
  const { found, file, program, walk } = input
  for (const specifier of starSources(program)) {
    const star = await resolvedFile(ctx, walk.resolutions, { id: file, specifier })
    const below = star ? await exportsOf(ctx, { file: star, walk }) : undefined
    const names = below ? [...below.names] : []
    for (const name of names) {
      found.names.add(name)
      if (below?.cx.has(name)) found.cx.add(name)
    }
  }
}

/**
 * The names the module `file` exports, other than the default, through its own exports and its
 * stars, and which of them are `cx` exports.
 */
async function exportsOf(
  ctx: RenderContext,
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
  ctx: RenderContext,
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
    const file = await resolvedFile(ctx, resolutions, { id, specifier })
    const walk = { cxExports, resolutions, seen: new Set<string>() }
    const exported = file ? await exportsOf(ctx, { file, walk }) : undefined
    const names = exported ? [...exported.names] : []
    const own = names.filter((text) => !exported?.cx.has(text))
    for (const name of own) rivals.add(name)
  }
  return rivals
}
