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
 * itself) rather than here, scoped to that one atom. The
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
 * wrote. The check is quote-, escape- and comment-aware so a literal `&` inside an attribute
 * value (`[data-label="A & B"]`) or a comment is not mistaken for an anchor and left unanchored, which would
 * reproduce this same issue's original bug on that shape.
 */

type Quote = '"' | "'" | undefined

interface ScanState {
  quote: Quote
  isEscaped: boolean
  commentStart: number | undefined
}

/**
 * Whether `text[index]` closes the comment opened at `commentStart`: a `*` then `/`, where
 * the `*` is not the opener's own (`/*` followed directly by `/` does not close itself).
 */
function isCommentClose(text: string, index: number, commentStart: number): boolean {
  return text[index] === '/' && text[index - 1] === '*' && index - 1 >= commentStart + 2
}

/**
 * Advances `state` past `text[index]` when that character is literal text rather than
 * selector code: inside a comment, the character a backslash escapes, a backslash itself, or
 * inside a quoted string (where an escaped quote, `[data-x="a\"b"]`, must not close the
 * string early). False, with `state` untouched, for anything else.
 */
function isConsumedAsLiteral(state: ScanState, text: string, index: number): boolean {
  if (state.commentStart !== undefined) {
    if (isCommentClose(text, index, state.commentStart)) state.commentStart = undefined
    return true
  }
  if (state.isEscaped) {
    state.isEscaped = false
    return true
  }
  if (text[index] === '\\') {
    state.isEscaped = true
    return true
  }
  if (!state.quote) return false
  if (text[index] === state.quote) state.quote = undefined
  return true
}

/**
 * Advances `state` past `text[index]` and reports whether that character is selector CODE:
 * outside any quoted string and any CSS comment, and neither a backslash nor the character
 * it escapes. So a comma inside `[data-x="a,b"]` or `/* a, b *\/`, and a `&` inside
 * `[data-label="A & B"]` or `/* note & *\/`, are never read as selector syntax.
 */
function isCodeChar(state: ScanState, text: string, index: number): boolean {
  if (isConsumedAsLiteral(state, text, index)) return false
  const char = text[index]
  if (char === '"' || char === "'") {
    state.quote = char
    return false
  }
  if (char === '/' && text[index + 1] === '*') {
    state.commentStart = index
    return false
  }
  return true
}

/**
 * One flag per UTF-16 index of `text`: true where it holds selector code, false inside a
 * quoted string, a comment or an escape. The single scan both the top-level-comma split and
 * the anchor check read, so the two can never disagree about what is code.
 */
function codeMask(text: string): boolean[] {
  const state: ScanState = { quote: undefined, isEscaped: false, commentStart: undefined }
  return Array.from({ length: text.length }, (_, index) => isCodeChar(state, text, index))
}

/**
 * Splits `selectorList` on top-level commas only, ignoring commas inside parentheses,
 * brackets, quoted strings or comments (`:is(a, b)`, `[data-x="a,b"]`, `/* a, b *\/`).
 */
function splitTopLevel(selectorList: string): string[] {
  const mask = codeMask(selectorList)
  const branches: string[] = []
  let depth = 0
  let start = 0
  for (const [index, isCode] of mask.entries()) {
    if (!isCode) continue
    const char = selectorList[index]
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      branches.push(selectorList.slice(start, index))
      start = index + 1
    }
  }
  return [...branches, selectorList.slice(start)]
}

/**
 * True if `branch` contains a `&` (the CSS Nesting selector) as selector code, i.e. an actual
 * nesting-selector token rather than a literal `&` inside an attribute value or a comment. A
 * naive `includes('&')` would misread `[data-label="A & B"]` or `/* note & *\/:hover` as
 * already anchored and leave it an implicit descendant match.
 */
function hasNestingSelector(branch: string): boolean {
  return codeMask(branch).some((isCode, index) => isCode && branch[index] === '&')
}

/**
 * Splits `selectorList` on top-level commas and prepends `&` to every branch that does not
 * already contain one as selector code (outside a quoted string or a comment). A branch
 * already containing `&` anywhere (the `disabledState`-style embedded anchor, or an
 * author-written relative branch like `.foo &`) is left untouched, so this is safe to run over a key an author already anchored
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
      return hasNestingSelector(trimmed) ? trimmed : `&${trimmed}`
    })
    .join(', ')
}
