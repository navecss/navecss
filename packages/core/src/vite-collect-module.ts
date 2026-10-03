/**
 * One module through the post-order half: parse it, read it, place what it found in the authored
 * file, and record it for the environment that transformed it.
 */
import type { AstNode } from './vite-ast.ts'
import type { ModuleReading } from './vite-collect.ts'
import type { Problem } from './vite-problems.ts'
import type { ModuleRecord, Position } from './vite-state.ts'
import type { TransformContext } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { CX_SOURCE, readModule } from './vite-collect.ts'
import { isDependencyId, packageNameOf, relativeToRoot } from './vite-module-kind.ts'
import { setupExposuresFor } from './vite-setup-link.ts'
import { authoredPlace, combinedMapOf } from './vite-source-map.ts'
import { moduleKey } from './vite-state.ts'
import { ownAtomNames } from './vite-used.ts'

/**
 * Whether the text could name an atom at all: it imports from `cx`, it holds `nave-`, or it is a
 * Vue template reading its component's bindings off `$setup`.
 */
export function isMentioningAtoms(code: string): boolean {
  return (
    code.includes(CX_SOURCE) ||
    code.includes('nave-') ||
    code.includes('$setup') ||
    code.includes('vue&type=')
  )
}

/**
 * Whether the package is listed in `keepFor`, which stands in for reading its calls.
 */
function isListed(context: UsedContext, pkg: string | undefined): boolean {
  return pkg !== undefined && Object.hasOwn(context.options.keepFor, pkg)
}

interface Placing {
  readonly code: string
  readonly file: string
  readonly pkg: string | undefined
  readonly place: (offset: number) => { column: number; line: number }
}

/**
 * The problems of a reading, placed in the authored file.
 */
function locate(problems: readonly Problem[], placing: Placing): LocatedProblem[] {
  return problems.map((problem) => ({
    ...problem,
    file: placing.file,
    pkg: placing.pkg,
    ...placing.place(problem.offset),
  }))
}

/**
 * The calls of `cx.dynamic()`, placed and quoted.
 */
function locateDynamic(reading: ModuleReading, placing: Placing): Position[] {
  return reading.dynamicCalls.map(({ offset, construct }) => ({
    file: placing.file,
    construct,
    ...placing.place(offset),
  }))
}

/**
 * The parse of `code`, or `undefined` for a module the host cannot parse.
 */
function parseOrUndefined(ctx: TransformContext, code: string): AstNode | undefined {
  try {
    return ctx.parse(code) as AstNode
  } catch {
    return undefined
  }
}

/**
 * What a module found, placed in the authored file and ready to keep.
 */
function recordOf(
  context: UsedContext,
  ctx: TransformContext,
  input: { readonly code: string; readonly id: string; readonly pkg: string | undefined },
  reading: ModuleReading,
): ModuleRecord {
  const { code, id, pkg } = input
  const hasPlaces = reading.problems.length + reading.dynamicCalls.length > 0
  const map = hasPlaces ? combinedMapOf(ctx) : undefined
  const placing: Placing = {
    code,
    file: relativeToRoot(context.root, id),
    pkg,
    place: (offset) => authoredPlace(code, offset, map),
  }
  const isStandingIn = isListed(context, pkg)
  return {
    atoms: new Set([...reading.atoms, ...reading.classes]),
    problems: isStandingIn ? [] : locate(reading.problems, placing),
    suppressed: isStandingIn ? locate(reading.problems, placing) : [],
    dynamicCalls: locateDynamic(reading, placing),
    pkg,
    file: placing.file,
  }
}

/**
 * Reads the module `code` (id `id`) as the environment `environment` transformed it, and records
 * what it found. Returns the record, or `undefined` when the module could not be parsed.
 */
export async function recordModule(
  context: UsedContext,
  ctx: TransformContext,
  code: string,
  id: string,
): Promise<ModuleRecord | undefined> {
  const key = moduleKey(ctx.environment?.name ?? 'client', id)
  const program = isMentioningAtoms(code) ? parseOrUndefined(ctx, code) : undefined
  if (!program) {
    // A module that no longer mentions atoms, or no longer parses, leaves nothing of its last read.
    context.state.modules.delete(key)
    return undefined
  }
  const isDependency = isDependencyId(id)
  const file = id.split('?', 1)[0]!
  const pkg = isDependency ? await packageNameOf(file, context.packageNames) : undefined
  const reading = readModule(code, program, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: await ownAtomNames(context),
    isDependency,
    isVueScript: /\.vue(?:$|\?)/.test(id),
    setup: await setupExposuresFor(context, ctx, { program, code, id }),
  })
  if (reading.exposes.size > 0) context.state.exposures.set(key, reading.exposes)
  const record = recordOf(context, ctx, { code, id, pkg }, reading)
  if (pkg !== undefined && reading.usesCx) context.state.packages.add(pkg)
  context.state.modules.set(key, record)
  return record
}
