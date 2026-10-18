/**
 * The build order failure. A stylesheet holding the atomic layer is written once, at the first
 * environment that writes one, and the plugin cannot reorder environments, so an atom a later
 * environment names that the CSS lacks is a build error naming the atom, the module and the ways
 * out. Which ways out depends on who wrote first. Where a client environment did (a plain Vite
 * build), the later environment is a server render and the way out is `keep`, or building the
 * server environments first. Where a server environment did (Astro writes its CSS in its server
 * build), the later environment is the browser's build, whose code no server environment reads, and
 * the ways out are `keep`, rendering that code on the server, and, for a dependency the server
 * build left external, a `noExternal` that reaches every environment.
 */
import type { ModuleRecord, RootState } from './vite-state.ts'
import type { RenderContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { compareText } from './vite-problems.ts'
import { recordsOf } from './vite-state.ts'
import { hasStylesheet } from './vite-writers.ts'

const MISSING = 'which the CSS already written does not hold.'

/**
 * The package a module path belongs to: the name after its last `node_modules/` segment, a scoped
 * name whole. `undefined` for a module that is not under `node_modules`.
 */
function packageOfPath(file: string): string | undefined {
  const marker = 'node_modules/'
  const at = file.lastIndexOf(marker)
  if (at === -1) return undefined
  const parts = file.slice(at + marker.length).split('/')
  return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/**
 * The line for each atom of `record` the CSS lacks, atoms in code-unit order.
 */
function missLines(record: ModuleRecord, emitted: ReadonlySet<string>): string[] {
  return [...record.atoms]
    .toSorted(compareText)
    .filter((atom) => !emitted.has(atom))
    .map((atom) => `${record.file}: names ${atom}, ${MISSING}`)
}

/**
 * Case (a): the way a client environment that wrote first reports a server render's atoms, in the
 * order the modules were read.
 */
function clientFirstMessage(lines: readonly string[]): string {
  return [
    'The build read atoms after it wrote the CSS, so their rules are missing from it:',
    ...lines,
    'List the atoms in keep in navePlugin(), or build the server environments first with builder.buildApp in your Vite config.',
  ].join('\n')
}

/**
 * Case (b): the way the build reports code only the browser runs when a server environment wrote
 * first. Lines are in code-unit order, whatever order the modules were read in, and a package
 * the server build left external gets a line of its own after the remedies.
 */
function serverFirstMessage(
  records: readonly ModuleRecord[],
  emitted: ReadonlySet<string>,
): string {
  const missing = records.filter((record) => missLines(record, emitted).length > 0)
  const packages = [
    ...new Set(
      missing.map((record) => packageOfPath(record.file)).filter((name) => name !== undefined),
    ),
  ].toSorted(compareText)
  return [
    'The build read atoms after it wrote the CSS, so their rules are missing from it:',
    ...missing.flatMap((record) => missLines(record, emitted)).toSorted(compareText),
    'A server build wrote the CSS, and only a build after it read these modules, such as code only the browser runs (an Astro client:only component, or a <script> in an .astro file).',
    'List the atoms in keep in navePlugin(), or have the server render that code too (a hydrated island rather than client:only).',
    ...packages.map(
      (name) =>
        `${name} is a dependency the server build left external: add it to resolve.noExternal in your Vite config (on Astro, under vite in astro.config) so the server build reads it.`,
    ),
  ].join('\n')
}

/**
 * The modules, by id, that an environment which wrote a stylesheet holding the layer read: their
 * atoms are in that environment's own set, so they are not code only the browser runs.
 */
function readByWriters(state: RootState): Set<string> {
  const read = new Set<string>()
  for (const key of state.modules.keys()) {
    const at = key.indexOf('\0')
    if (state.writers.has(key.slice(0, at))) read.add(key.slice(at + 1))
  }
  return read
}

/**
 * The records of the environment of `ctx` for modules that no environment which wrote a
 * stylesheet read.
 */
function lateRecords(ctx: RenderContext, state: RootState): ModuleRecord[] {
  const read = readByWriters(state)
  const prefix = `${ctx.environment.name}\0`
  return [...state.modules]
    .filter(([key]) => key.startsWith(prefix) && !read.has(key.slice(prefix.length)))
    .map(([, record]) => record)
}

/**
 * Fails the build when this environment names an atom the CSS already written lacks.
 */
export function checkEnvironmentOrder(ctx: RenderContext, context: UsedContext): void {
  const { state } = context
  const { emitted } = state
  if (emitted === undefined) return
  if (state.firstWriter === 'server') {
    // An environment that writes its own stylesheet filters it with what it read, so what it
    // names is never missing from it.
    if (state.writers.has(ctx.environment.name) || hasStylesheet(state, ctx.environment.name))
      return
    const late = lateRecords(ctx, state)
    if (late.some((record) => missLines(record, emitted).length > 0))
      ctx.error(serverFirstMessage(late, emitted))
    return
  }
  const lines = recordsOf(state, ctx.environment.name).flatMap((record) =>
    missLines(record, emitted),
  )
  if (lines.length > 0) ctx.error(clientFirstMessage(lines))
}
