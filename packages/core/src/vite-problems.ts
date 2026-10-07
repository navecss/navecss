/**
 * One thing the collector could not read in a module, before it has a position or a path: what
 * it is, where it starts (an offset into the module as the post-order half saw it), the
 * construct as the plugin reads it, and the sentence that follows the construct in the report.
 */

/**
 * The kinds a report groups its remedy lines by; the order here is the order the lines print.
 */
export const PROBLEM_KINDS = [
  'argument',
  'reference',
  'reexport',
  'declared',
  'concatenation',
  'dynamic',
  'unknown',
  'own',
  'unreadable',
] as const

export type ProblemKind = (typeof PROBLEM_KINDS)[number]

export interface Problem {
  readonly kind: ProblemKind
  readonly offset: number
  /**
   * The construct, quoted as the plugin reads it, before it is cut for the report.
   */
  readonly construct: string
  /**
   * The sentence after the construct.
   */
  readonly text: string
  /**
   * For an unknown atom with no near candidate: the report closes with `Available:`.
   */
  readonly needsAvailable?: boolean
  /**
   * For a re-export: whether listing the module in `cxModules` would clear it, which it does not
   * when the module re-exports the `cx` of a module that is already listed (a second hop).
   */
  readonly isListable?: boolean
  /**
   * For a problem in a module listed in `cxModules`: whether the module also exports Nave's own
   * `cx`. An importer's `cx` is then Nave's, so what the build says of its calls is not an echo of
   * this problem and stays when the problem is reported.
   */
  readonly hasNaveCx?: boolean
}

/**
 * Orders two strings by code unit, the order a report sorts package names and paths in.
 */
export function compareText(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * The `cxModules` array a remedy prints: the entries already configured, as written and in their
 * order, then each module to add once, in code-unit order. `undefined` when there is nothing to
 * add, since an array equal to the configured list is no remedy.
 */
export function cxModulesArray(
  configured: readonly string[],
  added: Iterable<string>,
): string | undefined {
  const extra = [...new Set(added)]
    .filter((entry) => !configured.includes(entry))
    .toSorted(compareText)
  if (extra.length === 0) return undefined
  return `[${[...configured, ...extra].map((entry) => `'${entry}'`).join(', ')}]`
}

/**
 * The first `limit` characters of `text`, then `...` when it was longer.
 */
export function cut(text: string, limit = 40): string {
  const oneLine = text.replaceAll(/\s+/g, ' ')
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}...` : oneLine
}
