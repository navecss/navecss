/**
 * Bracket matching over a whole token stream, split out of
 * `block-reader.ts` to keep that file under the project's file-length lint.
 */
import type { Token } from './tokenizer.ts'

const OPENERS = new Set(['(-token', '[-token', 'function-token', '{-token'])
const CLOSERS = new Set([')-token', ']-token', '}-token'])

/**
Whether `closerType` is the mirror of `openerType` — the only pairing CSS Syntax 3 lets close a simple block: `)` for `(` or a function's own `(`, `]` for `[`, `}` for `{`.
 */
function isMirrorCloser(openerType: string, closerType: string): boolean {
  if (closerType === ')-token') return openerType === '(-token' || openerType === 'function-token'
  if (closerType === ']-token') return openerType === '[-token'
  return openerType === '{-token' // closerType === '}-token'
}

/**
 * Every opener token's own matching closer, found in one linear pass over
 * the WHOLE token stream rather than per item: an item's own natural end
 * (`scanItem`, `block-reader.ts`) needs to know where the first bracket it
 * opens eventually closes, and finding that by stepping through every token
 * in between makes an item that opens a `{}` re-walk its entire descendant
 * span, then have the item after that re-walk what is left of it, and so
 * on — quadratic in nesting depth. A single pass, using the same mirror
 * rule `scanItem` itself applies, gives every opener's own closer (or `-1`,
 * unmatched) up front; per-item scanning then jumps straight to it.
 * Bracket matching is purely a function of token ORDER, so this single
 * continuous stack finds the exact same pairs a fresh stack starting at
 * each item's own first token would — every item ends at depth 0 before
 * the next begins, so nothing carries an unmatched opener across that
 * boundary for the two to disagree about.
 */
export function matchBrackets(tokens: readonly Token[]): Int32Array {
  const closerFor = new Int32Array(tokens.length).fill(-1)
  const opens: number[] = []
  for (const [i, token] of tokens.entries()) {
    const { type } = token
    if (OPENERS.has(type)) {
      opens.push(i)
      continue
    }
    if (!CLOSERS.has(type)) continue
    const openIndex = opens.at(-1)
    if (openIndex === undefined || !isMirrorCloser(tokens[openIndex]!.type, type)) continue
    opens.pop()
    closerFor[openIndex] = i
  }
  return closerFor
}

/**
 * Whether `closerFor[openIndex]` names a real, in-range match: unmatched
 * (`-1`) and "matches something past `limit`" (cannot happen for a `limit`
 * this walk itself established, see `matchBrackets`'s own docblock, but
 * checked rather than assumed) are both treated the same way, as no match
 * at all within this scan.
 */
export function matchedCloseWithin(
  closerFor: Int32Array,
  openIndex: number,
  limit: number,
): number | undefined {
  const closeIndex = closerFor[openIndex]!
  return closeIndex !== -1 && closeIndex < limit ? closeIndex : undefined
}

export { CLOSERS, OPENERS }
