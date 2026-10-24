/**
 * Pieces of the graph reader that stand alone: the language a file is parsed as and the sentences
 * of the problems it records.
 */
import type { LocatedProblem, Problem } from '@navecss/core/collect'

import path from 'node:path'

import type { Edge } from './edges.ts'
import type { Graph } from './graph-types.ts'
import type { Place } from './lines.ts'

import { emptyInputs } from './resolution-inputs.ts'

const UNREAD_TEXT = 'the module could not be read, so the atoms it names would not ship: '
const UNPARSED_REASON = 'it did not parse as JavaScript or TypeScript.'
export const UNRESOLVED_TEXT =
  'the build cannot resolve this import, so it cannot read the cx() calls behind it'
// The sentences the Vite plugin's build-end check gives a module that reaches cx this way.
const UNBOUND_CX_TEXT =
  "imports cx through a specifier the build does not follow, so the atoms its calls name would not ship. Import cx from '@navecss/core/cx' directly where it is called."

/**
 * The language `oxc-parser` reads the file as.
 */
export function languageOf(file: string): 'js' | 'jsx' | 'ts' | 'tsx' {
  const extension = path.extname(file)
  if (extension === '.tsx') return 'tsx'
  if (['.cts', '.mts', '.ts'].includes(extension)) return 'ts'
  return 'jsx'
}

/**
 * The text and place of the problem for a specifier no resolver could resolve.
 */
export function unresolvedProblem(
  code: string,
  edge: Edge,
  place: Place,
): Pick<Problem, 'construct' | 'text'> & Place {
  const quote = code[edge.offset] ?? "'"
  return { construct: `${quote}${edge.specifier}${quote}`, text: UNRESOLVED_TEXT, ...place }
}

/**
 * The text and place of the problem for an import that reaches core's `cx` module in a form the
 * reader does not bind: a `require()`, an `import x = require()`, or a specifier other than the
 * package's own.
 */
export function unboundCxProblem(
  code: string,
  edge: Edge,
  place: Place,
): Pick<Problem, 'construct' | 'kind' | 'offset' | 'text'> & Place {
  const quote = code[edge.offset] ?? "'"
  return {
    kind: 'reference',
    offset: edge.offset,
    construct: `${quote}${edge.specifier}${quote}`,
    text: UNBOUND_CX_TEXT,
    ...place,
  }
}

/**
 * The problem for a config the build cannot read, at the config's first character: the imports
 * that depend on it cannot be told apart from the ones that are missing.
 */
export function configProblem(rel: string, reason: string): LocatedProblem {
  return {
    kind: 'unreadable',
    offset: 0,
    construct: '',
    text: `the build cannot read this config, so it does not know where its paths and baseUrl send an import: ${reason}.`,
    file: rel,
    pkg: undefined,
    line: 1,
    column: 1,
  }
}

/**
 * The atoms that make a `cx.dynamic()` call apply a class where it stands: `keep` in the
 * application, the package's `keepFor` list in a dependency.
 */
export function listedAtomsFor(
  options: {
    readonly keep: readonly string[]
    readonly keepFor: Readonly<Record<string, readonly string[]>>
  },
  pkg: string | undefined,
): readonly string[] {
  if (pkg === undefined) return options.keep
  return Object.hasOwn(options.keepFor, pkg) ? options.keepFor[pkg]! : []
}

/**
 * The problem for a file that could not be read, at its first character: `reason` says why, and
 * is the parse failure's sentence when none is given.
 */
export function unreadProblem(
  rel: string,
  pkg: string | undefined,
  reason: string = UNPARSED_REASON,
): LocatedProblem {
  return {
    kind: 'unreadable',
    offset: 0,
    construct: '',
    text: `${UNREAD_TEXT}${reason}`,
    file: rel,
    pkg,
    line: 1,
    column: 1,
  }
}

/**
 * Whether a parse error is a syntax error that stops the file from being read, as opposed to a
 * warning the parser reports beside a tree it did build.
 */
export function isFatalParseError(error: { readonly severity: unknown }): boolean {
  return error.severity === 'Error'
}

/**
 * A graph with nothing read yet.
 */
export function emptyGraph(): Graph {
  return {
    atoms: new Set(),
    problems: [],
    files: new Map(),
    markdown: new Set(),
    directories: [],
    inputs: emptyInputs(),
    stylesheets: new Set(),
    unreadStylesheets: new Set(),
    edges: new Map(),
    dynamicFiles: new Set(),
    pagesDynamicPackages: new Set(),
  }
}
