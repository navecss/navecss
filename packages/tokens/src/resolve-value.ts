/**
 * Resolving one parsed token's value: the format's two reference forms (a `$ref` JSON Pointer,
 * a whole-value `{a.b.c}` alias), transitive and cycle-checked, or a straight render to CSS for
 * anything else. Split out of `reader.ts` to keep that file under this repo's file-length lint.
 */
import type { RawToken } from './reader.ts'

import { renderTokenValue } from './composite-value.ts'
import { resolveTokenPointer } from './json-pointer.ts'

const REF_RE = /^\{([^{}]+)\}$/

export interface ResolveContext {
  byPath: ReadonlyMap<string, RawToken>
  resolved: Map<string, string | number>
  visiting: Set<string>
  depth: number
}

/**
 * A reverse-ordered alias chain (each link depending on the next, never on one already
 * resolved) costs one recursive frame per link with no cap of its own — cycle detection
 * catches a loop, never a merely very long chain — so an author-scale mistake or a generated
 * source can walk the call stack itself over, surfacing as a raw, unnamed
 * "Maximum call stack size exceeded" far from this reader. Comfortably above anything an
 * authored token tree would ever need (Nave's own longest chain is two links deep), and
 * comfortably below where a stack overflow becomes a real risk.
 */
const MAX_ALIAS_CHAIN_DEPTH = 1000

/**
 * Follows one reference (either form) to its target and resolves that, guarding the cycle at
 * the referring key rather than the referenced one, so the message names the node the author
 * wrote.
 */
function resolveReference(
  key: string,
  targetPath: string,
  context: ResolveContext,
): string | number {
  if (context.visiting.has(key)) {
    throw new TypeError(
      `DTCG 2025.10 reader: reference cycle detected at "${key}" -> "${targetPath}"`,
    )
  }
  const target = context.byPath.get(targetPath)
  if (!target) {
    throw new TypeError(
      `DTCG 2025.10 reader: "${key}" references unresolved target "${targetPath}"`,
    )
  }
  if (context.depth >= MAX_ALIAS_CHAIN_DEPTH) {
    throw new TypeError(
      `DTCG 2025.10 reader: "${key}" -> "${targetPath}" exceeds the maximum alias chain depth ` +
        `(${MAX_ALIAS_CHAIN_DEPTH}); this reads as a generated or malformed source rather than an ` +
        'authored one',
    )
  }
  context.visiting.add(key)
  context.depth += 1
  const value = resolveValue(target, context)
  context.depth -= 1
  context.visiting.delete(key)
  return value
}

/**
 * Refuses a raw string `$value` that would break out of the CSS it is spliced into: a
 * semicolon or comment opener splices a second declaration in beside it, exactly as an
 * embedded brace does for the format's own alias syntax used incorrectly. A no-op for a value
 * with neither.
 */
function refuseUnsafeStringValue(key: string, rawValue: string): void {
  if (rawValue.includes(';') || rawValue.includes('/*')) {
    throw new TypeError(
      `DTCG 2025.10 reader: "${key}" carries a ";" or a comment opener ("/*") in its value ` +
        `("${rawValue}") — a raw string value is spliced directly into generated CSS, and ` +
        'either would splice a second declaration in beside it',
    )
  }
  if (rawValue.includes('{') || rawValue.includes('}')) {
    throw new TypeError(
      `DTCG 2025.10 reader: "${key}" embeds a reference inside a larger string ("${rawValue}") — ` +
        'only a whole-value alias (curly braces around one dotted path, nothing else) is supported',
    )
  }
}

/**
 * Resolves one token's value: a `$ref` pointer or a whole-value `{a.b.c}` alias resolves
 * transitively (memoized in `resolved`, cycle-checked via `visiting`); anything else renders
 * straight to its CSS value.
 */
export function resolveValue(token: RawToken, context: ResolveContext): string | number {
  const key = token.path.join('.')
  const cached = context.resolved.get(key)
  if (cached !== undefined) return cached

  let value: string | number
  if (token.ref !== undefined) {
    const targetPath = resolveTokenPointer(token.ref, key, (path) => context.byPath.has(path))
    value = resolveReference(key, targetPath, context)
  } else if (typeof token.rawValue === 'string' && REF_RE.test(token.rawValue)) {
    value = resolveReference(key, REF_RE.exec(token.rawValue)![1]!, context)
  } else {
    if (typeof token.rawValue === 'string') refuseUnsafeStringValue(key, token.rawValue)
    value = renderTokenValue(token.type, token.rawValue, key)
  }

  context.resolved.set(key, value)
  return value
}
