/**
 * The token-level questions `validate-extend-host-free.ts` asks of a wrapped string: where PostCSS
 * and the core's CSS Syntax Level 3 reader would read the same text two ways, so the validator
 * can refuse it rather than reconcile them.
 */
import type { Token } from './directive/tokenizer.ts'

import { tokenize } from './directive/tokenizer.ts'

export interface Wrapped {
  readonly tokens: readonly Token[]
  readonly closerFor: Int32Array
}

/**
 * Whether `token` is whitespace or a comment: never the start of an item.
 */
export function isInert(token: Token): boolean {
  return token.type === 'whitespace-token' || token.type === 'comment'
}

/**
 * Whether `tokens[from, to)` holds only whitespace and comments.
 */
export function isOnlyInert(tokens: readonly Token[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (!isInert(tokens[i]!)) return false
  return true
}

/**
 * Whether `tokens[from, to)` holds a `}` that closes nothing: PostCSS raises on one ("Unexpected
 * }"), while a stray `)` or `]` it lets through as text, and so does this.
 */
export function hasStrayCurlyCloser(wrapped: Wrapped, from: number, to: number): boolean {
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
export function hasPaddedComment(tokens: readonly Token[], from: number, to: number): boolean {
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
export function hasTopLevelComment(wrapped: Wrapped, from: number, to: number): boolean {
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
export function hasBrokenString(tokens: readonly Token[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (tokens[i]!.type === 'bad-string-token' || tokens[i]!.type === 'bad-url-token') return true
  }
  return false
}

/**
 * Whether `tokens[from, to)` holds an unquoted `url(...)` whose content has a comment opener in
 * it: the CSS tokenizer takes that as part of the URL and PostCSS as a comment, so the two
 * disagree on where it ends. Any other unquoted url is read the same way by both.
 */
export function hasUrl(tokens: readonly Token[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (tokens[i]!.type === 'url-token' && tokens[i]!.raw.includes('/*')) return true
  }
  return false
}

/**
 * The index of the last token in `tokens[from, to)` that is not whitespace, or `from - 1` when
 * there is none.
 */
export function lastNonWhitespace(tokens: readonly Token[], from: number, to: number): number {
  let i = to - 1
  while (i >= from && tokens[i]!.type === 'whitespace-token') i--
  return i
}

/**
 * Whether `tokens[from, to)` holds a `:` outside every parenthesis pair: PostCSS reads a second
 * `word:` inside a value as a declaration whose semicolon went missing and refuses it (a pair of
 * square brackets or braces it does not skip, and neither does this).
 */
export function hasTopLevelColon(wrapped: Wrapped, from: number, to: number): boolean {
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
 * Whether `text` holds a backslash-slash-star outside a string, which PostCSS and the CSS
 * tokenizer read differently (an escaped slash, or the start of a comment); refused rather than
 * reconciled.
 */
export function hasEscapedCommentOpener(text: string): boolean {
  // Read as tokens, so one inside a quoted string (where it is plain text to both) is not refused.
  const outsideStrings = tokenize(text)
    .map((token) => (token.type === 'string-token' ? '""' : token.raw))
    .join('')
  return outsideStrings.includes(String.raw`\/*`)
}

/**
 * Whether `text` holds a sequence PostCSS writes back differently so it cannot end a `<style>`
 * element or open an HTML comment: a `<` before `style` or `/style` (any case, at a word
 * boundary), or before `!--`. PostCSS escapes the `<`, so the string no longer comes back unchanged
 * and PostCSS refuses it; the CSS tokenizer reads the same text as ordinary characters.
 */
export function hasHtmlBreakout(text: string): boolean {
  return /<\/?style\b/i.test(text) || text.includes('<!--')
}

/**
 * Whether the last token of `text` that is not CSS whitespace ends in a character `trimEnd()`
 * removes: a space an escape consumed (`\a `, `a\ `), or a character CSS does not count as
 * whitespace at all (a no-break space). PostCSS keeps that character as part of the text, so what
 * it hands back differs from the text trimmed, and it refuses the string.
 */
export function hasUnstrippedTrailingSpace(text: string): boolean {
  const tokens = tokenize(text)
  const last = lastNonWhitespace(tokens, 0, tokens.length)
  const raw = tokens[last]?.raw
  return raw !== undefined && raw !== raw.trimEnd()
}

/**
 * Whether the first token of `text` that is not CSS whitespace starts with a character
 * `trimStart()` removes (a no-break space, say): PostCSS keeps it in an at-rule's prelude, so the
 * prelude differs from the text trimmed, and it refuses the string.
 */
export function hasUnstrippedLeadingSpace(text: string): boolean {
  const tokens = tokenize(text)
  const first = tokens.findIndex((token) => token.type !== 'whitespace-token')
  const raw = tokens[first]?.raw
  return raw !== undefined && raw !== raw.trimStart()
}

/**
 * Whether `text` holds a backslash escape that takes a following whitespace character into
 * itself (`\a `, `a\ b`). The CSS tokenizer reads that as one name, PostCSS ends the name at the
 * space, so a property written this way reads two ways; refused rather than reconciled.
 */
export function hasEscapedWhitespace(text: string): boolean {
  return /\\[\da-f]{0,6}[\t\n\f\r ]/i.test(text)
}
