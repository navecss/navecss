/**
 * `validateExtendAtomsHostFree`: the dependency-free twin of `validateExtendAtoms`
 * (`validate-extend-atoms.ts`), for a host that may import no PostCSS. Same walk, same refusals,
 * same error text (`validate-extend-walk.ts`); only "does this string parse as exactly the one
 * construct it is meant to be" is answered here, on the core's own CSS Syntax Level 3 tokenizer
 * and block reader rather than on PostCSS's parser. Each string is wrapped in the minimal
 * construct it is meant to be, read, and accepted only when the result is exactly that one
 * construct with nothing left over: a `;`, an unbalanced bracket or a stray `}` that would let
 * the text open a second declaration, rule or at-rule leaves something over and is refused.
 */
import type { ExtendMap } from './directive/resolve.ts'
import type { Token } from './directive/tokenizer.ts'

import { type Item, matchBrackets, readItem } from './directive/block-reader.ts'
import { tokenize } from './directive/tokenizer.ts'
import { anchorSelectorList } from './selector-utils.ts'
import { walkExtendAtoms } from './validate-extend-walk.ts'

interface Wrapped {
  readonly tokens: readonly Token[]
  readonly closerFor: Int32Array
}

/**
 * Whether `token` is whitespace or a comment: never the start of an item.
 */
function isInert(token: Token): boolean {
  return token.type === 'whitespace-token' || token.type === 'comment'
}

/**
 * Whether `tokens[from, to)` holds only whitespace and comments.
 */
function isOnlyInert(tokens: readonly Token[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (!isInert(tokens[i]!)) return false
  return true
}

/**
 * Whether `tokens[from, to)` holds a `}` that closes nothing: PostCSS raises on one ("Unexpected
 * }"), while a stray `)` or `]` it lets through as text, and so does this.
 */
function hasStrayCurlyCloser(wrapped: Wrapped, from: number, to: number): boolean {
  const matchedClosers = new Set(wrapped.closerFor)
  for (let i = from; i < to; i++) {
    if (wrapped.tokens[i]!.type === '}-token' && !matchedClosers.has(i)) return true
  }
  return false
}

/**
 * Whether `tokens[from, to)` holds a comment with whitespace directly before or after it. PostCSS
 * rewrites the text around such a comment when it reads a selector or an at-rule prelude, so the
 * string no longer comes back unchanged and PostCSS refuses it; a comment tight against its
 * neighbours on both sides it leaves alone.
 */
function hasPaddedComment(tokens: readonly Token[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (tokens[i]!.type !== 'comment') continue
    if (tokens[i - 1]?.type === 'whitespace-token' || tokens[i + 1]?.type === 'whitespace-token')
      return true
  }
  return false
}

/**
 * Whether `tokens[from, to)` holds a comment outside every parenthesis pair, which PostCSS lifts
 * out of an at-rule's `params` (one inside a pair stays in the text).
 */
function hasTopLevelComment(wrapped: Wrapped, from: number, to: number): boolean {
  let i = from
  while (i < to) {
    const closer = wrapped.closerFor[i]!
    const type = wrapped.tokens[i]!.type
    if (closer !== -1 && (type === '(-token' || type === 'function-token')) {
      i = closer + 1
      continue
    }
    if (type === 'comment') return true
    i++
  }
  return false
}

/**
 * Whether `tokens[from, to)` holds a string cut off by a line break, or a url the CSS tokenizer
 * cannot close: invalid CSS either way, and one PostCSS reads past while the CSS tokenizer stops,
 * so the two disagree on where it ends. Refused rather than reconciled.
 */
function hasBrokenString(tokens: readonly Token[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (tokens[i]!.type === 'bad-string-token' || tokens[i]!.type === 'bad-url-token') return true
  }
  return false
}

/**
 * Whether `tokens[from, to)` holds an unquoted `url(...)`, which no selector or condition ever
 * carries and which PostCSS reads past a comment opener the CSS tokenizer takes as its content.
 */
function hasUrl(tokens: readonly Token[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (tokens[i]!.type === 'url-token') return true
  return false
}

/**
 * The index of the last token in `tokens[from, to)` that is not whitespace, or `from - 1` when
 * there is none.
 */
function lastNonWhitespace(tokens: readonly Token[], from: number, to: number): number {
  let i = to - 1
  while (i >= from && tokens[i]!.type === 'whitespace-token') i--
  return i
}

/**
 * Whether `tokens[from, to)` holds a `:` outside every parenthesis pair: PostCSS reads a second
 * `word:` inside a value as a declaration whose semicolon went missing and refuses it (a pair of
 * square brackets or braces it does not skip, and neither does this).
 */
function hasTopLevelColon(wrapped: Wrapped, from: number, to: number): boolean {
  let i = from
  while (i < to) {
    const closer = wrapped.closerFor[i]!
    const type = wrapped.tokens[i]!.type
    if (closer !== -1 && (type === '(-token' || type === 'function-token')) {
      i = closer + 1
      continue
    }
    if (wrapped.tokens[i]!.type === 'colon-token') return true
    i++
  }
  return false
}

/**
 * The single top-level item of `text` when it is exactly one item with a `{}` block that closes
 * at the very last token, and `undefined` for anything else (a second item, an unclosed block,
 * text before or after).
 */
function readSoleBlockItem(text: string): { item: Item; wrapped: Wrapped } | undefined {
  const tokens = tokenize(text)
  if (tokens.length === 0 || isInert(tokens[0]!)) return undefined
  const closerFor = matchBrackets(tokens)
  const item = readItem(tokens, 0, tokens.length, closerFor)
  if (item.end !== tokens.length || item.blockStart === undefined) return undefined
  const last = tokens.length - 1
  if (item.blockEnd !== last || tokens[last]!.type !== '}-token') return undefined
  if (closerFor[item.blockStart - 1] !== last) return undefined
  return { item, wrapped: { tokens, closerFor } }
}

/**
 * Whether a declaration's value, `tokens[from, to)`, is one PostCSS would hand back unchanged.
 * It reshapes a trailing comment out of an ordinary value and a trailing whitespace run out of a
 * custom property's, and refuses a top-level colon in an ordinary one; what it accepts, this
 * accepts.
 */
function isValueRoundTrip(wrapped: Wrapped, from: number, to: number, isCustom: boolean): boolean {
  const { tokens } = wrapped
  if (hasBrokenString(tokens, from, to)) return false
  if (isCustom) return true
  const last = lastNonWhitespace(tokens, from, to)
  if (last >= from && tokens[last]!.type === 'comment') return false
  return !hasTopLevelColon(wrapped, from, to)
}

/**
 * Whether the declaration at `tokens[start]` is exactly `prop: value`: the property is one ident
 * token written as `prop`, a colon follows it directly, the item is a declaration that ends at
 * the block's own end without a `;` of its own, nothing but whitespace follows it, and the value
 * survives PostCSS's round trip.
 */
function isSoleDeclaration(wrapped: Wrapped, start: number, end: number, prop: string): boolean {
  const { tokens, closerFor } = wrapped
  const name = tokens[start]
  if (name?.type !== 'ident-token' || name.raw !== prop) return false
  if (tokens[start + 1]?.type !== 'colon-token') return false
  const declaration = readItem(tokens, start, end, closerFor)
  if (declaration.kind !== 'declaration') return false
  if (tokens[declaration.end - 1]!.type === 'semicolon-token') return false
  if (!isOnlyInert(tokens, declaration.end, end)) return false
  return isValueRoundTrip(wrapped, start + 2, end, prop.startsWith('--'))
}

/**
 * Whether `text` holds a backslash-slash-star, which PostCSS and the CSS tokenizer read
 * differently (an escaped slash, or the start of a comment); refused rather than reconciled.
 */
function hasEscapedCommentOpener(text: string): boolean {
  return text.includes(String.raw`\/*`)
}

/**
 * Whether PostCSS would hand `prop: value` back changed for a reason only the text shows: a
 * custom property's value keeps a trailing whitespace run out of its round trip, and an escaped
 * comment opener reads two ways.
 */
function isReshapedByPostcss(prop: string, value: string): boolean {
  if (hasEscapedCommentOpener(prop) || hasEscapedCommentOpener(value)) return true
  return prop.startsWith('--') && value !== value.trimEnd()
}

/**
 * Whether `prop: value` is exactly one declaration inside exactly one rule, with `prop`
 * unchanged.
 */
function isDeclarationValid(prop: string, value: string): boolean {
  if (isReshapedByPostcss(prop, value)) return false
  const sole = readSoleBlockItem(`a{${prop}:${value}}`)
  if (sole?.item.kind !== 'rule') return false
  const { blockStart, blockEnd } = sole.item
  return isSoleDeclaration(sole.wrapped, blockStart!, blockEnd!, prop)
}

/**
 * Whether `prop` alone is a declaration property, whatever value it is paired with; the
 * placeholder value (`0`) is a neutral token, never itself the reason this fails.
 */
function isPropValid(prop: string): boolean {
  return isDeclarationValid(prop, '0')
}

/**
 * Whether a prelude, `tokens[from, to)`, reads the same way to PostCSS as to the CSS tokenizer:
 * no broken string, no unquoted url, no stray `}`, and no comment PostCSS would rewrite the text
 * around.
 */
function isPreludeUnambiguous(wrapped: Wrapped, from: number, to: number): boolean {
  const { tokens } = wrapped
  return (
    !hasPaddedComment(tokens, from, to) &&
    !hasBrokenString(tokens, from, to) &&
    !hasUrl(tokens, from, to) &&
    !hasStrayCurlyCloser(wrapped, from, to)
  )
}

/**
 * `key` anchored the way the nested-rule builders anchor it, or `undefined` when it is not a
 * selector this validator will read: an empty branch, a text that opens as an at-rule, or one that
 * opens like a custom property.
 */
function anchoredSelector(key: string): string | undefined {
  let selector: string
  try {
    selector = anchorSelectorList(key)
  } catch {
    return undefined
  }
  const isUnreadable =
    selector.startsWith('@') || selector.startsWith('--') || hasEscapedCommentOpener(selector)
  return isUnreadable ? undefined : selector
}

/**
 * Whether `key` is exactly one rule with no declarations once anchored, with no trailing comment
 * (PostCSS lifts that out of the selector).
 */
function isSelectorValid(key: string): boolean {
  const selector = anchoredSelector(key)
  if (selector === undefined) return false
  const sole = readSoleBlockItem(`${selector}{}`)
  if (sole?.item.kind !== 'rule') return false
  const { tokens } = sole.wrapped
  const { blockStart, blockEnd } = sole.item
  const prelude = blockStart! - 1
  return (
    isOnlyInert(tokens, blockStart!, blockEnd!) &&
    tokens[lastNonWhitespace(tokens, 0, prelude)]?.type !== 'comment' &&
    isPreludeUnambiguous(sole.wrapped, 0, prelude)
  )
}

/**
 * Whether `condition` is exactly one `@media`/`@container` at-rule of that name with no body,
 * whose prelude carries no comment PostCSS would lift out of `params`.
 */
function isConditionValid(atName: 'container' | 'media', condition: string): boolean {
  if (hasEscapedCommentOpener(condition)) return false
  const sole = readSoleBlockItem(`@${atName} ${condition}{}`)
  if (sole?.item.kind !== 'at-rule' || sole.item.atKeyword !== atName) return false
  const { blockStart, blockEnd } = sole.item
  const prelude = blockStart! - 1
  return (
    isOnlyInert(sole.wrapped.tokens, blockStart!, blockEnd!) &&
    !hasTopLevelComment(sole.wrapped, 1, prelude) &&
    isPreludeUnambiguous(sole.wrapped, 1, prelude)
  )
}

/**
 * Validates every consumer-supplied atom in `extend` with the core's own tokenizer: the
 * dependency-free counterpart of `validateExtendAtoms`, with the same verdicts.
 */
export function validateExtendAtomsHostFree(extend: ExtendMap): void {
  walkExtendAtoms(extend, { isDeclarationValid, isPropValid, isSelectorValid, isConditionValid })
}
