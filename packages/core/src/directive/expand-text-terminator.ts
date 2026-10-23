/**
 * Where text that must follow a token goes, split out of `expand-text-eof-close.ts`.
 */
import type { Token } from './tokenizer.ts'

/**
 * The offset text that must follow the token at `lastAt` goes at, where `limit` is one past the
 * last token that may be read: after the line break that follows the token when it is a lone
 * backslash, otherwise right after the token itself. Text written between a backslash and its
 * line break would be read as the escaped character.
 */
export function endOfToken(tokens: readonly Token[], lastAt: number, limit: number): number {
  const last = tokens[lastAt]!
  const isLoneBackslash = last.type === 'delim-token' && last.raw === '\\'
  return isLoneBackslash && lastAt + 1 < limit ? tokens[lastAt + 1]!.endIndex : last.endIndex
}
