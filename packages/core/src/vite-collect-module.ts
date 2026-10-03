/**
 * One module through the post-order half: parse it, read it, place what it found in the authored
 * file, and record it for the environment that transformed it.
 */
import type { AstNode } from './vite-ast.ts'
import type { ModuleReading, ReadOptions } from './vite-collect.ts'
import type { Problem } from './vite-problems.ts'
import type { ModuleRecord, Position } from './vite-state.ts'
import type { TransformContext } from './vite-types.ts'
import type { LocatedProblem } from './vite-used-report.ts'
import type { UsedContext } from './vite-used.ts'

import { CX_SOURCE, readModule } from './vite-collect.ts'
import { filePathOf } from './vite-css-id.ts'
import { isDependencyId, moduleLabel, packageNameOf } from './vite-module-kind.ts'
import { setupExposuresFor } from './vite-setup-link.ts'
import { combinedMapOf, placerFor } from './vite-source-map.ts'
import { moduleKey } from './vite-state.ts'
import { ownAtomNames } from './vite-used.ts'

/**
 * An import or export-from whose specifier is written with an escape: `'@navecss\u002Fcore/cx'`
 * is the specifier `@navecss/core/cx`, which a search of the text for it cannot find. (Each
 * character class excludes the backslash and the quote, so the match is one pass.)
 */
const ESCAPED_SPECIFIER = /(?:\bfrom|\bimport)[\s(]*(?:'[^'\\\n]*\\|"[^"\\\n]*\\|`[^`\\\n]*\\)/

/**
 * Whether the text could name an atom at all: it imports from `cx` (as written, or with an escape
 * in the specifier), it holds `nave-`, or it is a Vue template reading its component's bindings
 * off `$setup`.
 */
export function isMentioningAtoms(code: string): boolean {
  return (
    code.includes(CX_SOURCE) ||
    code.includes('nave-') ||
    code.includes('$setup') ||
    code.includes('vue&type=') ||
    ESCAPED_SPECIFIER.test(code)
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
    file: moduleLabel(context.root, id),
    pkg,
    place: placerFor(code, map),
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

const NOT_PARSED =
  "the module could not be read, so the atoms it names would not ship: it did not parse as JavaScript. TypeScript and JSX must be compiled by Vite's own transform first, so leave oxc on for this file."
const TOO_DEEP =
  'the module could not be read, so the atoms it names would not ship: it is nested too deeply.'

/**
 * The record of a module the build could not read: one problem, at its first character.
 */
function unreadableRecord(
  context: UsedContext,
  input: { readonly id: string; readonly pkg: string | undefined },
  text: string,
): ModuleRecord {
  const { id, pkg } = input
  const file = moduleLabel(context.root, id)
  const problem: LocatedProblem = {
    kind: 'unreadable',
    offset: 0,
    construct: '',
    text,
    file,
    pkg,
    line: 1,
    column: 1,
  }
  const isStandingIn = isListed(context, pkg)
  return {
    atoms: new Set(),
    problems: isStandingIn ? [] : [problem],
    suppressed: isStandingIn ? [problem] : [],
    dynamicCalls: [],
    pkg,
    file,
  }
}

/**
 * The reading of a parsed module, or `undefined` when its nesting is deeper than the reader's
 * own stack allows.
 */
function readOrUndefined(
  code: string,
  program: AstNode,
  options: ReadOptions,
): ModuleReading | undefined {
  try {
    return readModule(code, program, options)
  } catch (error) {
    if (error instanceof RangeError) return undefined
    throw error
  }
}

interface Parsed {
  readonly code: string
  readonly id: string
  readonly pkg: string | undefined
  readonly program: AstNode
}

/**
 * Reads a parsed module and records what it found, remembering what a component script exposed.
 */
async function recordParsed(
  context: UsedContext,
  ctx: TransformContext,
  input: Parsed,
  key: string,
): Promise<ModuleRecord> {
  const { code, id, pkg, program } = input
  const reading = readOrUndefined(code, program, {
    cxSources: new Set([CX_SOURCE]),
    ownAtoms: await ownAtomNames(context, (file) => {
      ctx.addWatchFile(file)
    }),
    isDependency: isDependencyId(id),
    isVueScript: /\.vue(?:$|\?)/.test(id),
    setup: await setupExposuresFor(context, ctx, { program, code, id }),
  })
  if (!reading) {
    context.state.exposures.delete(key)
    return unreadableRecord(context, { id, pkg }, TOO_DEEP)
  }
  // What a script exposed before an edit is not what it exposes now.
  if (reading.exposes.size > 0) context.state.exposures.set(key, reading.exposes)
  else context.state.exposures.delete(key)
  if (pkg !== undefined && reading.usesCx) context.state.packages.add(pkg)
  return recordOf(context, ctx, { code, id, pkg }, reading)
}

/**
 * Reads the module `code` (id `id`) as the environment `environment` transformed it, and records
 * what it found. Returns the record, or `undefined` when the module names no atom at all. A module
 * that does name one and cannot be parsed is recorded as a problem, never skipped: its calls would
 * ship with no rule and nothing would say so.
 */
export async function recordModule(
  context: UsedContext,
  ctx: TransformContext,
  code: string,
  id: string,
): Promise<ModuleRecord | undefined> {
  const key = moduleKey(ctx.environment?.name ?? 'client', id)
  if (!isMentioningAtoms(code)) {
    // A module that no longer mentions atoms leaves nothing of its last read.
    context.state.modules.delete(key)
    return undefined
  }
  const isDependency = isDependencyId(id)
  const pkg = isDependency ? await packageNameOf(filePathOf(id), context.packageNames) : undefined
  const program = parseOrUndefined(ctx, code)
  const record = program
    ? await recordParsed(context, ctx, { code, id, pkg, program }, key)
    : unreadableRecord(context, { id, pkg }, NOT_PARSED)
  if (!program) context.state.exposures.delete(key)
  context.state.modules.set(key, record)
  return record
}
