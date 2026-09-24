/**
 * A comma-separated pseudo/attribute selector KEY (e.g.
 * `':disabled, [aria-disabled="true"]'`) needs an explicit `&` on EVERY branch to compile
 * to a same-element compound match under CSS Nesting. Both nesting emitters in this package
 * (`scripts/build-css.ts`'s `renderNested`/`renderAtBlock`, `src/postcss.ts`'s
 * `buildPseudoRules`) used to prepend `&` to the WHOLE key string
 * (`` `&${pseudo}` ``), which lands the anchor only on the FIRST branch: per CSS Nesting
 * semantics, a branch with no explicit `&` and no leading combinator is an implicit
 * DESCENDANT selector, not a same-element compound match, so
 * `':disabled, [aria-disabled="true"]'` compiled to `&:disabled, [aria-disabled="true"]`,
 * which resolves to `.foo:disabled, .foo [aria-disabled="true"]` (note the space) rather
 * than `.foo:disabled, .foo[aria-disabled="true"]`.
 *
 * `disabledState`'s own key was fixed at the DATA level (embedding `&` in the string
 * itself) rather than here, scoped to that one atom per the review brief that found it. The
 * generator's blind spot for ANY comma-separated key is the general defect this module
 * closes, so a future atom with a plain (no embedded `&`) comma-separated pseudo key is
 * anchored correctly by construction rather than depending on its author remembering to
 * embed `&` by hand.
 *
 * The anchoring predicate is "does this branch already contain a `&` outside any quoted
 * string, anywhere in the branch", not "does it start with `&`" (fixed 2026-08-22). Per
 * CSS Nesting, a branch containing `&` ANYWHERE is already
 * relative to the parent and must be left untouched: `'.foo &'` is a complete, valid,
 * already-relative selector, and prepending `&` to it (`'&.foo &'`) demands the element
 * match `.foo` AND have a descendant matching the parent, which is not what the author
 * wrote. The check is quote- and escape-aware so a literal `&` inside an attribute value
 * (`[data-label="A & B"]`) is not mistaken for an anchor and left unanchored, which would
 * reproduce this same issue's original bug on that shape.
 */

type Quote = '"' | "'" | undefined

interface SplitState {
  branches: string[]
  depth: number
  quote: Quote
  isEscaped: boolean
  current: string
}

/**
 * The next quote state after consuming `char`, given the current one: closes on a matching
 * quote, opens on an unquoted `"`/`'`, otherwise unchanged. Split out purely to keep
 * `consumeSplitChar`'s own complexity within this package's lint budget.
 */
function nextQuote(quote: Quote, char: string): Quote {
  if (quote) return char === quote ? undefined : quote
  return char === '"' || char === "'" ? char : quote
}

/**
 * The change in bracket/paren depth `char` contributes, ignoring anything inside a quoted
 * string (a literal `(`/`[` inside `[data-x="(a"]` is not a nesting boundary).
 */
function depthDelta(quote: Quote, char: string): number {
  if (quote) return 0
  if (char === '(' || char === '[') return 1
  if (char === ')' || char === ']') return -1
  return 0
}

/**
 * Consumes one character of a top-level-comma split, tracking paren/bracket depth, quote
 * state and backslash-escaping so a comma inside `:is(a, b)` or `[data-x="a,b"]` is never
 * treated as a branch separator, and an escaped quote (`[data-x="a\"b"]`) never closes the
 * string early (this splitter's original failure mode, reachable again through this same
 * splitter until escape-awareness was added here). Split out of
 * `anchorSelectorList` purely to keep that function's own complexity within this package's
 * lint budget.
 */
function consumeSplitChar(state: SplitState, char: string): SplitState {
  const { branches, depth, quote, isEscaped, current } = state
  if (isEscaped) {
    return { branches, depth, quote, isEscaped: false, current: current + char }
  }
  if (char === '\\') {
    return { branches, depth, quote, isEscaped: true, current: current + char }
  }
  const nextDepth = depth + depthDelta(quote, char)
  if (!quote && char === ',' && nextDepth === 0) {
    return {
      branches: [...branches, current],
      depth: nextDepth,
      quote,
      isEscaped: false,
      current: '',
    }
  }
  return {
    branches,
    depth: nextDepth,
    quote: nextQuote(quote, char),
    isEscaped: false,
    current: current + char,
  }
}

/**
 * Splits `selectorList` on top-level commas only (ignoring commas inside parentheses,
 * brackets or quoted strings — `:is(a, b)`, `[data-x="a,b"]`).
 */
function splitTopLevel(selectorList: string): string[] {
  let state: SplitState = {
    branches: [],
    depth: 0,
    quote: undefined,
    isEscaped: false,
    current: '',
  }
  for (const char of selectorList) state = consumeSplitChar(state, char)
  return [...state.branches, state.current]
}

/**
 * True if `branch` contains a `&` (the CSS Nesting selector) outside any quoted string and
 * not itself escaped, i.e. an actual nesting-selector token rather than a literal `&`
 * character inside an attribute value. Quote- and escape-aware for the same reason
 * `consumeSplitChar` is: a naive `includes('&')` would misread `[data-label="A & B"]` as
 * already anchored and leave it untouched.
 */
function hasUnquotedAmpersand(branch: string): boolean {
  let quote: Quote
  let isEscaped = false
  for (const char of branch) {
    if (isEscaped) {
      isEscaped = false
      continue
    }
    if (char === '\\') {
      isEscaped = true
      continue
    }
    if (!quote && char === '&') return true
    quote = nextQuote(quote, char)
  }
  return false
}

/**
 * Splits `selectorList` on top-level commas and prepends `&` to every branch that does not
 * already contain one outside a quoted string. A branch already containing `&` anywhere
 * (the `disabledState`-style embedded anchor, or an author-written relative branch like
 * `.foo &`) is left untouched, so this is safe to run over a key an author already anchored
 * by hand. An empty branch (a stray or trailing comma) is an author error, not a silently
 * compiled bare `&`: it throws naming the offending key.
 */
export function anchorSelectorList(selectorList: string): string {
  return splitTopLevel(selectorList)
    .map((branch) => {
      const trimmed = branch.trim()
      if (trimmed === '') {
        throw new Error(
          `anchorSelectorList: empty selector branch in pseudo key "${selectorList}". ` +
            'Remove the stray or trailing comma: an empty branch would otherwise compile ' +
            'to a bare "&", matching the atom unconditionally.',
        )
      }
      return hasUnquotedAmpersand(trimmed) ? trimmed : `&${trimmed}`
    })
    .join(', ')
}
