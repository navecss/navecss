/**
 * Name computation for the reader: a token's dotted path to the kebab-case name the emitter
 * prefixes with `--nave-`. Pins the `name/kebab` transform this package's build used to
 * inherit from a third-party tool, verified empirically against the shipped build across every
 * existing token path, including the three camelCase segments and the numeric/mixed ones.
 *
 * Split out of `reader.ts` on its own when that file passed this repo's per-file line budget.
 * It is the one part of the reader with no opinion about the format at all: it reads path
 * segments and writes a string, and nothing here knows what a `$value` is.
 */

const SPLIT_LOWER_UPPER_RE = /([\p{Ll}\d])(\p{Lu})/gu
const SPLIT_UPPER_UPPER_RE = /(\p{Lu})([\p{Lu}][\p{Ll}])/gu
const STRIP_RE = /[^\p{L}\d]+/gu

/**
 * Splits a joined path into words on lower/upper and upper/upper-lower boundaries, then
 * strips remaining non-letter-non-digit runs, mirroring a `noCase` split.
 */
function splitWords(value: string): string[] {
  let result = value.trim()
  result = result
    .replaceAll(SPLIT_LOWER_UPPER_RE, '$1\0$2')
    .replaceAll(SPLIT_UPPER_UPPER_RE, '$1\0$2')
  result = result.replaceAll(STRIP_RE, '\0')
  let start = 0
  let end = result.length
  while (result.charAt(start) === '\0') start++
  if (start === end) return []
  while (result.charAt(end - 1) === '\0') end--
  return result.slice(start, end).split('\0')
}

/**
 * Joins the path with spaces, splits on lower/upper and upper/upper-lower boundaries,
 * strips remaining non-letter-non-digit runs, lowercases each word, joins with `-`.
 */
export function kebabName(path: readonly string[]): string {
  return splitWords(path.join(' '))
    .map((w) => w.toLowerCase())
    .join('-')
}

/**
 * R32 reads "the `--nave-` prefix is applied by the EMITTER, never by
 * nesting the source under a `nave` group" — a NAME-COMPUTATION invariance, not a document
 * rule. Unwrapping a sole top-level `nave` group out of the TREE before parsing (the prior
 * approach) moved the path space an alias resolves against and still doubled the prefix for
 * a non-sole `nave` (AC-32's Given has no "sole" qualifier). Fixed at the NAME only: the tree
 * is walked exactly as authored (an alias resolves against the path the consumer wrote), and
 * a leading `nave` segment is dropped only when computing the emitted name, for every token.
 */
export function nameFromPath(path: readonly string[]): string {
  const namePath = path.length > 1 && path[0] === 'nave' ? path.slice(1) : path
  return kebabName(namePath)
}
