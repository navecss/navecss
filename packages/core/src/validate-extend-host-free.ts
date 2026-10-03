/**
 * `validateExtendAtomsHostFree`: the dependency-free twin of `validateExtendAtoms`
 * (`validate-extend-atoms.ts`), for a host that may import no PostCSS. Same walk and same error
 * text (`validate-extend-walk.ts`). It refuses at least everything the PostCSS-backed validator
 * refuses, and may refuse a few strings that one accepts. Only "does this string parse as exactly
 * the one construct it is meant to be" is answered here, on the core's own CSS Syntax Level 3
 * tokenizer and block reader rather than on PostCSS's parser. Each string is wrapped in the
 * minimal construct it is meant to be, read, and accepted only when the result is exactly that one
 * construct with nothing left over: a `;`, an unbalanced bracket or a stray `}` that would let
 * the text open a second declaration, rule or at-rule leaves something over and is refused.
 */
import type { ExtendMap } from './directive/resolve.ts'
import type { Wrapped } from './validate-extend-scan.ts'
import type { Refusal } from './validate-extend-walk.ts'

import { type Item, matchBrackets, readItem } from './directive/block-reader.ts'
import { tokenize } from './directive/tokenizer.ts'
import { anchorSelectorList } from './selector-utils.ts'
import {
  hasBrokenString,
  hasEscapedCommentOpener,
  hasEscapedWhitespace,
  hasHtmlBreakout,
  hasPaddedComment,
  hasStrayCurlyCloser,
  hasTopLevelColon,
  hasTopLevelComment,
  hasUnstrippedLeadingSpace,
  hasUnstrippedTrailingSpace,
  hasUrl,
  isInert,
  isOnlyInert,
  lastNonWhitespace,
} from './validate-extend-scan.ts'
import { walkExtendAtoms } from './validate-extend-walk.ts'

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
 * Whether PostCSS would read `prop: value` two ways for a reason only the text shows: an escaped
 * comment opener, or an escaped space inside a property name. It fails these structurally (it
 * splits off a comment, or stops at an unknown word), so they are break-outs.
 */
function isReadTwoWays(prop: string, value: string): boolean {
  return (
    hasEscapedCommentOpener(prop) || hasEscapedCommentOpener(value) || hasEscapedWhitespace(prop)
  )
}

/**
 * Whether PostCSS would hand `prop: value` back changed although it reads it as one declaration: a
 * custom property's value keeps a trailing whitespace run out of what it writes back, a `<` that
 * could end a `<style>` element or open an HTML comment is written back escaped, and a space an
 * escape consumed at the end (or a no-break space) stays part of the text.
 */
function isRewrittenByPostcss(prop: string, value: string): boolean {
  if (hasHtmlBreakout(prop) || hasHtmlBreakout(value)) return true
  if (hasUnstrippedTrailingSpace(prop) || hasUnstrippedTrailingSpace(value)) return true
  return prop.startsWith('--') && value !== value.trimEnd()
}

/**
 * Why `prop: value` is not exactly one declaration inside exactly one rule with `prop`
 * unchanged, or `undefined` when it is.
 */
function declarationRefusal(prop: string, value: string): Refusal | undefined {
  if (isReadTwoWays(prop, value)) return 'break-out'
  const sole = readSoleBlockItem(`a{${prop}:${value}}`)
  if (sole?.item.kind !== 'rule') return 'break-out'
  const { blockStart, blockEnd } = sole.item
  if (!isSoleDeclaration(sole.wrapped, blockStart!, blockEnd!, prop)) return 'break-out'
  return isRewrittenByPostcss(prop, value) ? 'rewritten' : undefined
}

/**
 * Why `prop` alone is not a declaration property, whatever value it is paired with, or
 * `undefined`; the placeholder value (`0`) is a neutral token, never itself the reason this
 * fails.
 */
function propRefusal(prop: string): Refusal | undefined {
  return declarationRefusal(prop, '0')
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
 * Why `key` is not exactly one rule with no declarations once anchored, with no trailing comment
 * (PostCSS lifts that out of the selector), or `undefined`. Every refusal here is a break-out.
 */
function selectorRefusal(key: string): Refusal | undefined {
  const selector = anchoredSelector(key)
  if (selector === undefined) return 'break-out'
  const sole = readSoleBlockItem(`${selector}{}`)
  if (sole?.item.kind !== 'rule') return 'break-out'
  const { tokens } = sole.wrapped
  const { blockStart, blockEnd } = sole.item
  const prelude = blockStart! - 1
  const isOneEmptyRule =
    isOnlyInert(tokens, blockStart!, blockEnd!) &&
    tokens[lastNonWhitespace(tokens, 0, prelude)]?.type !== 'comment' &&
    isPreludeUnambiguous(sole.wrapped, 0, prelude)
  return isOneEmptyRule ? undefined : 'break-out'
}

/**
 * Why `condition` is not exactly one `@media`/`@container` at-rule of that name with no body,
 * whose prelude carries no comment PostCSS would lift out of `params`, or `undefined`. A
 * condition that is one such at-rule but starts or ends in a character PostCSS keeps and the
 * trim removes would be written back changed.
 */
function conditionRefusal(atName: 'container' | 'media', condition: string): Refusal | undefined {
  if (hasEscapedCommentOpener(condition)) return 'break-out'
  const sole = readSoleBlockItem(`@${atName} ${condition}{}`)
  if (sole?.item.kind !== 'at-rule' || sole.item.atKeyword !== atName) return 'break-out'
  const { blockStart, blockEnd } = sole.item
  const prelude = blockStart! - 1
  const isOneBodilessRule =
    isOnlyInert(sole.wrapped.tokens, blockStart!, blockEnd!) &&
    !hasTopLevelComment(sole.wrapped, 1, prelude) &&
    isPreludeUnambiguous(sole.wrapped, 1, prelude)
  if (!isOneBodilessRule) return 'break-out'
  const isUntrimmed = hasUnstrippedTrailingSpace(condition) || hasUnstrippedLeadingSpace(condition)
  return isUntrimmed ? 'rewritten' : undefined
}

/**
 * Validates every consumer-supplied atom in `extend` with the core's own tokenizer: the
 * dependency-free counterpart of `validateExtendAtoms`: it refuses everything that one refuses,
 * and may refuse a few strings that one accepts.
 */
export function validateExtendAtomsHostFree(extend: ExtendMap): void {
  walkExtendAtoms(extend, { declarationRefusal, propRefusal, selectorRefusal, conditionRefusal })
}
