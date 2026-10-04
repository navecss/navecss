/**
 * The build order failure. The client environment writes its CSS before a later environment (a
 * server render) has been read, and the plugin cannot reorder environments, so an atom a later
 * environment names that the CSS lacks is a build error naming the atom, the module and the ways
 * out: `keep`, or building the server environments first.
 */
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { compareText } from './vite-problems.ts'
import { recordsOf } from './vite-state.ts'

/**
 * Fails the build when this environment names an atom the CSS already written lacks.
 */
export function checkEnvironmentOrder(ctx: RenderContext, context: UsedContext): void {
  const { emitted } = context.state
  if (emitted === undefined) return
  const lines: string[] = []
  for (const record of recordsOf(context.state, ctx.environment.name)) {
    for (const atom of [...record.atoms].toSorted(compareText)) {
      if (!emitted.has(atom)) {
        lines.push(`${record.file}: names ${atom}, which the CSS already written does not hold.`)
      }
    }
  }
  if (lines.length === 0) return
  ctx.error(
    [
      `The build read atoms after it wrote the CSS, so their rules are missing from it:`,
      ...lines,
      'List the atoms in keep in navePlugin(), or build the server environments first with builder.buildApp in your Vite config.',
    ].join('\n'),
  )
}
