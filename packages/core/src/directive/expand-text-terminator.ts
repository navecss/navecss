/**
 * The `;` a block's last item may be missing before `expandText()` appends text after it, split
 * out of `expand-text-walk.ts` to keep that file under the project's file-length lint.
 */
import type { Item } from './block-reader.ts'
import type { Token } from './tokenizer.ts'

import { isNaveAtKeyword } from './block-reader.ts'

/**
 * The offset right after the last real token of `item` when `item` has no `;` and text appended
 * after it would be read as more of it, else `undefined`. Appending after `color: red` gives a
 * value `red &:focus-visible { ... }` that the browser drops together with the declaration, so
 * the `;` goes straight after `red`, ahead of any comment or space that follows. A lone
 * backslash is only a token because a line break follows it, so the `;` goes after that line
 * break, where it is not read as an escaped `;`.
 *
 * A rule, or an at-rule with a block, ends in its own `}`. A `@nave` directive is replaced by
 * text that carries its own `;`.
 */
export function unterminatedEnd(
  tokens: readonly Token[],
  item: Item | undefined,
): number | undefined {
  if (item === undefined || item.blockStart !== undefined) return undefined
  if (item.kind === 'at-rule' && isNaveAtKeyword(tokens[item.start]!)) return undefined
  const lastAt = lastRealTokenIndex(tokens, item)
  return tokens[lastAt]!.type === 'semicolon-token'
    ? undefined
    : endOfToken(tokens, lastAt, item.end)
}

/**
 * The index of the last token of `item` that is neither whitespace nor a comment.
 */
function lastRealTokenIndex(tokens: readonly Token[], item: Item): number {
  let i = item.end - 1
  while (
    i > item.start &&
    (tokens[i]!.type === 'whitespace-token' || tokens[i]!.type === 'comment')
  ) {
    i--
  }
  return i
}

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
