/**
 * A second, independent walk of a parsed DTCG token tree, collecting every `$description`
 * string keyed by its dotted path (a node's own metadata; `$`-prefixed keys are never
 * descended into as groups, mirroring `reader.ts`'s `collectRawTokens` — including that
 * function's throw on a non-object node reached mid-walk, below). Split out of `reader.ts` on
 * its own file rather than folded in: this walk is unrelated to that file's job (parse,
 * resolve, name-compute a value), and reader.ts sits at this package's max-lines budget.
 *
 * Canonical home for this walk: it previously
 * lived only inside `copy-lint.test.ts`, exercised as a STATIC check against the shipped
 * `tokens.json`, never as an input `theming/copy-lint.ts`'s `lintDescriptions` actually
 * received at build time. Exported here so `theming/build-step.ts`'s runtime guard and the
 * test read the same walk rather than two copies that could drift apart.
 */

import { readFileSync } from 'node:fs'

type TokenTree = Record<string, unknown>

/**
 * Whether `value` is a non-array object node, as opposed to a primitive DTCG source has no
 * other shape for (mirrors `reader.ts`'s own predicate of the same name).
 */
function isPlainObject(value: unknown): value is TokenTree {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Every `$description` in one parsed DTCG tree, keyed by dotted path. `path_` and `out` are
 * the recursion's own accumulators; a caller passes the parsed source alone.
 *
 * Throws on a non-object node reached during the walk (the root included, an empty path
 * joining to `""`), exactly as `reader.ts`'s `collectRawTokens` does for the same reason: the
 * recursion never descends into a `$`-prefixed key, so every node it DOES reach is, by DTCG's
 * own shape, a group or token object — a primitive or array showing up there means the source
 * is malformed, not that this branch has nothing to contribute. A prior version returned an
 * empty/partial map instead, which this file's own docblock called mirroring `collectRawTokens`
 * while the two behaviours actually diverged; this closes that gap rather than leave the claim
 * false.
 */
export function collectDescriptions(
  source: unknown,
  path_: readonly string[] = [],
  out = new Map<string, string>(),
): ReadonlyMap<string, string> {
  if (!isPlainObject(source)) {
    throw new Error(
      `dtcg-descriptions: expected an object at "${path_.join('.')}", got ${JSON.stringify(source)}`,
    )
  }
  if (typeof source.$description === 'string') out.set(path_.join('.'), source.$description)
  for (const [key, child] of Object.entries(source)) {
    if (key.startsWith('$')) continue
    collectDescriptions(child, [...path_, key], out)
  }
  return out
}

/**
 * The same walk over DTCG source FILES, read fresh from disk — one map PER FILE, never merged.
 * Merging every file into a single `Map` before linting means
 * a later file's entry at a dotted path a colliding earlier file also used silently overwrites
 * the earlier one, and the earlier file's own violation, if it had one, vanishes with nothing
 * to catch it. `copy-lint.ts`'s `assertDescriptionsAreClean` already takes its maps as rest
 * params for exactly this reason: the walk stays per-file here, and the caller lints every map
 * it is given rather than one merged view of them.
 */
export function collectDescriptionsFromSources(
  sourcePaths: readonly string[],
): ReadonlyMap<string, string>[] {
  return sourcePaths.map((sourcePath) => {
    const parsed: unknown = JSON.parse(readFileSync(sourcePath, 'utf8'))
    return collectDescriptions(parsed)
  })
}
