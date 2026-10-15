/**
 * Pieces of the graph reader that stand alone: the language a file is parsed as, the sentences of
 * the problems it records, and the tests of what is worth reading.
 */
import type { LocatedProblem, Problem } from '@navecss/core/collect'

import { CX_SOURCE } from '@navecss/core/collect'
import path from 'node:path'

import type { Edge } from './edges.ts'
import type { Place } from './lines.ts'

const UNPARSED_TEXT =
  'the module could not be read, so the atoms it names would not ship: it did not parse as JavaScript or TypeScript.'
const UNRESOLVED_TEXT =
  'the build cannot resolve this import, so it cannot read the cx() calls behind it'

const CORE_PACKAGE = '@navecss/core'

const ESCAPED_SPECIFIER = /(?:\bfrom|\bimport)[\s(]*(?:'[^'\\\n]*\\|"[^"\\\n]*\\|`[^`\\\n]*\\)/

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
 * Whether a specifier names `@navecss/core` itself, whose own files the graph does not read: its
 * `cx` is the binding the reader looks for, not a use of it.
 */
export function isNaveCore(specifier: string): boolean {
  return specifier === CORE_PACKAGE || specifier.startsWith(`${CORE_PACKAGE}/`)
}

/**
 * Whether the module could name an atom at all, so reading it is worth doing.
 */
export function isMentioningAtoms(
  code: string,
  declared: ReadonlySet<string>,
  isDeclared: boolean,
): boolean {
  return (
    declared.size > 0 ||
    isDeclared ||
    code.includes(CX_SOURCE) ||
    code.includes('nave-') ||
    ESCAPED_SPECIFIER.test(code)
  )
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
 * The problem for a file that did not parse, at its first character.
 */
export function unparsedProblem(rel: string, pkg: string | undefined): LocatedProblem {
  return {
    kind: 'unreadable',
    offset: 0,
    construct: '',
    text: UNPARSED_TEXT,
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
