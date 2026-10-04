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
}

/**
 * Orders two strings by code unit, the order a report sorts package names and paths in.
 */
export function compareText(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * The first `limit` characters of `text`, then `...` when it was longer.
 */
export function cut(text: string, limit = 40): string {
  const oneLine = text.replaceAll(/\s+/g, ' ')
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}...` : oneLine
}
